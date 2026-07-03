/*
 * integration test for the load-bearing trace_id correlation between OTel spans and
 * evlog wide events
 *
 * architecture under test:
 *   1. opentelemetry() plugin mounted first; establishes the OTel span context in
 *      AsyncLocalStorage on every request via Node's async_hooks ContextManager
 *   2. evlog's loggerPlugin mounted second; its per-request derive reads the active
 *      span via AsyncLocalStorage when constructing the per-request child logger
 *   3. the emitted wide event carries trace context matching the captured OTel span
 *
 * one shared setup because OTel's NodeSDK registers a global TracerProvider; multiple
 * SimpleSpanProcessors don't all plumb in if re-instantiated per test. module-scoped
 * exporter + array; per-test reset of state at the start of each it()
 */

import { describe, it, expect, beforeAll } from "bun:test";
import { Elysia } from "elysia";
import { opentelemetry } from "@elysiajs/opentelemetry";
import { InMemorySpanExporter, SimpleSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { loggerPlugin } from "../elysia-plugin";
import {
  bumpDbQueries,
  bumpFetchCalls,
  recordProcedure,
  recordUserId,
  recordErrorCode,
} from "../request-stats";

const capturedEvents: Record<string, unknown>[] = [];
const memoryExporter = new InMemorySpanExporter();

let app: ReturnType<typeof buildApp>;

function buildApp() {
  /* plugin order matters: opentelemetry() first so AsyncLocalStorage has the span
   * context when evlog's per-request derive runs. without this, trace/log correlation
   * breaks */
  return new Elysia()
    .use(
      opentelemetry({
        serviceName: "test-server",
        spanProcessors: [new SimpleSpanProcessor(memoryExporter)],
      }),
    )
    .use(loggerPlugin())
    .get("/hello", () => ({ ok: true }))
    .get("/stats", () => {
      /* simulates what tracedClient + fetch-tracing + tracedProcedure would
       * contribute over the course of a real tRPC request. lets the wide-event
       * enrichment assertions below run against a known, controlled set of
       * counter/identity inputs instead of needing the full server stack */
      bumpDbQueries();
      bumpDbQueries();
      bumpDbQueries();
      bumpFetchCalls();
      recordProcedure("asset.list");
      recordProcedure("user.me");
      recordUserId("u_test");
      recordErrorCode("UNAUTHORIZED");
      return { ok: true };
    });
}

beforeAll(() => {
  /* global initLogger configures service name + drain. evlog's Elysia plugin reads
   * these via the global logger config rather than per-plugin options */
  initLogger({
    env: { service: "test-server", environment: "test" },
    drain: async (ctx: DrainContext) => {
      capturedEvents.push(ctx.event as Record<string, unknown>);
    },
  });
  app = buildApp();
});

function reset() {
  capturedEvents.length = 0;
  memoryExporter.reset();
}

describe("Elysia + OTel + evlog integration", () => {
  it("a successful request produces at least one captured event AND at least one span", async () => {
    reset();
    const response = await app.handle(new Request("http://localhost/hello"));
    expect(response.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    expect(memoryExporter.getFinishedSpans().length).toBeGreaterThan(0);
  });

  it("the captured wide event carries the service field from initLogger", async () => {
    reset();
    await app.handle(new Request("http://localhost/hello"));
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    const event = capturedEvents[0]! as Record<string, unknown>;
    expect(event.service).toBe("test-server");
  });

  it("emits exactly one wide event per request", async () => {
    reset();
    await app.handle(new Request("http://localhost/hello"));
    await app.handle(new Request("http://localhost/hello"));
    await app.handle(new Request("http://localhost/hello"));
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBe(3);
  });

  it("OTel semconv remap: HTTP fields use http.request.method / url.path / http.response.status_code / duration_ms", async () => {
    reset();
    await app.handle(new Request("http://localhost/hello"));
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    const event = capturedEvents[0]! as Record<string, unknown>;

    // renamed to OTel HTTP semconv v1.27 vocabulary
    expect(event["http.request.method"]).toBe("GET");
    expect(event["url.path"]).toBe("/hello");
    expect(event["http.response.status_code"]).toBe(200);
    expect(typeof event.duration_ms).toBe("number");

    /* original evlog default names must be gone so there's no field duplication.
     * a BS query against either name should not match both */
    expect(event.method).toBeUndefined();
    expect(event.path).toBeUndefined();
    expect(event.status).toBeUndefined();
    expect(event.duration).toBeUndefined();
    expect(event.requestId).toBeUndefined();
  });

  it("load-bearing: captured event carries a trace identifier matching the captured span", async () => {
    reset();
    await app.handle(new Request("http://localhost/hello"));
    await new Promise((r) => setTimeout(r, 50));

    const spans = memoryExporter.getFinishedSpans();
    expect(spans.length).toBeGreaterThan(0);
    expect(capturedEvents.length).toBeGreaterThan(0);

    const rootSpanTraceId = spans[0]!.spanContext().traceId;
    expect(rootSpanTraceId).toMatch(/^[0-9a-f]{32}$/);

    /* evlog may store trace context under different keys depending on version.
     * check the common shapes. the test asserts that at least one of them matches the
     * captured span's trace id. if none match, log/trace correlation is broken and BS
     * can't link the wide event to its trace */
    const event = capturedEvents[0]! as Record<string, unknown>;
    const candidateTraceIds = [
      event.trace_id,
      event.traceId,
      (event.trace as { id?: string } | undefined)?.id,
      (event.context as { traceId?: string } | undefined)?.traceId,
      (event.otel as { trace_id?: string } | undefined)?.trace_id,
    ].filter((v): v is string => typeof v === "string");

    /* if this assertion fails, evlog isn't picking up the OTel span context in its
     * per-request derive. the fix is in evlog's elysia plugin internals or the plugin
     * ordering in buildApp. the failure is "log/trace correlation is broken", not
     * "test is wrong" */
    expect(candidateTraceIds).toContain(rootSpanTraceId);
  });

  it("stamps debug_id from the x-debug-id request header onto the wide event", async () => {
    reset();
    await app.handle(
      new Request("http://localhost/hello", {
        headers: { "x-debug-id": "test-debug-id-123" },
      }),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    expect(capturedEvents[0]!.debug_id).toBe("test-debug-id-123");
  });

  it("caps over-long x-debug-id values at 64 chars so the field can't be amplified", async () => {
    reset();
    const oversized = "X".repeat(10_000);
    await app.handle(
      new Request("http://localhost/hello", { headers: { "x-debug-id": oversized } }),
    );
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    expect((capturedEvents[0]!.debug_id as string).length).toBe(64);
  });

  it("flattens request stats (db/fetch counts, procedures, user_id, error_code) onto the wide event", async () => {
    reset();
    await app.handle(new Request("http://localhost/stats"));
    await new Promise((r) => setTimeout(r, 50));

    expect(capturedEvents.length).toBeGreaterThan(0);
    const event = capturedEvents[0]! as Record<string, unknown>;
    expect(event["db.queries_count"]).toBe(3);
    expect(event["fetch.calls_count"]).toBe(1);
    expect(event["rpc.methods"]).toEqual(["asset.list", "user.me"]);
    expect(event.user_id).toBe("u_test");
    expect(event["rpc.error_code"]).toBe("UNAUTHORIZED");
  });

  it("clears the per-request stats store after the response so post-response bumps don't pollute the next request", async () => {
    reset();
    // request 1 writes 3 db queries via the /stats route
    await app.handle(new Request("http://localhost/stats"));
    await new Promise((r) => setTimeout(r, 50));
    expect(capturedEvents[0]!["db.queries_count"]).toBe(3);

    // request 2 uses the no-counter /hello route; must not inherit the prior store
    reset();
    await app.handle(new Request("http://localhost/hello"));
    await new Promise((r) => setTimeout(r, 50));
    expect(capturedEvents[0]!["db.queries_count"]).toBe(0);
  });
});

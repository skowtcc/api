/* integration tests for the public logger API (initObservability, createLogger,
   createBackgroundLogger). verifies:
     - the info/warn/error/debug surface routes through the configured drain
     - the namespace field threads through every event from a given logger
     - service tagging propagates as `service` on every event
     - background-logger applies the `service: "skowt-server.background"` override

   each test resets the captured drain between runs. initObservability is idempotent,
   so initLogger is re-called directly per test to inject a fresh capturing drain */

import { describe, it, expect, beforeEach } from "bun:test";
import { initLogger } from "evlog";
import type { DrainContext } from "evlog";
import { createLogger, createBackgroundLogger } from "../logger";

const captured: Record<string, unknown>[] = [];

beforeEach(() => {
  captured.length = 0;
  initLogger({
    env: { service: "skowt-server", environment: "test" },
    drain: async (ctx: DrainContext) => {
      captured.push(ctx.event as Record<string, unknown>);
    },
  });
});

describe("createLogger", () => {
  it("info() emits an event through the configured drain", async () => {
    const log = createLogger("test-namespace");
    log.info("hello world", { user_id: "u1" });

    // give the drain a tick to settle. evlog may emit synchronously but drain is async
    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBeGreaterThan(0);
    const event = captured[0]!;
    expect(event.message).toBe("hello world");
    expect(event.user_id).toBe("u1");
    expect(event.namespace).toBe("test-namespace");
  });

  it("warn(), error(), debug() all route through the same drain", async () => {
    const log = createLogger("severity-test");
    log.warn("warning msg");
    log.error("error msg");
    log.debug("debug msg");

    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBeGreaterThanOrEqual(3);
    const messages = captured.map((e) => e.message);
    expect(messages).toContain("warning msg");
    expect(messages).toContain("error msg");
    expect(messages).toContain("debug msg");
  });

  it("the service field from initLogger propagates to every event", async () => {
    const log = createLogger("svc-test");
    log.info("a");
    log.info("b");

    await new Promise((r) => setTimeout(r, 10));

    for (const event of captured) {
      expect(event.service).toBe("skowt-server");
    }
  });

  it("baseContext fields thread into every emitted event", async () => {
    const log = createLogger("context-test", { user_id: "u-base", session_id: "s-base" });
    log.info("first");
    log.warn("second");

    await new Promise((r) => setTimeout(r, 10));

    for (const event of captured) {
      expect(event.user_id).toBe("u-base");
      expect(event.session_id).toBe("s-base");
      expect(event.namespace).toBe("context-test");
    }
  });

  it("per-call context overrides baseContext via spread order", async () => {
    const log = createLogger("override-test", { region: "us-east" });
    log.info("a", { region: "eu-west" });

    await new Promise((r) => setTimeout(r, 10));

    const event = captured[0]!;
    expect(event.region).toBe("eu-west");
  });
});

describe("createBackgroundLogger service override", () => {
  it("emits events with service = skowt-server.background (not the default)", async () => {
    const log = createBackgroundLogger("discord_profile_refresh", { job_id: "job-1" });
    log.set({ duration_ms: 42 });
    log.emit();

    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBeGreaterThan(0);
    const event = captured[0]!;
    expect(event.service).toBe("skowt-server.background");
    expect(event.job_name).toBe("discord_profile_refresh");
    expect(event.job_id).toBe("job-1");
    expect(event.duration_ms).toBe(42);
  });

  it("namespace defaults to 'background'", async () => {
    const log = createBackgroundLogger("any_job");
    log.emit();

    await new Promise((r) => setTimeout(r, 10));

    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0]!.namespace).toBe("background");
  });
});

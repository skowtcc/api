/*
 * elysia request plugin
 *
 * wraps evlog's first-party Elysia integration with three responsibilities:
 *
 *   1. open the per-request AsyncLocalStorage counter context (via onRequest)
 *      so tracedClient / fetch-tracing can bump db.queries_count and
 *      fetch.calls_count without needing a request object reference. read back
 *      in enrich at request end and stamped on the wide event for cheap N+1
 *      and runaway-fetch detection in the BS Logs Explorer.
 *
 *   2. bridge OTel span context into the wide event. evlog doesn't auto-pick
 *      up the active OTel span from AsyncLocalStorage, so we set trace_id /
 *      span_id explicitly here. also stamps debug_id (from the x-debug-id
 *      header) on both the wide event and the active root span so a single
 *      user-supplied debug ID lets support find both the logs and the traces
 *      for that user's recent requests.
 *
 *   3. remap evlog's default HTTP field names to OTel HTTP semantic conventions
 *      v1.27. evlog ships with `method` / `path` / `status` / `requestId`;
 *      OTel HTTP semconv uses `http.request.method` / `url.path` /
 *      `http.response.status_code` / a numeric `duration_ms`. we rename in
 *      place so BS queries written against OTel-standard vocabulary work
 *      uniformly across the logs source (wide events) and the OTel source.
 *
 * evlog's plugin already handles:
 *   - one wide event per request
 *   - auto-emit on response complete
 *   - per-request logger construction via Elysia .derive()
 *
 * mounting requirement: mount after @elysiajs/opentelemetry's plugin so the
 * span context is in AsyncLocalStorage when the per-request derive runs.
 * apps/server/src/index.ts enforces this ordering at the .use() call sites
 */

import { Elysia } from "elysia";
import { evlog, useLogger as evlogUseLogger } from "evlog/elysia";
import type { EnrichContext } from "evlog";
import { trace, TraceFlags } from "@opentelemetry/api";
import {
  beginRequestStats,
  endRequestStats,
  getRequestStats,
  recordDebugId,
} from "./request-stats";
import { assertTraceIdPresent } from "./otel";

const INVALID_TRACE_ID = "00000000000000000000000000000000";

const DEBUG_ID_HEADER = "x-debug-id";
/*
 * hard cap on the user-controlled debug_id value (see packages/api/src/context.ts
 * for rationale). UUIDs are 36 chars; 64 leaves headroom and bounds the
 * per-span attribute size + wide event row size against amplification
 */
const DEBUG_ID_MAX = 64;

function safeDebugId(value: string | undefined): string | undefined {
  return value ? value.slice(0, DEBUG_ID_MAX) : undefined;
}

/**
 * remap evlog's default HTTP field names to OTel HTTP semantic conventions v1.27.
 *
 * source field (evlog default) -> target field (OTel semconv):
 *   method     -> http.request.method
 *   path       -> url.path
 *   status     -> http.response.status_code   (kept as number)
 *   requestId  -> request_id                  (snake_case alignment)
 *   duration   -> duration_ms                 (parsed to number when in "147ms" form)
 *
 * source fields are deleted after rename so there's no duplication. fields
 * already in the target form (e.g. trace_id from the OTel bridge above) are untouched.
 */
function remapHttpFieldsToOtelSemconv(event: Record<string, unknown>): void {
  if (typeof event.method === "string") {
    event["http.request.method"] = event.method;
    delete event.method;
  }
  if (typeof event.path === "string") {
    event["url.path"] = event.path;
    delete event.path;
  }
  if (typeof event.status === "number") {
    event["http.response.status_code"] = event.status;
    delete event.status;
  }
  if (typeof event.requestId === "string") {
    event.request_id = event.requestId;
    delete event.requestId;
  }
  if (typeof event.duration === "string") {
    /* evlog emits durations as e.g. "147ms". parse to a number so dashboards
     * can average/p95 directly. drop the original string field after parse */
    const match = event.duration.match(/^(\d+(?:\.\d+)?)\s*ms$/);
    if (match) event.duration_ms = parseFloat(match[1]!);
    delete event.duration;
  }
}

/**
 * the Elysia plugin that emits one wide event per request, enriched with OTel
 * trace context, OTel HTTP semconv field names, per-request counters, and
 * identity fields (debug_id, user_id, procedures).
 *
 * mount after @elysiajs/opentelemetry's plugin or trace_id will be undefined.
 */
export function loggerPlugin() {
  return new Elysia({ name: "@skowt-monorepo/observability/logger" })
    .onRequest(({ request }) => {
      /*
       * open the AsyncLocalStorage counter context before the handler chain runs
       * so every tracedClient / fetch-tracing bump downstream lands in this
       * request's store. enterWith (not run) lets later Elysia hooks see the
       * same store without callback wrapping
       */
      beginRequestStats();

      /*
       * stamp debug_id on the active root span at request start so the trace
       * is searchable by debug_id in BS as soon as it lands. child spans
       * inherit trace_id, so filtering at the root is enough to find the full
       * trace tree for a given user-reported ID. also push into request-stats
       * so reportError can attach it to error events without walking the span
       */
      const debugId = safeDebugId(request.headers.get(DEBUG_ID_HEADER) ?? undefined);
      if (debugId) {
        trace.getActiveSpan()?.setAttribute("debug_id", debugId);
        recordDebugId(debugId);
      }
    })
    .use(
      evlog({
        enrich: (ctx: EnrichContext) => {
          const event = ctx.event as Record<string, unknown>;

          /*
           * bridge OTel span context into the wide event so logs/traces correlate in BS UI.
           * skip the all-zero trace_id sentinel (returned when no real OTel
           * provider is registered, e.g. local dev without BS tokens). otherwise
           * every dev wide event ships with the same fake trace_id and pollutes
           * the BS index. fires the dev-warn-once helper to catch middleware
           * mount-order regressions locally
           */
          const span = trace.getActiveSpan();
          if (span) {
            const sc = span.spanContext();
            const hasRealTraceId =
              sc.traceFlags !== TraceFlags.NONE && sc.traceId !== INVALID_TRACE_ID;
            if (hasRealTraceId) {
              event.trace_id = sc.traceId;
              event.span_id = sc.spanId;
            }
            assertTraceIdPresent(hasRealTraceId ? sc.traceId : undefined);
          }

          // rename evlog's default HTTP field names to OTel HTTP semconv v1.27
          remapHttpFieldsToOtelSemconv(event);

          /*
           * identity fields from the request: debug_id always when sent,
           * user_id only when a procedure in this request had an authed session
           * (set via recordUserId from the tRPC tracing middleware)
           */
          const debugId = safeDebugId(ctx.headers?.[DEBUG_ID_HEADER]);
          if (debugId) event.debug_id = debugId;

          /*
           * counters + procedure list captured during request handling. reading
           * through getRequestStats keeps this read defensive against requests
           * that bypass the onRequest hook (e.g. internal Elysia subrouters)
           */
          const stats = getRequestStats();
          if (stats) {
            event["db.queries_count"] = stats.dbQueries;
            event["fetch.calls_count"] = stats.fetchCalls;
            if (stats.procedures.length > 0) {
              /*
               * OTel + BS accept array string attributes; one row, all the
               * procedures invoked by a batched request, no need to join the
               * trace to see which procedures fired
               */
              event["rpc.methods"] = stats.procedures;
            }
            if (stats.userId) event.user_id = stats.userId;
            if (stats.errorCode) event["rpc.error_code"] = stats.errorCode;
          }
        },
      }),
    )
    .onAfterResponse(() => {
      /*
       * drop the per-request stats store after the wide event has shipped so
       * any fire-and-forget background work spawned during the handler chain
       * (`void doThing()`, queueMicrotask, setImmediate) inherits the cleared
       * state and its counter bumps no-op. without this, post-response bumps
       * accumulate silently on a request whose event already shipped
       */
      endRequestStats();
    });
}

/*
 * re-export useLogger for handlers that need to add context from deep call stacks
 * (e.g., inside helpers called from a tRPC procedure)
 */
export const useLogger = evlogUseLogger;

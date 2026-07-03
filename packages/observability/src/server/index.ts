/*
 * server entry point for @skowt-monorepo/observability
 *
 * public API:
 *   - initObservability(): call once at server bootstrap to configure drains + service name
 *   - createLogger(namespace): create a scoped logger for a component
 *   - createBackgroundLogger(jobName): create a logger for fire-and-forget background work
 *   - loggerPlugin: Elysia plugin that emits one wide event per HTTP request
 *   - useLogger: access the current request's logger from deep call stacks
 *
 * Bun-only. the "browser": null entry in package.json exports map prevents this
 * from being bundled into apps/web client output (browser bundlers refuse to
 * resolve a `null` target, failing the build loudly if the server module ever
 * leaks into a browser bundle)
 */

export { initObservability, createLogger, createBackgroundLogger } from "./logger";

export { loggerPlugin, useLogger } from "./elysia-plugin";

export {
  createOtelPlugin,
  getCurrentSpan,
  assertTraceIdPresent,
  wrapInSpan,
  shutdownOtel,
  SpanStatusCode,
} from "./otel";

export { initFetchTracing } from "./fetch-tracing";
export { patchIORedisPrototype } from "./redis-tracing";

export {
  beginRequestStats,
  endRequestStats,
  getRequestStats,
  bumpDbQueries,
  bumpFetchCalls,
  recordProcedure,
  recordUserId,
  recordDebugId,
  recordErrorCode,
} from "./request-stats";
export type { RequestStats } from "./request-stats";

export { reportError } from "./error-reporting";
export type { ReportErrorContext } from "./error-reporting";

// re-export core primitives so callers don't have to import from two places
export { Redacted, isRedacted } from "../core/redacted";
export { ATTRIBUTES } from "../core/attributes";

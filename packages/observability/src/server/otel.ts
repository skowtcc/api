/*
 * OTel trace plugin for Elysia
 *
 * wraps @elysiajs/opentelemetry with our BS-specific configuration:
 *   - service name "skowt-server"
 *   - OTLP HTTP exporter targeting Better Stack's /v1/traces endpoint
 *   - bearer authentication via the BS source token
 *
 * returns the configured Elysia plugin. mount it in apps/server/src/index.ts
 * before the evlog loggerPlugin so AsyncLocalStorage has the span context when
 * the per-request child logger is constructed. middleware ordering is load-bearing
 *
 * when no BS token is provided (dev / test), returns undefined and the caller
 * skips mounting. traces aren't collected in dev unless explicitly enabled
 */

import { opentelemetry, record } from "@elysiajs/opentelemetry";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { trace, SpanStatusCode } from "@opentelemetry/api";

/*
 * re-export so consumers (packages/api tRPC middleware, etc.) can set span
 * status without adding @opentelemetry/api as a direct dependency
 */
export { SpanStatusCode };

/**
 * wrap an async operation in an OTel span.
 *
 * the span auto-closes when `fn` resolves or rejects; errors are recorded on
 * the span as exceptions before being re-thrown. two usage patterns:
 *
 *   - framework instrumentation at well-defined boundaries (tRPC procedure,
 *     libsql query, outbound fetch). systematic and lives alongside the
 *     boundary code (packages/api tracingMiddleware, packages/db tracedClient,
 *     packages/observability fetch-tracing).
 *
 *   - ad-hoc named operations the dashboard needs as first-class entries
 *     (currently refreshDiscordProfile, S3 PUT). add new ones sparingly:
 *     prefer enriching an existing framework span via getCurrentSpan() over
 *     adding more bespoke wrapInSpan calls
 */
export { record as wrapInSpan };

interface OtelOptions {
  /** service name. defaults to "skowt-server" */
  serviceName?: string;
  /**
   * BS OTel-source token (not the logs-source token; they're separate, per the
   * spike in scripts/spike). pass from env.BETTERSTACK_OTEL_TOKEN. when absent, returns
   * undefined and the caller skips mounting the plugin (no traces sent)
   */
  otelToken?: string;
  /**
   * BS OTel-source per-source endpoint URL (e.g. https://s<id>.<region>.betterstackdata.com).
   * pass from env.BETTERSTACK_OTEL_ENDPOINT. the legacy generic OTLP host
   * (https://in-otel.logs.betterstack.com) returns 401 against current BS UI
   * sources. always use the per-source URL
   */
  otelEndpoint?: string;
}

/**
 * build the @elysiajs/opentelemetry plugin pre-configured for Better Stack.
 *
 * returns undefined when otelToken or otelEndpoint is absent; caller skips
 * .use() in that case
 */
export function createOtelPlugin(options: OtelOptions = {}) {
  if (!options.otelToken || !options.otelEndpoint) return undefined;

  const exporter = new OTLPTraceExporter({
    url: `${options.otelEndpoint}/v1/traces`,
    headers: {
      Authorization: `Bearer ${options.otelToken}`,
    },
  });

  return opentelemetry({
    serviceName: options.serviceName ?? "skowt-server",
    /*
     * per-request span count went from ~1 to 20-50 once tRPC/libsql/redis/fetch
     * instrumentation landed. default maxQueueSize=2048 + scheduledDelayMillis=5000
     * means the queue saturates at ~50 req/s and BatchSpanProcessor silently
     * drops spans (only diag.debug). explicit config sized for steady traffic
     */
    spanProcessors: [
      new BatchSpanProcessor(exporter, {
        maxQueueSize: 8192,
        maxExportBatchSize: 1024,
        scheduledDelayMillis: 2000,
        exportTimeoutMillis: 30000,
      }),
    ],
    /*
     * no auto-instrumentations. @opentelemetry/instrumentation-ioredis was
     * dropped because Bun's runtime doesn't reliably fire the
     * import-in-the-middle hooks the package depends on (empirically
     * zero redis spans landed in BS despite the instrumentation being wired
     * up). Redis is now instrumented via packages/observability's
     * patchIORedisPrototype helper, called from packages/api/lib/redis.ts
     * after the dynamic import. same Bun-native pattern as the libsql
     * tracedClient wrapper and the globalThis.fetch monkey-patch
     */
  });
}

/**
 * best-effort flush of OTel spans on graceful shutdown. called from the
 * server's SIGTERM/SIGINT handlers before process.exit so the last few seconds
 * of spans before a deploy or autoscaler kill reach Better Stack instead of
 * being silently dropped from the in-memory BatchSpanProcessor queue. bounded
 * by a timeout so a slow or unreachable exporter can't block shutdown
 * indefinitely.
 *
 * the active TracerProvider may be a NoopTracerProvider (when OTel was never
 * configured, e.g. local dev without BS tokens). those don't expose shutdown(),
 * so we feature-detect and no-op safely
 */
export async function shutdownOtel(timeoutMs = 5000): Promise<void> {
  const provider = trace.getTracerProvider() as { shutdown?: () => Promise<void> };
  if (typeof provider.shutdown !== "function") return;
  await Promise.race([
    provider.shutdown(),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

/**
 * return the currently active OTel span, or undefined when called outside any request.
 *
 * use this when you need to enrich the request span with caller-specific
 * context that isn't available at request entry. for example, a tRPC middleware
 * narrowing the wildcard `/trpc/*` route to the resolved procedure path, or an
 * auth route handler stamping the matched sub-path on the active span.
 *
 * mutating attribute / name calls on the returned span only affect the *active*
 * span (typically the Elysia request span). use `wrapInSpan` instead when you
 * want to create a new child span around an operation (e.g., a DB query or an
 * S3 PUT)
 */
export function getCurrentSpan() {
  return trace.getActiveSpan();
}

/**
 * dev-only assertion that warns once per process if a log is emitted with no
 * trace_id while an OTel span context exists. catches middleware-ordering
 * regressions locally. the failure mode: loggerPlugin mounted before
 * opentelemetry().
 *
 * production should add a prod-side counter (BS-side query alarm on
 * `service == "skowt-server" AND http.request.method != null AND trace_id == null`)
 * to catch deployed regressions. not yet wired up
 */
let _warnedOnce = false;
export function assertTraceIdPresent(traceId: string | undefined): void {
  if (process.env.NODE_ENV === "production") return;
  if (_warnedOnce) return;
  const span = trace.getActiveSpan();
  if (span && !traceId) {
    _warnedOnce = true;
    process.stderr.write(
      "[observability] WARNING: log emitted with trace_id=undefined " +
        "while an OTel span context exists. Middleware ordering may be wrong: " +
        "ensure opentelemetry() is mounted before loggerPlugin() in apps/server.\n",
    );
  }
}

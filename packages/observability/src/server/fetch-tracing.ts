import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";
import { bumpFetchCalls } from "./request-stats";

/*
 * patch globalThis.fetch once so every outbound HTTP call emits an OTel CLIENT
 * span with HTTP semconv v1.27 attributes.
 *
 * why this exists: @opentelemetry/instrumentation-undici doesn't work under Bun.
 * Bun's fetch is native (Zig) and doesn't emit the diagnostics_channel events
 * undici-instrumentation listens for. patching globalThis.fetch is the only
 * path that captures outbound HTTP under Bun.
 *
 * captured attributes (OTel HTTP client semconv v1.27):
 *   http.request.method       -> "GET" | "POST" | ...
 *   url.full                  -> full URL string
 *   server.address            -> host (parsed from URL; omitted on parse failure)
 *   http.response.status_code -> response status, success path only
 *   error.type                -> thrown error name, error path only
 *
 * request/response bodies and headers are not recorded. bodies are PII-risky
 * and headers (especially Authorization) leak credentials. if a callsite needs
 * header-aware spans, use wrapInSpan around that specific call instead
 */

const TRACER_NAME = "@skowt-monorepo/observability/fetch";

/*
 * default timeout for outbound fetches that don't carry their own AbortSignal.
 * Bun's native fetch has no default timeout, so a hung upstream (TCP connect
 * succeeds but server never responds) keeps the span open indefinitely and
 * the BatchSpanProcessor's tracked-active-spans table grows linearly until
 * OOM. 30s is conservative for production HTTP calls (Discord OAuth profile
 * refresh, S3 PUT, etc. all complete well under this in normal operation).
 * callers that legitimately need longer waits should pass an explicit signal
 */
const DEFAULT_FETCH_TIMEOUT_MS = 30_000;

/*
 * symbol stamped on the patched function so HMR / repeated initFetchTracing
 * calls don't double-wrap. a module-scoped boolean would reset on hot reload
 * while globalThis.fetch stays patched. the second pass would then capture
 * the wrapper as "originalFetch" and emit nested duplicate spans per call
 */
const PATCHED_MARKER: unique symbol = Symbol.for("@skowt-monorepo/observability/fetch:patched");
type Marked = { [PATCHED_MARKER]?: true };

export function initFetchTracing(): void {
  if ((globalThis.fetch as Marked)[PATCHED_MARKER]) return;

  const originalFetch = globalThis.fetch;

  const tracedFetch = async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): Promise<Response> => {
    /*
     * method: explicit init.method wins; otherwise pull from input.method when
     * input is a Request-like object; otherwise default to GET. the duck-typed
     * check avoids `instanceof Request`, which would require DOM lib in every
     * workspace that transitively imports this file
     */
    const method = (
      init?.method ??
      (typeof input === "object" && input !== null && "method" in input
        ? String((input as { method?: unknown }).method ?? "GET")
        : "GET")
    ).toUpperCase();

    const rawUrl =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : (input as { url: string }).url;

    /*
     * strip userinfo (https://user:pass@host/) before stamping url.full so
     * accidental embedded credentials don't ship to Better Stack. falls back
     * to the raw string when URL parsing fails (non-absolute or malformed)
     */
    let urlStr = rawUrl;
    let host: string | undefined;
    try {
      const parsed = new URL(rawUrl);
      host = parsed.host;
      if (parsed.username || parsed.password) {
        parsed.username = "";
        parsed.password = "";
        urlStr = parsed.toString();
      }
    } catch {
      // non-absolute or malformed URL: omit server.address rather than guess
    }

    bumpFetchCalls();

    /*
     * apply the default timeout only when the caller didn't pass their own
     * signal. AbortSignal.timeout(ms) aborts after the deadline; combined
     * with the wrapper's catch arm that treats AbortError as control flow
     * (no recordException), an upstream hang produces a span that ends
     * cleanly at the timeout rather than leaking
     */
    const callInit: RequestInit | undefined = init?.signal
      ? init
      : { ...init, signal: AbortSignal.timeout(DEFAULT_FETCH_TIMEOUT_MS) };

    /*
     * re-resolve the tracer on every call: when initFetchTracing runs before
     * the OTel SDK is started (typical bootstrap order), an early reference
     * would be locked to the no-op tracer and never upgrade once the real
     * provider registers. per-call lookup is one map hit
     */
    const tracer = trace.getTracer(TRACER_NAME);

    return tracer.startActiveSpan(
      method,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          "http.request.method": method,
          "url.full": urlStr,
          ...(host ? { "server.address": host } : {}),
        },
      },
      async (span) => {
        try {
          const response = await originalFetch(input, callInit);
          span.setAttribute("http.response.status_code", response.status);
          /*
           * OTel HTTP client semconv: only 5xx is ERROR on the client side.
           * 4xx is the caller's problem. 401/403/404 from auth probes are
           * normal flow and shouldn't pollute BS's error-rate dashboard
           */
          if (response.status >= 500) {
            span.setStatus({ code: SpanStatusCode.ERROR });
          }
          return response;
        } catch (err) {
          const error = err as Error;
          /*
           * AbortError is control flow (caller-supplied AbortSignal, user
           * closed tab, timeout fired). don't pollute the error stream;
           * leave status UNSET and skip recordException
           */
          if (error.name !== "AbortError") {
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message,
            });
            span.setAttribute("error.type", error.name || "Error");
          }
          throw err;
        } finally {
          span.end();
        }
      },
    );
  };

  /*
   * forward Bun's native fetch statics (e.g. `preconnect`) onto the wrapper,
   * including non-enumerable ones. Object.assign would silently drop them
   * because native function properties are typically non-enumerable.
   * the cast is needed because TS can't statically confirm the merged shape
   * matches `typeof fetch`; it does at runtime
   */
  for (const key of Reflect.ownKeys(originalFetch)) {
    if (key === "length" || key === "name" || key === "prototype") continue;
    const descriptor = Object.getOwnPropertyDescriptor(originalFetch, key);
    if (descriptor) Object.defineProperty(tracedFetch, key, descriptor);
  }
  (tracedFetch as Marked)[PATCHED_MARKER] = true;
  globalThis.fetch = tracedFetch as typeof fetch;
}

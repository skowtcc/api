import { createHash } from "node:crypto";
import { trace, SpanStatusCode } from "@opentelemetry/api";
import { createLogger } from "./logger";
import { getRequestStats } from "./request-stats";

/*
 * single entry point for unexpected error reporting. used from tRPC's
 * errorFormatter (INTERNAL_SERVER_ERROR path), the global
 * uncaughtException/unhandledRejection handlers, and any deep callsite that
 * catches an error it can't recover from but wants visibility on.
 *
 * output is a single `level: error` log event with a stable shape that BS
 * alert rules can query against:
 *
 *   error.type        -> the Error class name (TypeError, TRPCError, ...)
 *   error.message     -> the message string
 *   error.stack       -> the raw stack trace
 *   error.fingerprint -> 16-char hex hash of (name + first 3 normalized stack
 *                        frames). groups recurring errors so a single BS alert
 *                        rule can `error.fingerprint = X` to find every
 *                        occurrence of the same root cause regardless of
 *                        message variance.
 *
 * correlation fields are pulled automatically from the active request:
 *
 *   trace_id / span_id    -> from the active OTel span context
 *   user_id / debug_id    -> from the request-stats ALS store
 *   rpc.methods           -> the tRPC procedures this request invoked
 *
 * all optional. when reportError fires outside any request (background job,
 * boot-time, uncaughtException with no live request) the missing fields are
 * simply omitted
 */

const errorLogger = createLogger("error-report");

const STACK_FRAME_LINE = /^\s*at\s/;

/*
 * stable 16-char fingerprint for grouping recurring errors. hash inputs:
 *   - error.name (class)
 *   - first 3 stack frames with absolute paths normalized to basenames
 *
 * the 3-frame ceiling protects against fingerprint drift from deep call
 * stacks where mid-stack churn (e.g. wrapper functions changing) would
 * otherwise create N different fingerprints for the same root cause
 */
function fingerprintError(err: Error): string {
  const frames = (err.stack ?? "")
    .split("\n")
    .filter((l) => STACK_FRAME_LINE.test(l))
    .slice(0, 3)
    .map((line) => line.replace(/file:\/\/[^\s)]+/g, (m) => m.split("/").pop() ?? m))
    .join("|");
  return createHash("sha256").update(`${err.name}|${frames}`).digest("hex").slice(0, 16);
}

function toError(value: unknown): Error {
  if (value instanceof Error) return value;
  if (typeof value === "string") return new Error(value);
  try {
    return new Error(JSON.stringify(value));
  } catch {
    return new Error("non-serializable thrown value");
  }
}

export interface ReportErrorContext {
  /** optional context fields stamped on the event. flat key/value, BS-queryable. */
  [key: string]: unknown;
}

/*
 * report an unexpected error. stamps the active OTel span (if any) with the
 * exception + ERROR status, then emits a structured `level: error` log event
 * with auto-correlated request context.
 *
 * use only for *unexpected* errors. known user-facing failures (UNAUTHORIZED,
 * BAD_REQUEST, NOT_FOUND, etc.) are not errors in the ops sense and should
 * not page anyone. the tRPC errorFormatter filters by error code to enforce
 * this distinction
 */
export function reportError(value: unknown, context?: ReportErrorContext): void {
  const error = toError(value);

  /*
   * stamp the active span so the trace view shows the exception. safe when
   * no span is active (background/boot); getActiveSpan returns undefined
   */
  const span = trace.getActiveSpan();
  if (span) {
    span.recordException(error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
  }

  // pull correlation IDs from the active request, where present
  const sc = span?.spanContext();
  const stats = getRequestStats();

  errorLogger.error(error.message, {
    "error.type": error.name,
    "error.message": error.message,
    "error.stack": error.stack,
    "error.fingerprint": fingerprintError(error),
    ...(sc ? { trace_id: sc.traceId, span_id: sc.spanId } : {}),
    ...(stats?.userId ? { user_id: stats.userId } : {}),
    ...(stats?.debugId ? { debug_id: stats.debugId } : {}),
    ...(stats && stats.procedures.length > 0 ? { "rpc.methods": stats.procedures } : {}),
    ...context,
  });
}

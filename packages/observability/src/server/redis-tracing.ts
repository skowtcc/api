import { trace, SpanStatusCode } from "@opentelemetry/api";
import { bumpDbQueries } from "./request-stats";

/*
 * explicit Redis prototype patcher, replacing @opentelemetry/instrumentation-ioredis.
 * the official instrumentation relies on require-in-the-middle / import-in-the-middle
 * hooks that Bun's runtime does not reliably fire for ESM. BS confirmed zero
 * `db.system:redis` spans across the whole data window after the instrumentation
 * was wired up the official way.
 *
 * approach: after the caller has dynamically imported ioredis, and after the OTel
 * SDK has started so the active TracerProvider is real, call patchIORedisPrototype(Redis)
 * once. this patches Redis.prototype.sendCommand directly. that's the same internal
 * method the official instrumentation patches, but synchronously and deterministically,
 * no require hooks.
 *
 * attributes follow OTel db semconv. emits both v1.27 (current) and v1.16 (still in
 * spec; BS dashboards and most tooling key off the older names) for downstream
 * compatibility
 */

const TRACER_NAME = "@skowt-monorepo/observability/redis";

const PATCHED_MARKER: unique symbol = Symbol.for("@skowt-monorepo/observability/redis:patched");
type MarkedRedisCtor = { prototype: { [PATCHED_MARKER]?: true } };

/*
 * monkey-patch glue: ioredis's real sendCommand takes a Command instance with
 * 20+ required fields, but the runtime only reads `cmd?.name`. function
 * parameters are contravariant so a precise type here would refuse the actual
 * ioredis class as an argument (the source of TS2345 at the patch call sites).
 * any-typed args keep the patch site assignable; the runtime narrows where it
 * matters
 */
type SendCommandFn = (this: any, cmd: any, ...rest: any[]) => unknown;
type ThenableLike = { then: (resolve: () => unknown, reject: (err: Error) => unknown) => unknown };
type ResultWithPromise = { promise?: ThenableLike };

function isThenable(v: unknown): v is ThenableLike {
  return typeof v === "object" && v !== null && typeof (v as ThenableLike).then === "function";
}

/*
 * patch the ioredis Redis constructor's prototype.sendCommand so every command
 * emits a span. idempotent via a Symbol marker on the prototype: calling twice
 * (HMR, repeated boot, test re-import) is a no-op.
 *
 * span shape:
 *   name        -> `redis.<command>` (lowercased command, e.g. `redis.get`)
 *   db.system   -> "redis"  (v1.16) + `db.system.name`   (v1.27)
 *   db.operation -> "GET"   (v1.16) + `db.operation.name` (v1.27)
 *
 * preserves the call's return type (sync, Promise, or Command-with-promise) so
 * ioredis's internal pipeline/multi handling continues to work unchanged
 */
export function patchIORedisPrototype(RedisCtor: {
  prototype: { sendCommand: SendCommandFn };
}): void {
  const marked = RedisCtor as unknown as MarkedRedisCtor;
  if (marked.prototype[PATCHED_MARKER]) return;
  marked.prototype[PATCHED_MARKER] = true;

  const original = RedisCtor.prototype.sendCommand;

  RedisCtor.prototype.sendCommand = function (this: any, cmd: any, ...rest: any[]) {
    const cmdName = (cmd?.name ?? "unknown").toLowerCase();
    const cmdNameUpper = cmdName.toUpperCase();
    bumpDbQueries();

    const tracer = trace.getTracer(TRACER_NAME);
    const span = tracer.startSpan(`redis.${cmdName}`, {
      attributes: {
        "db.system.name": "redis",
        "db.system": "redis",
        "db.operation.name": cmdNameUpper,
        "db.operation": cmdNameUpper,
      },
    });

    let result: unknown;
    try {
      /*
       * forward all args (cmd + optional stream) so pipeline / multi paths
       * that rely on the second arg behave identically to the unpatched
       * ioredis implementation
       */
      result = original.call(this, cmd, ...rest);
    } catch (err) {
      const error = err as Error;
      span.recordException(error);
      span.setStatus({ code: SpanStatusCode.ERROR, message: error.message });
      span.end();
      throw err;
    }

    /*
     * ioredis returns one of three shapes depending on version + command:
     *  - a Promise (modern API)
     *  - a Command-like object whose `promise` is a thenable (older internals)
     *  - a synchronous value (rare, for pipeline staging)
     * branch on each so the span end-time tracks the real completion
     */
    if (isThenable(result)) {
      result.then(
        () => span.end(),
        (err: Error) => {
          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
          span.end();
        },
      );
    } else {
      const withPromise = result as ResultWithPromise;
      if (withPromise && isThenable(withPromise.promise)) {
        withPromise.promise.then(
          () => span.end(),
          (err: Error) => {
            span.recordException(err);
            span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
            span.end();
          },
        );
      } else {
        span.end();
      }
    }

    return result;
  };
}

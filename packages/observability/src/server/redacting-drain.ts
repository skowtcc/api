/*
 * pipeline-level redaction wrapper (key-name regex + Redacted-value defense in depth).
 *
 * wraps an evlog drain so every event passes through key-name redaction (regex
 * from core/redaction-list.ts) and Redacted-value detection (isRedacted from
 * core/redacted.ts) before reaching the underlying drain.
 *
 * applied once at the Pipeline level before fan-out to stdout/BS so all drains
 * see the same redacted event (per-drain customization isn't currently in scope)
 */

import type { DrainContext } from "evlog";
import { redactKeyMatch } from "../core/redaction-list";
import { isRedacted } from "../core/redacted";

const REDACTED_SENTINEL = "<redacted>";

/**
 * walk an arbitrary object, dropping keys whose name matches the redaction
 * pattern and replacing Redacted-wrapped values with the sentinel string.
 *
 * recurses into nested plain objects. doesn't recurse into arrays of primitives
 * (treats them as opaque). skips objects with a custom prototype chain (Date,
 * Error, RegExp, etc.) to avoid mangling library-provided shapes
 */
function sanitize(value: unknown): unknown {
  if (value === null || value === undefined) return value;

  // Redacted-wrapped values: replace with sentinel regardless of key name
  if (isRedacted(value)) return REDACTED_SENTINEL;

  if (typeof value !== "object") return value;

  // don't recurse into arrays (rare in event context; pass through)
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item));
  }

  /*
   * don't recurse into non-plain objects (Date, Error, RegExp, etc.)
   * plain objects have Object.prototype or null prototype
   */
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;

  const out: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value)) {
    if (redactKeyMatch(key)) {
      // drop the field entirely. don't include the key in the sanitized output
      continue;
    }
    out[key] = sanitize(val);
  }
  return out;
}

/*
 * some evlog adapters (e.g., createBetterStackDrain) accept either DrainContext
 * or DrainContext[] for batching support. evlog's LoggerConfig.drain itself
 * only sends single contexts. we still type-permit the array shape so the
 * wrapper composes with the adapter directly
 */
type FlexibleDrain = (ctx: DrainContext | DrainContext[]) => void | Promise<void>;

/**
 * wrap a drain function so its input is sanitized first.
 *
 * failure isolation: if the inner drain throws, the error propagates. the outer
 * Pipeline composition in pipeline.ts catches per-sink failures with
 * Promise.allSettled so one drain failing doesn't block siblings (the dual-drain
 * guarantee)
 */
export function withRedaction(inner: FlexibleDrain): FlexibleDrain {
  return async (ctx: DrainContext | DrainContext[]) => {
    if (Array.isArray(ctx)) {
      const sanitized = ctx.map((c) => ({
        ...c,
        event: sanitize(c.event) as DrainContext["event"],
      }));
      return inner(sanitized);
    }
    const sanitized: DrainContext = {
      ...ctx,
      event: sanitize(ctx.event) as DrainContext["event"],
    };
    return inner(sanitized);
  };
}

// re-export the type so pipeline.ts and consumers can use it
export type { FlexibleDrain };

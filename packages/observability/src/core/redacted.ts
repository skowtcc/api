/*
 * Redacted<A> primitive
 *
 * wraps a value so it can't be serialized through JSON.stringify, util.inspect,
 * String(), console.log, etc. the wrapped value lives in a WeakMap registry
 * keyed by the Redacted instance. the only way to get the original back is
 * Redacted.value(self), which is a grep-able call site
 */

/* pattern adapted from Dillon Mulroy's sketch (https://x.com/steida/...).
 * the constructor is bypassed via Object.create(proto) so `instanceof Redacted`
 * doesn't work. use isRedacted(x) instead, which checks the brand symbol */

// serialization-denial coverage (incl. structuredClone, v8.serialize, spread)
// lives in core/__tests__/redacted.test.ts

const REDACTED_BRAND: unique symbol = Symbol.for("@skowt-monorepo/observability/Redacted");
const REDACTED_SENTINEL = "<redacted>";

/* registry maps Redacted instances to their wrapped values. WeakMap so wrapped
 * values stay GC-eligible when the Redacted instance is no longer referenced */
const registry = new WeakMap<object, unknown>();

/* branded type. the public Redacted<A> is opaque from outside but carries A
 * in its type parameter so unwrappers know what they get back */
export type Redacted<A> = {
  readonly [REDACTED_BRAND]: true;
  // phantom field. preserves A in the type without occupying any runtime slot
  readonly __phantom?: (a: A) => A;
};

/* prototype object. every Redacted instance comes through Object.create(proto)
 * so serialization paths route through these overrides */
const proto = {
  [REDACTED_BRAND]: true as const,
  toString(): string {
    return REDACTED_SENTINEL;
  },
  toJSON(): string {
    return REDACTED_SENTINEL;
  },
  [Symbol.for("nodejs.util.inspect.custom")](): string {
    return REDACTED_SENTINEL;
  },
};

export const Redacted = {
  make<A>(value: A): Redacted<A> {
    const instance = Object.create(proto) as Redacted<A>;
    registry.set(instance as unknown as object, value);
    return instance;
  },

  value<A>(self: Redacted<A>): A {
    const stored = registry.get(self as unknown as object);
    if (!registry.has(self as unknown as object)) {
      throw new Error("Redacted value was not in registry");
    }
    return stored as A;
  },
};

/* discriminator used by the logger (and tests) to detect Redacted values
 * without relying on `instanceof`. `instanceof` doesn't work because the
 * constructor is bypassed (see prototype comment above) */
export function isRedacted(value: unknown): value is Redacted<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Record<symbol, unknown>)[REDACTED_BRAND] === true
  );
}

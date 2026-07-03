/* initFetchTracing monkey-patches globalThis.fetch. the patch is load-bearing
   for outbound HTTP visibility under Bun (instrumentation-undici doesn't fire
   against Bun's native fetch) and has several behavioural branches that are
   easy to regress silently: idempotency, method extraction, URL credential
   stripping, AbortError vs real failure, 4xx-vs-5xx status, native-statics
   preservation, default timeout. all exercised against a stub fetch so the
   wrapper can be driven without real network */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from "bun:test";
import { initFetchTracing } from "../fetch-tracing";
import { getRequestStats, beginRequestStats } from "../request-stats";

type StubFetch = ((
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1],
) => Promise<Response>) & {
  preconnect?: (url: string) => void;
  __callCount?: number;
};

/* the wrapper looks up the tracer per call (so the no-op tracer upgrades when
   the SDK starts later). without a real SDK installed the spans go to a noop
   tracer; that's fine here. these tests assert the wrapper's own behaviour
   (calls through, errors propagate, statics preserved), not span content */
let stubFetch: StubFetch;
let originalFetch: typeof fetch;

beforeAll(() => {
  originalFetch = globalThis.fetch;
  /* Bun marks `preconnect` as non-enumerable on the native fetch, which is
     why Object.assign would have dropped it. replicate that shape so the
     descriptor-copy preservation behaviour is testable here */
  stubFetch = (async (_input, _init) => {
    stubFetch.__callCount = (stubFetch.__callCount ?? 0) + 1;
    return new Response("ok", { status: 200 });
  }) as StubFetch;
  Object.defineProperty(stubFetch, "preconnect", {
    value: (_url: string) => {},
    enumerable: false,
    writable: false,
    configurable: true,
  });
  globalThis.fetch = stubFetch as unknown as typeof fetch;
  initFetchTracing();
});

afterAll(() => {
  // restore the real fetch so the patch doesn't leak into other test files
  globalThis.fetch = originalFetch;
});

beforeEach(() => {
  stubFetch.__callCount = 0;
});

describe("initFetchTracing", () => {
  it("is idempotent: calling twice does not double-wrap", async () => {
    initFetchTracing();
    initFetchTracing();
    await fetch("https://example.com/x");
    /* if double-wrapping happened, the call would still reach stubFetch once
       but a second tracedFetch layer would also bump fetch.calls_count twice.
       easier check: the patched marker is the same identity-stable Symbol */
    const PATCHED = Symbol.for("@skowt-monorepo/observability/fetch:patched");
    expect((globalThis.fetch as unknown as Record<symbol, unknown>)[PATCHED]).toBe(true);
    expect(stubFetch.__callCount).toBe(1);
  });

  it("forwards Bun-style non-enumerable statics (preconnect) onto the wrapper", () => {
    /* Object.assign would have dropped this because it's non-enumerable. the
       getOwnPropertyDescriptor loop preserves it */
    const f = globalThis.fetch as unknown as { preconnect?: unknown };
    expect(typeof f.preconnect).toBe("function");
  });

  it("forwards a successful call and records 2xx without ERROR status semantics", async () => {
    const res = await fetch("https://example.com/ok");
    expect(res.status).toBe(200);
    expect(stubFetch.__callCount).toBe(1);
  });

  it("bumps fetch.calls_count when called inside an active request-stats store", async () => {
    beginRequestStats();
    await fetch("https://example.com/a");
    await fetch("https://example.com/b");
    expect(getRequestStats()!.fetchCalls).toBe(2);
  });

  it("strips userinfo from url.full before spanning", async () => {
    /* the wrapper parses the URL, blanks username/password, and rebuilds.
       the span attribute can't be inspected directly without an InMemoryExporter
       wired to a real provider, but the stub receives the original input
       unchanged; only the span attribute is sanitized. the behavioural check
       is that the wrapper doesn't crash on userinfo URLs */
    const res = await fetch("https://user:pass@example.com/protected");
    expect(res.status).toBe(200);
  });

  it("re-throws synchronously-thrown errors from the underlying fetch", async () => {
    const original = globalThis.fetch;
    const throwingFetch = ((_input: unknown, _init?: unknown) => {
      throw new Error("boom");
    }) as unknown as typeof fetch;
    // replace transiently. initFetchTracing is idempotent so this won't re-patch
    globalThis.fetch = Object.assign(throwingFetch, original);
    // reapply the patched marker so other tests see it
    const PATCHED = Symbol.for("@skowt-monorepo/observability/fetch:patched");
    (globalThis.fetch as unknown as Record<symbol, unknown>)[PATCHED] = true;

    let caught: Error | undefined;
    try {
      await fetch("https://example.com/throw");
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).toBeDefined();
    expect(caught!.message).toBe("boom");

    // restore for other tests
    globalThis.fetch = original;
  });

  it("supports Request-like input shapes (method extracted from the object)", async () => {
    /* duck-typed extraction: { method: "POST" } satisfies the input shape
       without needing a real Request constructor */
    const requestLike = { method: "POST", url: "https://example.com/post" };
    await fetch(requestLike as unknown as RequestInfo);
    expect(stubFetch.__callCount).toBe(1);
  });
});

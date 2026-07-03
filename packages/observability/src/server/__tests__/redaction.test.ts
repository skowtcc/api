/* tests for pipeline-level redaction: the key-name regex strip and the Redacted
   value replacement that runs as defense in depth */

import { describe, it, expect } from "bun:test";
import type { DrainContext } from "evlog";
import { withRedaction } from "../redacting-drain";
import { Redacted } from "../../core/redacted";

function makeContext(event: Record<string, unknown>): DrainContext {
  return { event: event as DrainContext["event"] } as DrainContext;
}

async function captureEvent(context: Record<string, unknown>): Promise<Record<string, unknown>> {
  let captured: Record<string, unknown> = {};
  const drain = withRedaction(async (ctx) => {
    if (Array.isArray(ctx)) throw new Error("expected single ctx");
    captured = ctx.event as Record<string, unknown>;
  });
  await drain(makeContext(context));
  return captured;
}

describe("pipeline-level redaction", () => {
  describe("key-name stripping", () => {
    it("drops fields named 'password'", async () => {
      const out = await captureEvent({ user_id: "u1", password: "secret" });
      expect(out.user_id).toBe("u1");
      expect("password" in out).toBe(false);
    });

    it("drops case variants: PASSWORD, Password, pwd, passwd", async () => {
      const out = await captureEvent({
        keep: "yes",
        PASSWORD: "drop",
        Password: "drop",
        pwd: "drop",
        passwd: "drop",
      });
      expect(out.keep).toBe("yes");
      expect("PASSWORD" in out).toBe(false);
      expect("Password" in out).toBe(false);
      expect("pwd" in out).toBe(false);
      expect("passwd" in out).toBe(false);
    });

    it("drops token-like names: token, tok, bearer, api_key, apikey, refresh_token", async () => {
      const out = await captureEvent({
        keep: "yes",
        token: "x",
        tok: "x",
        bearer: "x",
        api_key: "x",
        apikey: "x",
        refresh_token: "x",
      });
      expect(out.keep).toBe("yes");
      expect("token" in out).toBe(false);
      expect("tok" in out).toBe(false);
      expect("bearer" in out).toBe(false);
      expect("api_key" in out).toBe(false);
      expect("apikey" in out).toBe(false);
      expect("refresh_token" in out).toBe(false);
    });

    it("drops auth-like names: authorization, auth, cookie, secret", async () => {
      const out = await captureEvent({
        keep: "yes",
        authorization: "x",
        auth: "x",
        cookie: "x",
        secret: "x",
      });
      expect(out.keep).toBe("yes");
      expect("authorization" in out).toBe(false);
      expect("auth" in out).toBe(false);
      expect("cookie" in out).toBe(false);
      expect("secret" in out).toBe(false);
    });

    it("preserves operational identifiers", async () => {
      const out = await captureEvent({
        user_id: "abc123",
        asset_id: "xyz789",
        request_id: "req-1",
        trace_id: "trace-2",
        span_id: "span-3",
        job_id: "job-4",
        message: "ok",
      });
      expect(out.user_id).toBe("abc123");
      expect(out.asset_id).toBe("xyz789");
      expect(out.request_id).toBe("req-1");
      expect(out.trace_id).toBe("trace-2");
      expect(out.span_id).toBe("span-3");
      expect(out.job_id).toBe("job-4");
      expect(out.message).toBe("ok");
    });

    it("recurses into nested plain objects", async () => {
      const out = await captureEvent({
        nested: {
          user_id: "u1",
          password: "drop-me",
          deeper: { token: "also-drop", keep: "yes" },
        },
      });
      const nested = out.nested as Record<string, unknown>;
      expect(nested.user_id).toBe("u1");
      expect("password" in nested).toBe(false);
      const deeper = nested.deeper as Record<string, unknown>;
      expect("token" in deeper).toBe(false);
      expect(deeper.keep).toBe("yes");
    });

    it("does not recurse into Error objects", async () => {
      const err = new Error("boom");
      const out = await captureEvent({ error: err });
      expect(out.error).toBe(err);
    });
  });

  describe("Redacted value replacement (defense in depth)", () => {
    it("replaces Redacted values with <redacted> sentinel", async () => {
      const out = await captureEvent({
        user_id: "u1",
        config: Redacted.make("secret-config-value"),
      });
      expect(out.user_id).toBe("u1");
      expect(out.config).toBe("<redacted>");
    });

    it("replaces Redacted values regardless of field name", async () => {
      const out = await captureEvent({
        // 'arbitrary' is not in the redaction regex; only the Redacted wrap protects it
        arbitrary: Redacted.make("would-leak-without-Redacted"),
      });
      expect(out.arbitrary).toBe("<redacted>");
    });

    it("replaces Redacted values in nested context", async () => {
      const out = await captureEvent({
        config: { wrapped: Redacted.make("nested-secret") },
      });
      const cfg = out.config as Record<string, unknown>;
      expect(cfg.wrapped).toBe("<redacted>");
    });
  });

  describe("edge cases", () => {
    it("passes through null and undefined values", async () => {
      const out = await captureEvent({ a: null, b: undefined, c: 0 });
      expect(out.a).toBeNull();
      expect(out.b).toBeUndefined();
      expect(out.c).toBe(0);
    });

    it("preserves primitive values", async () => {
      const out = await captureEvent({ n: 42, s: "hi", b: true });
      expect(out.n).toBe(42);
      expect(out.s).toBe("hi");
      expect(out.b).toBe(true);
    });
  });
});

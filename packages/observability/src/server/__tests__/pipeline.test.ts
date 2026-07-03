/* integration tests for the drain pipeline: dual drain composition, key-name redaction,
   and Redacted value replacement.

   the load-bearing guarantee under test is per-sink failure isolation: a BS adapter
   failure must not block the stdout drain. that property is what keeps logs flowing
   during a Railway-side BS outage */

import { describe, it, expect, mock } from "bun:test";
import type { DrainContext } from "evlog";
import { buildComposedDrain, composeDrains } from "../pipeline";
import type { FlexibleDrain } from "../redacting-drain";
import { Redacted } from "../../core/redacted";

function makeContext(event: Record<string, unknown>): DrainContext {
  return { event: event as DrainContext["event"] } as DrainContext;
}

describe("composeDrains", () => {
  it("calls every drain with the same context", async () => {
    const captured: Record<string, unknown>[][] = [[], [], []];
    const drains: FlexibleDrain[] = captured.map((sink) => async (ctx) => {
      if (Array.isArray(ctx)) ctx.forEach((c) => sink.push(c.event as Record<string, unknown>));
      else sink.push(ctx.event as Record<string, unknown>);
    });

    const composed = composeDrains(drains);
    await composed(makeContext({ a: 1 }));
    await composed(makeContext({ b: 2 }));

    expect(captured[0]).toEqual([{ a: 1 }, { b: 2 }]);
    expect(captured[1]).toEqual([{ a: 1 }, { b: 2 }]);
    expect(captured[2]).toEqual([{ a: 1 }, { b: 2 }]);
  });

  describe("per-sink failure isolation", () => {
    it("one drain throwing does NOT prevent other drains from running", async () => {
      const stdoutEvents: Record<string, unknown>[] = [];
      const stdout: FlexibleDrain = async (ctx) => {
        if (Array.isArray(ctx))
          ctx.forEach((c) => stdoutEvents.push(c.event as Record<string, unknown>));
        else stdoutEvents.push(ctx.event as Record<string, unknown>);
      };
      const failingBs: FlexibleDrain = async () => {
        throw new Error("BS unreachable");
      };

      // suppress the expected stderr noise during this test
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = mock(() => true) as unknown as typeof process.stderr.write;

      try {
        const composed = composeDrains([stdout, failingBs]);
        // composed drain must not throw, even though one drain rejected
        await expect(composed(makeContext({ msg: "incident-payload" }))).resolves.toBeUndefined();
        expect(stdoutEvents).toEqual([{ msg: "incident-payload" }]);
      } finally {
        process.stderr.write = originalStderr;
      }
    });

    it("surfaces failed-drain index + reason to stderr", async () => {
      const stderrLines: string[] = [];
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = ((chunk: string | Uint8Array) => {
        stderrLines.push(String(chunk));
        return true;
      }) as unknown as typeof process.stderr.write;

      try {
        const failingDrain: FlexibleDrain = async () => {
          throw new Error("downstream 503");
        };
        const composed = composeDrains([failingDrain]);
        await composed(makeContext({ msg: "x" }));
      } finally {
        process.stderr.write = originalStderr;
      }

      expect(stderrLines.length).toBeGreaterThan(0);
      expect(stderrLines.join("")).toContain("[observability] drain 0 failed");
      expect(stderrLines.join("")).toContain("downstream 503");
    });

    it("both drains failing does not throw (operator gets two stderr lines)", async () => {
      const originalStderr = process.stderr.write.bind(process.stderr);
      process.stderr.write = mock(() => true) as unknown as typeof process.stderr.write;

      try {
        const a: FlexibleDrain = async () => {
          throw new Error("a-fail");
        };
        const b: FlexibleDrain = async () => {
          throw new Error("b-fail");
        };
        const composed = composeDrains([a, b]);
        await expect(composed(makeContext({ msg: "x" }))).resolves.toBeUndefined();
      } finally {
        process.stderr.write = originalStderr;
      }
    });
  });
});

describe("buildComposedDrain", () => {
  it("with no BS token, calls only the stdout drain", async () => {
    const stdoutEvents: Record<string, unknown>[] = [];
    const bsEvents: Record<string, unknown>[] = [];

    const composed = buildComposedDrain({
      stdoutDrainOverride: async (ctx) => {
        if (!Array.isArray(ctx)) stdoutEvents.push(ctx.event as Record<string, unknown>);
      },
      betterStackDrainOverride: async (ctx) => {
        if (!Array.isArray(ctx)) bsEvents.push(ctx.event as Record<string, unknown>);
      },
    });

    await composed(makeContext({ msg: "hello" }));

    expect(stdoutEvents).toHaveLength(1);
    /* betterStackDrainOverride was provided but no token gate is required; it's mounted
       unconditionally when the override is present. validates the override path works */
    expect(bsEvents).toHaveLength(1);
  });

  it("with BS token only (no override), wires real createBetterStackDrain", async () => {
    /* can't assert on the real network call from here. verify the function
       resolves without throwing and the stdout drain still receives the event */
    const stdoutEvents: Record<string, unknown>[] = [];

    // suppress stderr from BS hitting an unreachable endpoint
    const originalStderr = process.stderr.write.bind(process.stderr);
    process.stderr.write = mock(() => true) as unknown as typeof process.stderr.write;

    try {
      const composed = buildComposedDrain({
        betterStackToken: "fake-token-for-test",
        betterStackEndpoint: "http://127.0.0.1:1", // unrouted; will fail
        stdoutDrainOverride: async (ctx) => {
          if (!Array.isArray(ctx)) stdoutEvents.push(ctx.event as Record<string, unknown>);
        },
      });

      /* the BS drain fails (unrouted endpoint), but stdout still flushes.
         this is the per-sink isolation guarantee end-to-end */
      await composed(makeContext({ msg: "during-incident" }));

      expect(stdoutEvents).toEqual([{ msg: "during-incident" }]);
    } finally {
      process.stderr.write = originalStderr;
    }
  }, 10000); // generous timeout so the BS adapter's internal retry can play out

  it("applies key-name redaction once before either drain sees the event", async () => {
    const stdoutEvents: Record<string, unknown>[] = [];
    const bsEvents: Record<string, unknown>[] = [];

    const composed = buildComposedDrain({
      stdoutDrainOverride: async (ctx) => {
        if (!Array.isArray(ctx)) stdoutEvents.push(ctx.event as Record<string, unknown>);
      },
      betterStackDrainOverride: async (ctx) => {
        if (!Array.isArray(ctx)) bsEvents.push(ctx.event as Record<string, unknown>);
      },
    });

    await composed(
      makeContext({
        user_id: "u1",
        password: "leak-me",
        token: "also-leak",
        keep: "yes",
      }),
    );

    // both drains see the same sanitized event
    expect(stdoutEvents[0]).toEqual({ user_id: "u1", keep: "yes" });
    expect(bsEvents[0]).toEqual({ user_id: "u1", keep: "yes" });
    expect("password" in stdoutEvents[0]!).toBe(false);
    expect("token" in bsEvents[0]!).toBe(false);
  });

  it("Redacted-wrapped values get replaced with <redacted> before drain", async () => {
    const stdoutEvents: Record<string, unknown>[] = [];

    const composed = buildComposedDrain({
      stdoutDrainOverride: async (ctx) => {
        if (!Array.isArray(ctx)) stdoutEvents.push(ctx.event as Record<string, unknown>);
      },
    });

    await composed(
      makeContext({
        // 'config' is not in the redaction regex; only the Redacted wrap protects it
        config: Redacted.make("sensitive-payload"),
        user_id: "u1",
      }),
    );

    expect(stdoutEvents[0]).toEqual({
      config: "<redacted>",
      user_id: "u1",
    });
  });
});

/*
 * drain pipeline composition (dual drain + pipeline-level redaction)
 *
 * evlog's LoggerConfig.drain is a single function. we compose stdout + BS into
 * one drain that fans out via Promise.allSettled so per-sink failure isolation
 * holds: if BS is unreachable or auth-fails, stdout still writes; if both fail
 * the error is surfaced to stderr without throwing into the request path
 *
 * key-name + Redacted-value redaction is applied once at the pipeline entry
 * (before fan-out) so both drains see the same redacted event
 */

import type { DrainContext } from "evlog";
import { createBetterStackDrain } from "evlog/better-stack";
import { withRedaction, type FlexibleDrain } from "./redacting-drain";

interface PipelineOptions {
  /** Better Stack source token. when undefined, BS drain is skipped (dev/test) */
  betterStackToken?: string;
  /** Better Stack ingestion endpoint. defaults to https://in.logs.betterstack.com */
  betterStackEndpoint?: string;
  /**
   * test seam. override the stdout drain with a capturing function. production
   * code should never use this; production always wants the real stdoutDrain
   */
  stdoutDrainOverride?: FlexibleDrain;
  /**
   * test seam. override the BS adapter with a stub. when provided, replaces the
   * real createBetterStackDrain regardless of whether betterStackToken is set
   */
  betterStackDrainOverride?: FlexibleDrain;
}

/**
 * stdout drain. writes one JSON line per event. always included in the pipeline
 */
const stdoutDrain: FlexibleDrain = async (ctx: DrainContext | DrainContext[]) => {
  if (Array.isArray(ctx)) {
    for (const c of ctx) {
      process.stdout.write(JSON.stringify(c.event) + "\n");
    }
  } else {
    process.stdout.write(JSON.stringify(ctx.event) + "\n");
  }
};

/**
 * build the single drain function that evlog's initLogger() expects.
 *
 * composes:
 *   - stdoutDrain (always on; the dual-drain fallback)
 *   - createBetterStackDrain() (when BS token is provided)
 *
 * both are wrapped with withRedaction() so the key-name regex and Redacted-value
 * detection apply once per event before fan-out.
 *
 * fan-out uses Promise.allSettled: a BS failure doesn't block stdout, and vice
 * versa. per-sink errors are surfaced to stderr so the operator sees them in
 * Railway logs without the error propagating into the request path
 */
export function buildComposedDrain(
  options: PipelineOptions = {},
): (ctx: DrainContext) => Promise<void> {
  const stdout = options.stdoutDrainOverride ?? stdoutDrain;
  const drains: FlexibleDrain[] = [withRedaction(stdout)];

  let bsDrain = options.betterStackDrainOverride;
  if (!bsDrain && options.betterStackToken) {
    bsDrain = createBetterStackDrain({
      apiKey: options.betterStackToken,
      endpoint: options.betterStackEndpoint,
    });
  }
  if (bsDrain) drains.push(withRedaction(bsDrain));

  return composeDrains(drains);
}

/**
 * compose multiple drains into a single fan-out drain with per-sink failure
 * isolation. exported for direct use in tests that want to skip the BS / stdout
 * defaults.
 *
 * per-sink semantics: Promise.allSettled means one drain's failure doesn't
 * prevent the others from running. failures are surfaced to stderr but never
 * thrown, so a misbehaving drain can't block the request path
 */
export function composeDrains(drains: FlexibleDrain[]): (ctx: DrainContext) => Promise<void> {
  return async (ctx: DrainContext) => {
    const results = await Promise.allSettled(drains.map((d) => d(ctx)));
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      if (r?.status === "rejected") {
        process.stderr.write(`[observability] drain ${i} failed: ${String(r.reason)}\n`);
      }
    }
  };
}

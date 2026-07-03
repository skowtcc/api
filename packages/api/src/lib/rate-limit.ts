import { TRPCError } from "@trpc/server";
import { createLogger } from "@skowt-monorepo/observability/server";
import { t } from "../index";
import { getRedis } from "./redis";
import { isProduction, isTest, shouldRequireCloudflare } from "@skowt-monorepo/env/server";
import type { Context } from "../context";

const log = createLogger("rate-limit");

export interface RateLimitConfig {
  limit: number;
  windowSeconds: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfter?: number;
}

interface MemoryRateLimitEntry {
  timestamps: number[];
  windowMs: number;
}

const memoryRateLimits = new Map<string, MemoryRateLimitEntry>();

const CLEANUP_INTERVAL = 60 * 1000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of memoryRateLimits.entries()) {
    const filtered = entry.timestamps.filter((ts) => now - ts < entry.windowMs);
    if (filtered.length === 0) {
      memoryRateLimits.delete(key);
    } else {
      memoryRateLimits.set(key, {
        ...entry,
        timestamps: filtered,
      });
    }
  }
}, CLEANUP_INTERVAL);
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

let hasWarnedRedisFallback = false;

function warnRedisFallback(redisKey: string, error: unknown): void {
  if (hasWarnedRedisFallback) {
    return;
  }
  log.warn(`Redis unavailable, falling back to in-memory for key: ${redisKey}`, {
    error: error instanceof Error ? error.message : error,
  });
  hasWarnedRedisFallback = true;
}

function resetRedisFallbackWarning(): void {
  hasWarnedRedisFallback = false;
}

/*
 * lua script for atomic sliding-window rate limiting on Redis
 * uses a sorted set keyed by timestamp; returns [allowed, remaining, retryAfterMs]
 */
const RATE_LIMIT_LUA = `
local key = KEYS[1]
local window_start = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local now = tonumber(ARGV[3])
local request_id = ARGV[4]
local window_ms = tonumber(ARGV[5])

redis.call('ZREMRANGEBYSCORE', key, '-inf', window_start)

local count = redis.call('ZCARD', key)

if count < limit then
  redis.call('ZADD', key, now, request_id)
  redis.call('PEXPIRE', key, window_ms)
  return {1, limit - count - 1, 0}
else
  local oldest = redis.call('ZRANGE', key, 0, 0, 'WITHSCORES')
  local retry_after = 0
  if oldest and oldest[2] then
    retry_after = math.max(0, tonumber(oldest[2]) + window_ms - now)
  end
  return {0, 0, retry_after}
end
`;

async function checkRateLimit(key: string, config: RateLimitConfig): Promise<RateLimitResult> {
  const now = Date.now();
  const windowMs = config.windowSeconds * 1000;
  const windowStart = now - windowMs;
  const redisKey = `rl:${key}`;

  try {
    const redis = await getRedis();
    const requestId = `${now}:${Math.random().toString(36).slice(2, 9)}`;

    // ioredis .eval() runs a lua script on the Redis server (not js eval)
    const result = (await redis.eval(
      RATE_LIMIT_LUA,
      1,
      redisKey,
      windowStart.toString(),
      config.limit.toString(),
      now.toString(),
      requestId,
      windowMs.toString(),
    )) as [number, number, number];

    resetRedisFallbackWarning();

    return {
      allowed: result[0] === 1,
      remaining: result[1],
      resetAt: Math.ceil((now + windowMs) / 1000),
      retryAfter: result[2] > 0 ? Math.ceil(result[2] / 1000) : undefined,
    };
  } catch (error) {
    warnRedisFallback(redisKey, error);
  }

  const entry = memoryRateLimits.get(redisKey) ?? { timestamps: [], windowMs };
  const validTimestamps = entry.timestamps.filter((ts) => ts > windowStart);
  entry.windowMs = windowMs;

  if (validTimestamps.length < config.limit) {
    validTimestamps.push(now);
    entry.timestamps = validTimestamps;
    memoryRateLimits.set(redisKey, entry);

    return {
      allowed: true,
      remaining: config.limit - validTimestamps.length,
      resetAt: Math.ceil((now + windowMs) / 1000),
    };
  }

  const oldestTimestamp = Math.min(...validTimestamps);
  const retryAfterMs = oldestTimestamp + windowMs - now;

  return {
    allowed: false,
    remaining: 0,
    resetAt: Math.ceil((oldestTimestamp + windowMs) / 1000),
    retryAfter: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
}

function getClientIp(headers: Headers): string {
  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp;
  }

  /*
   * when the origin is required to sit behind Cloudflare, a request without a
   * trusted edge IP is hostile or misrouted. x-forwarded-for / x-real-ip are
   * client-spoofable, so falling through to them would let an attacker mint
   * unlimited rate-limit buckets (or frame a victim IP). reject instead.
   * no-op in the current deployment until REQUIRE_CLOUDFLARE=true is set
   */
  if (isProduction() && shouldRequireCloudflare()) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Missing trusted client IP",
    });
  }

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    return xForwardedFor.split(",")[0]?.trim() ?? "unknown";
  }

  return headers.get("x-real-ip") ?? "unknown";
}

function getRateLimitKey(endpoint: string, ctx: Context, headers: Headers): string {
  if (ctx.session?.user?.id) {
    return `user:${ctx.session.user.id}:${endpoint}`;
  }

  const ip = getClientIp(headers);
  return `ip:${ip}:${endpoint}`;
}

interface RateLimitOptions {
  keyPrefix?: string;
  useIp?: boolean;
}

/*
 * IP-keyed rate limit for callers outside the tRPC pipeline - notably the
 * Elysia /api/auth/* route, which better-auth handles directly and so never
 * passes through withRateLimit. same Redis sliding window + cf-connecting-ip
 * trust as the tRPC middleware. `getClientIp` throws when REQUIRE_CLOUDFLARE is
 * on and no trusted IP is present; the caller treats that as a rejection
 */
export async function rateLimitByIp(
  headers: Headers,
  endpoint: string,
  config: RateLimitConfig,
): Promise<RateLimitResult> {
  if (isTest()) {
    return { allowed: true, remaining: config.limit, resetAt: 0 };
  }
  const ip = getClientIp(headers);
  return checkRateLimit(`ip:${ip}:${endpoint}`, config);
}

export function withRateLimit(config: RateLimitConfig, options?: RateLimitOptions) {
  return t.middleware(async ({ ctx, next, path }) => {
    if (isTest()) {
      return next();
    }

    let key: string;

    if (options?.useIp) {
      const ip = getClientIp(ctx.headers);
      key = `ip:${ip}:${options.keyPrefix ?? path}`;
    } else {
      key = getRateLimitKey(options?.keyPrefix ?? path, ctx, ctx.headers);
    }

    const result = await checkRateLimit(key, config);

    if (ctx.set?.headers) {
      ctx.set.headers["x-ratelimit-limit"] = String(config.limit);
      ctx.set.headers["x-ratelimit-remaining"] = String(result.remaining);
      ctx.set.headers["x-ratelimit-reset"] = String(result.resetAt);
    }

    if (!result.allowed) {
      const retryAfter = result.retryAfter ?? config.windowSeconds;

      if (ctx.set?.headers) {
        ctx.set.headers["retry-after"] = String(retryAfter);
      }

      throw new TRPCError({
        code: "TOO_MANY_REQUESTS",
        message: `Rate limit exceeded. Try again in ${retryAfter} seconds.`,
        cause: {
          retryAfter,
          resetAt: result.resetAt,
          remaining: result.remaining,
        },
      });
    }

    return next();
  });
}

export const RATE_LIMITS = {
  search: { limit: 60, windowSeconds: 60 } as const,
  query: { limit: 120, windowSeconds: 60 } as const,
  public: { limit: 60, windowSeconds: 60 } as const,

  download: { limit: 30, windowSeconds: 60 } as const,
  bookmark: { limit: 60, windowSeconds: 60 } as const,
  vote: { limit: 30, windowSeconds: 60 } as const,
  comment: { limit: 20, windowSeconds: 60 } as const,

  upload: { limit: 20, windowSeconds: 60 } as const,
  moderate: { limit: 100, windowSeconds: 60 } as const,
  admin: { limit: 200, windowSeconds: 60 } as const,

  /*
   * gross-abuse gate for the better-auth surface (per IP, per auth path)
   * generous, because session reads are frequent; better-auth's own per-endpoint
   * defaults add the finer limits on sign-in/callback
   */
  auth: { limit: 100, windowSeconds: 60 } as const,

  export: { limit: 1, windowSeconds: 3600 } as const,
  default: { limit: 100, windowSeconds: 60 } as const,
} as const;

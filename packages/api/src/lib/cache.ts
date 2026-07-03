import { createLogger } from "@skowt-monorepo/observability/server";
import { getRedis } from "./redis";

const log = createLogger("cache");

type CacheEntry<T> = {
  data: T;
  expiresAt: number;
};

const memoryCache = new Map<string, CacheEntry<unknown>>();
const MAX_MEMORY_ENTRIES = 1000;
const CACHE_PREFIX = "cache:";

const FIVE_MINUTES_MS = 5 * 60 * 1000;
const DEFAULT_TTL = FIVE_MINUTES_MS;

let usingFallback = false;

function warnFallback(operation: string, error: unknown): void {
  if (!usingFallback) {
    log.warn(`Redis unavailable, falling back to in-memory cache. Operation: ${operation}`, {
      error: error instanceof Error ? error.message : error,
    });
    usingFallback = true;
  }
}

function resetFallbackWarning(): void {
  usingFallback = false;
}

function enforceMemoryLimit(): void {
  if (memoryCache.size >= MAX_MEMORY_ENTRIES) {
    const keysToDelete = Math.floor(MAX_MEMORY_ENTRIES * 0.2);
    const keys = Array.from(memoryCache.keys()).slice(0, keysToDelete);
    for (const key of keys) {
      memoryCache.delete(key);
    }
  }
}

function getFromMemory<T>(key: string): T | null {
  const entry = memoryCache.get(key) as CacheEntry<T> | undefined;
  if (!entry) return null;

  if (Date.now() > entry.expiresAt) {
    memoryCache.delete(key);
    return null;
  }

  return entry.data;
}

function setInMemory<T>(key: string, data: T, ttlMs: number): void {
  enforceMemoryLimit();
  memoryCache.set(key, {
    data,
    expiresAt: Date.now() + ttlMs,
  });
}

export function buildCacheKey(
  prefix: string,
  params: Record<string, string | string[] | undefined>,
): string {
  /* safety: values are truncated below (strings -> 100 chars, arrays -> 20
     elements), so two distinct queries that share a prefix can collide on the
     same key. this is acceptable only because every value cached under these
     keys is public (status='approved') data. if per-user or non-approved data
     is ever cached here, hash the full param set instead - a collision would
     otherwise become a cross-user data leak */
  const parts = [prefix];

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;

    if (Array.isArray(value) && value.length > 0) {
      const truncated = value.slice(0, 20).sort().join(",");
      parts.push(`${key}[${truncated}]`);
    } else if (typeof value === "string" && value.length > 0) {
      const truncated = value.slice(0, 100);
      parts.push(`${key}:${truncated}`);
    }
  }

  return parts.join(":");
}

export async function get<T>(key: string): Promise<T | null> {
  const redisKey = CACHE_PREFIX + key;

  try {
    const redis = await getRedis();
    const cached = await redis.get(redisKey);

    if (cached) {
      resetFallbackWarning();
      return JSON.parse(cached) as T;
    }

    return null;
  } catch (error) {
    warnFallback("get", error);
    return getFromMemory<T>(key);
  }
}

export async function set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL): Promise<void> {
  const redisKey = CACHE_PREFIX + key;
  const ttlSeconds = Math.ceil(ttlMs / 1000);

  try {
    const redis = await getRedis();
    await redis.setex(redisKey, ttlSeconds, JSON.stringify(data));
    resetFallbackWarning();
  } catch (error) {
    warnFallback("set", error);
    setInMemory(key, data, ttlMs);
  }
}

async function scanKeys(
  redis: Awaited<ReturnType<typeof getRedis>>,
  pattern: string,
): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";

  do {
    const [nextCursor, batch] = await redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== "0");

  return keys;
}

export async function invalidate(pattern: string): Promise<number> {
  const redisPattern = CACHE_PREFIX + pattern + "*";

  try {
    const redis = await getRedis();
    const keys = await scanKeys(redis, redisPattern);

    if (keys.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        await redis.del(...batch);
      }
    }

    resetFallbackWarning();
    return keys.length;
  } catch (error) {
    warnFallback("invalidate", error);

    let count = 0;
    for (const key of memoryCache.keys()) {
      if (key.startsWith(pattern)) {
        memoryCache.delete(key);
        count++;
      }
    }
    return count;
  }
}

/* one owner for cache keys so the prefixes callers mint and the prefixes
   invalidation sweeps can't drift apart - a partial invalidation is why an
   approved asset used to appear in search instantly but stay missing from
   drops / landing / related for the full TTL */
export const keys = {
  assetQuery: (params: Record<string, string | string[] | undefined>) =>
    buildCacheKey("search:assets", params),
  recentQuery: (params: Record<string, string | string[] | undefined>) =>
    buildCacheKey("search:recent", params),
  related: (params: Record<string, string | string[] | undefined>) =>
    buildCacheKey("related:assets", params),
  filters: "filters:all",
  drops: "drops:recent",
  landing: (slug: string) => `landing:${slug}`,
  sitemap: (page: string) => `sitemap:${page}`,
  siteStats: "stats:site-totals",
} as const;

/* every namespace holding public approved-asset content. any mutation that
   changes what's approved/visible (moderation flips, skip-queue commits, asset
   deletion) must invalidate all of them together */
const APPROVED_ASSET_NAMESPACES = [
  "search:",
  "related:",
  "drops:",
  "landing:",
  "sitemap:",
  "stats:",
] as const;

export async function invalidateApprovedAssetContent(): Promise<void> {
  await Promise.all(APPROVED_ASSET_NAMESPACES.map((ns) => invalidate(ns)));
}

/* catalog structure changed (games / categories / tags added or renamed): the
   filters list is stale on top of the full content blast radius */
export async function invalidateCatalogStructure(): Promise<void> {
  await Promise.all([invalidate("filters:"), invalidateApprovedAssetContent()]);
}

import { createLogger } from "@skowt-monorepo/observability/server";
import { isDiscordConfigured, isDevelopment } from "@skowt-monorepo/env/server";
import { db, account, eq, and } from "@skowt-monorepo/db";
import { getRedis } from "./redis";

const log = createLogger("discord");

const PRESENCE_API_URL = "https://presence.originoid.co/v1";
const CACHE_TTL_SECONDS = 300;
const REQUEST_TIMEOUT_MS = 5000;

let hasWarnedRedisUnavailable = false;
let hasWarnedMembershipBypass = false;

function warnMembershipBypassOnce(): void {
  if (hasWarnedMembershipBypass) {
    return;
  }
  log.warn("Discord OAuth not configured - membership gate defaults open (dev only)");
  hasWarnedMembershipBypass = true;
}

function serverMembershipKey(userId: string): string {
  return `discord:server:${userId}`;
}

function warnRedisUnavailable(error: unknown): void {
  if (hasWarnedRedisUnavailable) {
    return;
  }
  log.warn("Redis unavailable, continuing without cache", {
    error: error instanceof Error ? error.message : error,
  });
  hasWarnedRedisUnavailable = true;
}

function resetRedisUnavailableWarning(): void {
  hasWarnedRedisUnavailable = false;
}

async function getDiscordAccountId(userId: string): Promise<string | null> {
  const discordAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "discord")),
    columns: { accountId: true },
  });

  return discordAccount?.accountId ?? null;
}

export async function checkDiscordServerMembership(userId: string): Promise<boolean> {
  /*
   * no Discord OAuth in local dev means no user can ever have a linked discord
   * account, so a prod-faithful `false` would be an unsatisfiable dead end.
   * default the gate open instead - matching the test mocks' baseline - and
   * before the cache read, so flipping creds on later resumes real behaviour
   * with nothing stale. isDevelopment() (not !isProduction()) keeps prod and
   * test on the real path; requiredInProd already hard-fails a prod boot
   * without creds
   */
  if (!isDiscordConfigured() && isDevelopment()) {
    warnMembershipBypassOnce();
    return true;
  }

  const cacheKey = serverMembershipKey(userId);
  let redis: Awaited<ReturnType<typeof getRedis>> | null = null;

  try {
    redis = await getRedis();
    resetRedisUnavailableWarning();
  } catch (error) {
    warnRedisUnavailable(error);
  }

  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached !== null) {
        return cached === "1";
      }
    } catch (error) {
      warnRedisUnavailable(error);
      redis = null;
    }
  }

  const discordId = await getDiscordAccountId(userId);
  if (!discordId) {
    if (redis) {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, "0").catch((error) => {
        warnRedisUnavailable(error);
      });
    }
    return false;
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let response: Response;

    try {
      response = await fetch(`${PRESENCE_API_URL}/${discordId}/in_server`, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as { in_server?: boolean };
    const inServer = data.in_server === true;

    if (redis) {
      await redis.setex(cacheKey, CACHE_TTL_SECONDS, inServer ? "1" : "0").catch((error) => {
        warnRedisUnavailable(error);
      });
    }

    return inServer;
  } catch (error) {
    log.error("Membership check failed", { error });
    return false;
  }
}

export async function invalidateServerMembershipCache(userId: string): Promise<void> {
  try {
    const redis = await getRedis();
    await redis.del(serverMembershipKey(userId));
  } catch {
    // ignore cache invalidation failures
  }
}

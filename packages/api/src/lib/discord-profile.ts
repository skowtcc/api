import { createLogger, wrapInSpan } from "@skowt-monorepo/observability/server";
import { db, user, account, eq, and } from "@skowt-monorepo/db";
import { getServerEnv } from "@skowt-monorepo/env/server";

const log = createLogger("discord-profile");

/* fallback used when DISCORD_LOOKUP_URL is not set. points at the deployed
   antifield/discord-lookup cloudflare worker. override via env in local/staging */
const DEFAULT_DISCORD_LOOKUP_URL = "https://discord-lookup.dromzeh.dev";

const REQUEST_TIMEOUT_MS = 5000;
const STALE_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
/* cooldown to bound any single user's refresh rate, regardless of caller. blocks
   an attacker driving the public mutation from amplifying lookups for one user */
const PER_USER_COOLDOWN_MS = 60 * 1000;
const AVATAR_SIZE = 128;

/* only trust avatar URLs from the real Discord CDN. defence-in-depth in case
   the lookup worker is ever compromised: an attacker-controlled origin in
   `<img src>` could exfiltrate viewer IP / fingerprint per render */
const TRUSTED_AVATAR_PREFIXES = [
  "https://cdn.discordapp.com/avatars/",
  "https://media.discordapp.net/avatars/",
] as const;

/* upper bound on what we accept from discord-lookup. discord's real limits
   are 32 for username and 32 for global_name. 100 is plenty of headroom and
   blocks oversize payloads from a compromised worker */
const MAX_NAME_LEN = 100;

let hasWarnedLookupUnavailable = false;

function warnLookupUnavailable(error: unknown): void {
  if (hasWarnedLookupUnavailable) {
    return;
  }
  log.warn("discord-lookup unavailable, continuing without refresh", {
    error: error instanceof Error ? error.message : String(error),
  });
  hasWarnedLookupUnavailable = true;
}

function resetLookupUnavailableWarning(): void {
  hasWarnedLookupUnavailable = false;
}

function isTrustedAvatarUrl(url: string): boolean {
  return TRUSTED_AVATAR_PREFIXES.some((prefix) => url.startsWith(prefix));
}

async function getDiscordAccountId(userId: string): Promise<string | null> {
  const discordAccount = await db.query.account.findFirst({
    where: and(eq(account.userId, userId), eq(account.providerId, "discord")),
    columns: { accountId: true },
  });

  return discordAccount?.accountId ?? null;
}

interface DiscordLookupResponse {
  user?: {
    username?: string | null;
    globalName?: string | null;
  };
  avatar?: {
    url?: string | null;
    animated?: boolean;
  };
}

interface MappedProfile {
  name: string;
  displayName: string;
  image: string | null;
}

function mapLookupResponse(response: DiscordLookupResponse): MappedProfile | null {
  const username = response.user?.username;
  if (!username || typeof username !== "string" || username.length === 0) {
    return null;
  }

  if (username.length > MAX_NAME_LEN) {
    return null;
  }

  const globalName = response.user?.globalName ?? null;
  if (globalName !== null && (typeof globalName !== "string" || globalName.length > MAX_NAME_LEN)) {
    return null;
  }

  const displayName = globalName ?? username;
  const rawAvatarUrl = response.avatar?.url ?? null;
  const animated = response.avatar?.animated === true;

  const image =
    rawAvatarUrl && isTrustedAvatarUrl(rawAvatarUrl)
      ? `${rawAvatarUrl}.${animated ? "gif" : "png"}?size=${AVATAR_SIZE}`
      : null;

  return { name: username, displayName, image };
}

type LookupOutcome =
  | { kind: "ok"; profile: MappedProfile }
  | { kind: "deleted" } // 404; account gone
  | { kind: "transient" }; // network / 5xx / timeout; do not bump

async function fetchDiscordLookup(snowflake: string): Promise<LookupOutcome> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const baseUrl = getServerEnv().DISCORD_LOOKUP_URL ?? DEFAULT_DISCORD_LOOKUP_URL;

  try {
    const response = await fetch(`${baseUrl}/user/${snowflake}`, {
      signal: controller.signal,
    });

    if (response.status === 404) {
      // worker is reachable and answered authoritatively; clear the warning flag
      resetLookupUnavailableWarning();
      return { kind: "deleted" };
    }

    if (!response.ok) {
      warnLookupUnavailable(new Error(`HTTP ${response.status}`));
      return { kind: "transient" };
    }

    const json = (await response.json()) as DiscordLookupResponse;
    const profile = mapLookupResponse(json);

    if (!profile) {
      return { kind: "transient" };
    }

    resetLookupUnavailableWarning();
    return { kind: "ok", profile };
  } catch (error) {
    warnLookupUnavailable(error);
    return { kind: "transient" };
  } finally {
    clearTimeout(timeoutId);
  }
}

export interface RefreshResult {
  name: string | null;
  displayName: string | null;
  image: string | null;
  updated: boolean;
}

async function refreshDiscordProfileUnsafe(userId: string): Promise<RefreshResult> {
  /* per-user cooldown: if we refreshed this user recently (e.g. via the
     public mutation), skip the network call. caps attacker-driven amplification */
  const existing = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { name: true, displayName: true, image: true, profileUpdatedAt: true },
  });

  if (
    existing?.profileUpdatedAt &&
    Date.now() - existing.profileUpdatedAt.getTime() < PER_USER_COOLDOWN_MS
  ) {
    return {
      name: existing.name,
      displayName: existing.displayName,
      image: existing.image,
      updated: false,
    };
  }

  const snowflake = await getDiscordAccountId(userId);

  if (!snowflake) {
    /* no discord-linked account. bump timestamp so the lazy helper stops
       re-checking, but leave the row otherwise untouched */
    try {
      await db.update(user).set({ profileUpdatedAt: new Date() }).where(eq(user.id, userId));
    } catch (error) {
      log.error("Failed to bump profileUpdatedAt for non-discord user", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return { name: null, displayName: null, image: null, updated: false };
  }

  const outcome = await fetchDiscordLookup(snowflake);

  if (outcome.kind === "transient") {
    // don't bump; retry on the next stale read
    return { name: null, displayName: null, image: null, updated: false };
  }

  if (outcome.kind === "deleted") {
    /* discord account has been deleted. clear image so we stop showing
       a now-permanently-broken avatar; keep name/displayName as-is */
    try {
      await db
        .update(user)
        .set({ image: null, profileUpdatedAt: new Date() })
        .where(eq(user.id, userId));
    } catch (error) {
      log.error("Failed to clear deleted-account image", {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return {
      name: existing?.name ?? null,
      displayName: existing?.displayName ?? null,
      image: null,
      updated: true,
    };
  }

  const { profile } = outcome;
  try {
    await db
      .update(user)
      .set({
        name: profile.name,
        displayName: profile.displayName,
        image: profile.image,
        profileUpdatedAt: new Date(),
      })
      .where(eq(user.id, userId));
  } catch (error) {
    log.error("Failed to write refreshed profile", {
      error: error instanceof Error ? error.message : String(error),
    });
    /* still return the values we attempted to write so callers don't fall
       back to nothing when the write failed transiently */
    return {
      name: profile.name,
      displayName: profile.displayName,
      image: profile.image,
      updated: false,
    };
  }

  return {
    name: profile.name,
    displayName: profile.displayName,
    image: profile.image,
    updated: true,
  };
}

/* public entry point. wraps refreshDiscordProfileUnsafe so any unexpected
   throw (DB hiccup in getDiscordAccountId, etc.) degrades to "we tried, nothing
   changed" instead of propagating up and 500ing the tRPC endpoint */
export async function refreshDiscordProfile(userId: string): Promise<RefreshResult> {
  /* open a manual span around the refresh body so BS dashboards show wall-clock
     duration of this specific operation. the outbound discord-lookup HTTP call
     dominates, but it's opaque without instrumentation */
  return wrapInSpan("discord_profile_refresh", async () => {
    try {
      return await refreshDiscordProfileUnsafe(userId);
    } catch (error) {
      log.error("refreshDiscordProfile unexpectedly threw; degrading gracefully", {
        error: error instanceof Error ? error.message : String(error),
        userId,
      });
      return { name: null, displayName: null, image: null, updated: false };
    }
  });
}

/* strips the internal `profileUpdatedAt` cache marker from any user-shell-shaped
   row before it crosses the tRPC wire. preserves the input's other fields and
   their narrow types (e.g. role enum) via the Omit return */
export function toPublicUser<T extends { profileUpdatedAt?: Date | null }>(
  u: T,
): Omit<T, "profileUpdatedAt">;
export function toPublicUser<T extends { profileUpdatedAt?: Date | null }>(
  u: T | null | undefined,
): Omit<T, "profileUpdatedAt"> | null;
export function toPublicUser<T extends { profileUpdatedAt?: Date | null }>(
  u: T | null | undefined,
): Omit<T, "profileUpdatedAt"> | null {
  if (!u) return null;
  const { profileUpdatedAt: _unused, ...rest } = u;
  return rest;
}

interface LazyRefreshTarget {
  id: string;
  profileUpdatedAt: Date | null;
}

/* bound the lazy-refresh fan-out. each refresh is a DB read + an external
   discord-lookup fetch (5s timeout) + a write, and it fires on every list/detail
   render - so without limits a single page of stale creators fans out into N
   concurrent lookups, and two concurrent requests both refresh the same user
   (the in-helper 60s cooldown is checked only after its own DB read, so
   concurrent calls race past it). a per-user in-flight set dedupes, and a small
   concurrency cap serialises the burst. refreshes are best-effort and
   eventually-consistent, so queueing changes nothing user-visible */
const MAX_CONCURRENT_REFRESHES = 3;
const inFlightRefreshes = new Set<string>();
const refreshQueue: string[] = [];
let activeRefreshes = 0;

function drainRefreshQueue(): void {
  while (activeRefreshes < MAX_CONCURRENT_REFRESHES && refreshQueue.length > 0) {
    const userId = refreshQueue.shift()!;
    activeRefreshes++;
    void refreshDiscordProfile(userId)
      .catch(() => {}) // already logged inside the helper
      .finally(() => {
        inFlightRefreshes.delete(userId);
        activeRefreshes--;
        drainRefreshQueue();
      });
  }
}

function scheduleLazyRefresh(userId: string): void {
  if (inFlightRefreshes.has(userId)) return; // already queued or running
  inFlightRefreshes.add(userId);
  refreshQueue.push(userId);
  drainRefreshQueue();
}

export function enqueueLazyProfileRefresh(
  users: ReadonlyArray<LazyRefreshTarget | null | undefined>,
): void {
  const now = Date.now();

  for (const candidate of users) {
    if (!candidate) continue;

    const updatedAt = candidate.profileUpdatedAt;
    const isStale = updatedAt === null || now - updatedAt.getTime() > STALE_THRESHOLD_MS;

    if (!isStale) continue;

    scheduleLazyRefresh(candidate.id);
  }
}

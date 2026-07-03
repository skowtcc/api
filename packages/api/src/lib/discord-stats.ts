/*
 * live member/online counts for the skowt + Antifield Discord (discord.gg/noid
 * - the same server users must join to download). runs server-side to dodge the
 * browser CORS block on Discord's invite API. mirrors the originoid implementation:
 * a single unauthenticated invite fetch, cached in-memory, with a fallback so a
 * Discord outage never breaks the page
 */

const INVITE_CODE = "noid";
const FALLBACK = { members: 6167, online: 948 };
const TTL = 60_000;

let cache: { members: number; online: number; at: number } | null = null;

export async function getDiscordStats(): Promise<{
  members: number;
  online: number;
}> {
  const now = Date.now();
  if (cache && now - cache.at < TTL) {
    return { members: cache.members, online: cache.online };
  }
  try {
    const res = await fetch(`https://discord.com/api/v9/invites/${INVITE_CODE}?with_counts=true`, {
      headers: { "user-agent": "skowt.cc" },
    });
    if (!res.ok) throw new Error(`discord ${res.status}`);
    const data = (await res.json()) as {
      approximate_member_count?: number;
      approximate_presence_count?: number;
    };
    const members = data.approximate_member_count ?? FALLBACK.members;
    const online = data.approximate_presence_count ?? FALLBACK.online;
    cache = { members, online, at: now };
    return { members, online };
  } catch {
    return cache ?? FALLBACK;
  }
}

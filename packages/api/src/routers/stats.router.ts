import { publicProcedure, router } from "../index";
import { db, asset, game, eq, sql } from "@skowt-monorepo/db";
import * as cache from "../lib/cache";
import { getDiscordStats } from "../lib/discord-stats";

const TEN_MINUTES_MS = 10 * 60 * 1000;

export interface SiteTotals {
  assets: number;
  games: number;
  downloads: number;
  views: number;
}

export const statsRouter = router({
  getSiteTotals: publicProcedure.query(async (): Promise<SiteTotals> => {
    const cacheKey = cache.keys.siteStats;
    const cached = await cache.get<SiteTotals>(cacheKey);
    if (cached) return cached;

    // downloads / views are the live sum of the per-asset counters; assets /
    // games are live counts, all cheap over the approved set and cached 10 min
    const [[assetStats], [gameCount]] = await Promise.all([
      db
        .select({
          assets: sql<number>`count(*)`,
          downloads: sql<number>`coalesce(sum(${asset.downloadCount}), 0)`,
          views: sql<number>`coalesce(sum(${asset.viewCount}), 0)`,
        })
        .from(asset)
        .where(eq(asset.status, "approved")),
      db.select({ n: sql<number>`count(*)` }).from(game),
    ]);

    const result: SiteTotals = {
      assets: assetStats?.assets ?? 0,
      games: gameCount?.n ?? 0,
      downloads: assetStats?.downloads ?? 0,
      views: assetStats?.views ?? 0,
    };
    await cache.set(cacheKey, result, TEN_MINUTES_MS);
    return result;
  }),

  // live Discord server counts for the members chip (real-time API, not the DB)
  getDiscord: publicProcedure.query(() => getDiscordStats()),
});

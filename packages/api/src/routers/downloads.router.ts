import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notFound, badRequest } from "../lib/errors";
import { protectedProcedure, serverMemberProcedure, router } from "../index";
import { db, asset, eq, and, inArray, sql } from "@skowt-monorepo/db";
import {
  recordDownloadBatch,
  getDownloadBatches,
  deleteDownloadBatch,
  getDownloadBatch,
  clearAllBatches,
  getBatchCount,
  PayloadTooLargeError,
} from "../lib/redis";
import {
  checkDiscordServerMembership,
  invalidateServerMembershipCache,
} from "../lib/discord-server";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";

const uuidSchema = z.string().uuid();

const batchAssetSchema = z.object({
  id: z.string().min(1).max(100),
  name: z.string().min(1).max(255),
  extension: z.string().min(1).max(10),
  gameName: z.string().min(1).max(100),
  categoryName: z.string().min(1).max(100),
});

export const downloadsRouter = router({
  record: serverMemberProcedure
    .use(withRateLimit(RATE_LIMITS.download))
    .input(z.object({ assets: z.array(batchAssetSchema).min(1).max(350) }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const assetIds = input.assets.map((a) => a.id);
      const validAssets = await db.query.asset.findMany({
        where: and(inArray(asset.id, assetIds), eq(asset.status, "approved")),
        columns: { id: true, name: true, extension: true },
        with: { game: { columns: { name: true } }, category: { columns: { name: true } } },
      });

      if (validAssets.length === 0) {
        badRequest("no valid assets to download");
      }

      const validAssetMap = new Map(validAssets.map((a) => [a.id, a]));
      const verifiedAssets = input.assets
        .filter((a) => validAssetMap.has(a.id))
        .map((a) => {
          const dbAsset = validAssetMap.get(a.id)!;
          return {
            id: a.id,
            name: dbAsset.name,
            extension: dbAsset.extension,
            gameName: dbAsset.game.name,
            categoryName: dbAsset.category.name,
          };
        });

      /* mass downloads count toward download_count just like the single
         download button (asset.recordDownload) - one tick per asset per batch */
      await db
        .update(asset)
        .set({ downloadCount: sql`${asset.downloadCount} + 1` })
        .where(
          inArray(
            asset.id,
            verifiedAssets.map((a) => a.id),
          ),
        );

      try {
        const batchId = await recordDownloadBatch(userId, verifiedAssets);
        if (!batchId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to record download",
          });
        }
        return { batchId };
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Download batch too large" });
        }
        throw error;
      }
    }),

  history: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(
      z.object({
        limit: z.number().min(1).max(50).default(20),
        offset: z.number().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const { limit, offset } = input;

      const batches = await getDownloadBatches(userId, limit + 1, offset);
      const hasMore = batches.length > limit;
      const items = hasMore ? batches.slice(0, limit) : batches;

      const total = await getBatchCount(userId);

      return { batches: items, hasMore, total };
    }),

  getBatch: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(z.object({ batchId: uuidSchema }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const assets = await getDownloadBatch(userId, input.batchId);

      if (!assets) {
        notFound("batch");
      }

      return { assets };
    }),

  deleteBatch: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.download))
    .input(z.object({ batchId: uuidSchema }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const deleted = await deleteDownloadBatch(userId, input.batchId);
      return { success: deleted };
    }),

  /* no current FE caller; the downloads list UI only offers per-batch delete,
     not bulk-clear. tests retained as a behavioural contract for any future
     "clear all downloads" affordance */
  clear: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.download))
    .input(z.void())
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      await clearAllBatches(userId);
      return { success: true };
    }),

  serverStatus: protectedProcedure.use(withRateLimit(RATE_LIMITS.query)).query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const inServer = await checkDiscordServerMembership(userId);
    return { inServer };
  }),

  refreshServerStatus: protectedProcedure
    .use(withRateLimit({ limit: 1, windowSeconds: 15 }))
    .input(z.void())
    .mutation(async ({ ctx }) => {
      const userId = ctx.session.user.id;
      await invalidateServerMembershipCache(userId);
      const inServer = await checkDiscordServerMembership(userId);
      return { inServer };
    }),
});

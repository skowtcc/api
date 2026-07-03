import { z } from "zod";
import { protectedProcedure, serverMemberProcedure, router } from "../index";
import {
  db,
  savedAsset,
  asset,
  assetToTag,
  tag,
  eq,
  and,
  desc,
  asc,
  inArray,
  sql,
} from "@skowt-monorepo/db";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { formatAssetResponse } from "../lib/schemas";
import { assetNameCondition } from "../lib/fts";
import { notFound } from "../lib/errors";

const sortBySchema = z.enum(["date", "name", "downloads", "views"]).default("downloads");
const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");

const bookmarkQuerySchema = z.object({
  name: z.string().min(2).max(255).optional(),
  games: z.array(z.string().max(100)).max(20).optional(),
  categories: z.array(z.string().max(100)).max(20).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  sortBy: sortBySchema,
  sortOrder: sortOrderSchema,
  offset: z.number().min(0).default(0),
  limit: z.number().min(1).max(100).default(20),
});

export const bookmarkRouter = router({
  toggle: serverMemberProcedure
    .use(withRateLimit(RATE_LIMITS.bookmark))
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const assetExists = await db.query.asset.findFirst({
        where: and(eq(asset.id, input.assetId), eq(asset.status, "approved")),
        columns: { id: true },
      });

      if (!assetExists) {
        notFound("asset");
      }

      return await db.transaction(async (tx) => {
        const existing = await tx.query.savedAsset.findFirst({
          where: and(eq(savedAsset.userId, userId), eq(savedAsset.assetId, input.assetId)),
        });

        if (existing) {
          await tx.delete(savedAsset).where(eq(savedAsset.id, existing.id));
          return { saved: false };
        }

        await tx.insert(savedAsset).values({ userId, assetId: input.assetId });
        return { saved: true };
      });
    }),

  exists: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(z.object({ assetId: z.string() }))
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const existing = await db.query.savedAsset.findFirst({
        where: and(eq(savedAsset.userId, userId), eq(savedAsset.assetId, input.assetId)),
        columns: { id: true },
      });

      return { saved: !!existing };
    }),

  list: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(bookmarkQuerySchema)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const { name, games, categories, tags, sortBy, sortOrder, offset, limit } = input;

      const assetConditions = [eq(asset.status, "approved")];
      if (name) assetConditions.push(assetNameCondition(name));
      if (games && games.length > 0) assetConditions.push(inArray(asset.gameId, games));
      if (categories && categories.length > 0) {
        assetConditions.push(inArray(asset.categoryId, categories));
      }

      // database-level tag filtering using correlated subquery (AND logic - asset must have all specified tags)
      if (tags && tags.length > 0) {
        for (const tagSlug of tags) {
          const tagExistsCondition = sql`EXISTS (
            SELECT 1 FROM ${assetToTag}
            INNER JOIN ${tag} ON ${tag.id} = ${assetToTag.tagId}
            WHERE ${assetToTag.assetId} = ${asset.id}
              AND ${tag.slug} = ${tagSlug.toLowerCase()}
          )`;
          assetConditions.push(tagExistsCondition);
        }
      }

      const orderFn = sortOrder === "asc" ? asc : desc;
      const getOrderByClause = () => {
        switch (sortBy) {
          case "name":
            // NOCASE to match asset.query - see the name-cursor note there
            return [
              orderFn(sql`${asset.name} COLLATE NOCASE`),
              orderFn(savedAsset.createdAt),
              orderFn(savedAsset.id),
            ];
          case "downloads":
            return [
              orderFn(asset.downloadCount),
              orderFn(savedAsset.createdAt),
              orderFn(savedAsset.id),
            ];
          case "views":
            return [
              orderFn(asset.viewCount),
              orderFn(savedAsset.createdAt),
              orderFn(savedAsset.id),
            ];
          default:
            return [orderFn(savedAsset.createdAt), orderFn(savedAsset.id)];
        }
      };

      /* page the bookmark ids first (ordering needs the asset join), then
         hydrate them. no COUNT(*): the client doesn't use a total, and computing
         one repeats the full filtered join -- including the per-tag EXISTS
         subqueries -- every page. hasMore comes from over-fetching one */
      const pageRows = await db
        .select({
          bookmarkId: savedAsset.id,
        })
        .from(savedAsset)
        .innerJoin(asset, eq(asset.id, savedAsset.assetId))
        .where(and(eq(savedAsset.userId, userId), ...assetConditions))
        .orderBy(...getOrderByClause())
        .offset(offset)
        .limit(limit + 1);

      const hasMore = pageRows.length > limit;
      const pageIds = (hasMore ? pageRows.slice(0, limit) : pageRows).map((row) => row.bookmarkId);

      if (pageIds.length === 0) {
        return { items: [], hasMore: false };
      }

      const bookmarks = await db.query.savedAsset.findMany({
        where: and(eq(savedAsset.userId, userId), inArray(savedAsset.id, pageIds)),
        with: {
          asset: {
            with: { game: true, category: true, assetToTags: { with: { tag: true } } },
          },
        },
      });

      const bookmarkById = new Map(bookmarks.map((bookmark) => [bookmark.id, bookmark]));
      const orderedItems = pageIds
        .map((id) => bookmarkById.get(id))
        .filter((bookmark): bookmark is NonNullable<typeof bookmark> => Boolean(bookmark));

      return {
        items: orderedItems.map((s) => ({
          savedAt: s.createdAt,
          asset: formatAssetResponse(s.asset),
        })),
        hasMore,
      };
    }),

  /* no current FE caller; bookmark count isn't surfaced in any header / badge.
     tests retained as a behavioural contract for any future counter affordance */
  count: protectedProcedure.use(withRateLimit(RATE_LIMITS.query)).query(async ({ ctx }) => {
    const userId = ctx.session.user.id;
    const [result] = await db
      .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
      .from(savedAsset)
      .where(eq(savedAsset.userId, userId));
    return { count: result?.count ?? 0 };
  }),
});

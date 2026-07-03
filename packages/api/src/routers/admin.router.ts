import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { developerProcedure, router } from "../index";
import {
  db,
  game,
  category,
  gameToCategory,
  tag,
  asset,
  assetToTag,
  eq,
  and,
  sql,
} from "@skowt-monorepo/db";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import * as cache from "../lib/cache";

/* developer-gated catalog management (games, categories, tags). no current FE
   consumer: /dashboard doesn't surface these and there's no admin UI route.
   reserved for migration to platform-level admin under Antifield, which will
   host cross-product admin surfaces rather than per-product ones. tests
   retained as a behavioural contract for that migration */

const slugSchema = z
  .string()
  .min(1)
  .regex(/^[a-z0-9-]+$/);

/* catalog edits change data embedded in cached search results (per-asset
   game/category names, tag filtering) and the cached `filters:all` list, and
   force-deletes cascade approved assets out of the DB (asset.gameId/categoryId
   are onDelete:cascade). these mutations are rare and developer-gated, so
   blanket-invalidate the filters list plus the full content blast radius after
   each write rather than letting public (cached) reads serve stale data */
async function invalidateCatalogCaches(): Promise<void> {
  await cache.invalidateCatalogStructure();
}

export const adminRouter = router({
  createGame: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ name: z.string().min(1), slug: slugSchema }))
    .mutation(async ({ input }) => {
      const existing = await db.query.game.findFirst({ where: eq(game.slug, input.slug) });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Game with this slug already exists" });
      }

      const [newGame] = await db
        .insert(game)
        .values({ name: input.name, slug: input.slug, lastUpdated: new Date() })
        .returning();

      await invalidateCatalogCaches();
      return newGame;
    }),

  updateGame: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(
      z.object({ id: z.string(), name: z.string().min(1).optional(), slug: slugSchema.optional() }),
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;

      if (updates.slug) {
        const existing = await db.query.game.findFirst({ where: eq(game.slug, updates.slug) });
        if (existing && existing.id !== id) {
          throw new TRPCError({ code: "CONFLICT", message: "Game with this slug already exists" });
        }
      }

      await db
        .update(game)
        .set({ ...updates, lastUpdated: new Date() })
        .where(eq(game.id, id));
      await invalidateCatalogCaches();
      return { success: true };
    }),

  deleteGame: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ id: z.string(), force: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const [usage] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(asset)
        .where(eq(asset.gameId, input.id));

      if ((usage?.count ?? 0) > 0 && !input.force) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete game: ${usage!.count} assets still reference it. Pass force=true to delete anyway.`,
        });
      }

      await db.delete(game).where(eq(game.id, input.id));
      await invalidateCatalogCaches();
      return { success: true };
    }),

  createCategory: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ name: z.string().min(1), slug: slugSchema }))
    .mutation(async ({ input }) => {
      const existing = await db.query.category.findFirst({ where: eq(category.slug, input.slug) });
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Category with this slug already exists",
        });
      }

      const [newCategory] = await db
        .insert(category)
        .values({ name: input.name, slug: input.slug })
        .returning();
      await invalidateCatalogCaches();
      return newCategory;
    }),

  updateCategory: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(
      z.object({ id: z.string(), name: z.string().min(1).optional(), slug: slugSchema.optional() }),
    )
    .mutation(async ({ input }) => {
      const { id, ...updates } = input;

      if (updates.slug) {
        const existing = await db.query.category.findFirst({
          where: eq(category.slug, updates.slug),
        });
        if (existing && existing.id !== id) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Category with this slug already exists",
          });
        }
      }

      await db.update(category).set(updates).where(eq(category.id, id));
      await invalidateCatalogCaches();
      return { success: true };
    }),

  deleteCategory: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ id: z.string(), force: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const [usage] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(asset)
        .where(eq(asset.categoryId, input.id));

      if ((usage?.count ?? 0) > 0 && !input.force) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete category: ${usage!.count} assets still reference it. Pass force=true to delete anyway.`,
        });
      }

      await db.delete(category).where(eq(category.id, input.id));
      await invalidateCatalogCaches();
      return { success: true };
    }),

  linkGameCategory: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ gameId: z.string(), categoryId: z.string() }))
    .mutation(async ({ input }) => {
      const result = await db.transaction(async (tx) => {
        const existing = await tx.query.gameToCategory.findFirst({
          where: and(
            eq(gameToCategory.gameId, input.gameId),
            eq(gameToCategory.categoryId, input.categoryId),
          ),
        });

        if (existing) {
          await tx
            .delete(gameToCategory)
            .where(
              and(
                eq(gameToCategory.gameId, input.gameId),
                eq(gameToCategory.categoryId, input.categoryId),
              ),
            );
          return { linked: false };
        } else {
          await tx
            .insert(gameToCategory)
            .values({ gameId: input.gameId, categoryId: input.categoryId });
          return { linked: true };
        }
      });

      await invalidateCatalogCaches();
      return result;
    }),

  createTag: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ name: z.string().min(1), slug: slugSchema }))
    .mutation(async ({ input }) => {
      const existing = await db.query.tag.findFirst({ where: eq(tag.slug, input.slug) });
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: "Tag with this slug already exists" });
      }

      const [newTag] = await db
        .insert(tag)
        .values({ name: input.name, slug: input.slug })
        .returning();
      await invalidateCatalogCaches();
      return newTag;
    }),

  deleteTag: developerProcedure
    .use(withRateLimit(RATE_LIMITS.admin))
    .input(z.object({ id: z.string(), force: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      const [usage] = await db
        .select({ count: sql<number>`COUNT(*)`.mapWith(Number) })
        .from(assetToTag)
        .where(eq(assetToTag.tagId, input.id));

      if ((usage?.count ?? 0) > 0 && !input.force) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `Cannot delete tag: ${usage!.count} assets still use it. Pass force=true to delete anyway.`,
        });
      }

      await db.delete(tag).where(eq(tag.id, input.id));
      await invalidateCatalogCaches();
      return { success: true };
    }),
});

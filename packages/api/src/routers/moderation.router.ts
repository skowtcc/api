import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { createLogger } from "@skowt-monorepo/observability/server";
import { notFound } from "../lib/errors";
import { developerProcedure, router } from "../index";
import { db, asset, eq, ne, and, desc, lt, inArray } from "@skowt-monorepo/db";
import * as cache from "../lib/cache";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { moveFile, deleteFile, fileExists } from "../lib/s3";
import { thumbKey } from "../lib/thumbnails";
import { paginationSchema } from "../lib/schemas";
import { keysetPage } from "../lib/pagination";
import { enqueueLazyProfileRefresh, toPublicUser } from "../lib/discord-profile";

const log = createLogger("moderation");

export const moderationRouter = router({
  getPending: developerProcedure
    .use(withRateLimit(RATE_LIMITS.moderate))
    .input(paginationSchema)
    .query(async ({ input }) => {
      const { cursor, limit } = input;

      /* only committed uploads: pre-commit rows carry the placeholder hash (== id)
         and their file may still be uploading - surfacing them lets the browser
         request a limbo object that doesn't exist yet, and the CDN caches the 404 */
      const conditions = [eq(asset.status, "pending"), ne(asset.hash, asset.id)];
      if (cursor) conditions.push(lt(asset.createdAt, new Date(cursor)));

      const results = await db.query.asset.findMany({
        where: and(...conditions),
        orderBy: [desc(asset.createdAt)],
        limit: limit + 1,
        with: {
          game: true,
          category: true,
          uploader: {
            columns: {
              id: true,
              name: true,
              image: true,
              role: true,
              profileUpdatedAt: true,
            },
          },
        },
      });

      enqueueLazyProfileRefresh(results.map((r) => r.uploader));

      const { items, nextCursor } = keysetPage(
        results,
        limit,
        (last) => last.createdAt?.toISOString() ?? null,
      );

      const sanitized = items.map(({ uploader, ...rest }) => ({
        ...rest,
        uploader: toPublicUser(uploader),
      }));

      return { items: sanitized, nextCursor };
    }),

  setStatus: developerProcedure
    .use(withRateLimit(RATE_LIMITS.moderate))
    .input(z.object({ assetId: z.string(), status: z.enum(["approved", "denied"]) }))
    .mutation(async ({ input }) => {
      const existingAsset = await db.query.asset.findFirst({
        where: and(eq(asset.id, input.assetId), eq(asset.status, "pending")),
        columns: { id: true, extension: true },
      });

      if (!existingAsset) {
        notFound("pending asset");
      }

      /* storage keys derive from the asset ID (hash is a content fingerprint,
         not a key - post-backfill it holds the sha256 of the bytes) */
      const limboKey = `limbo/${existingAsset.id}.${existingAsset.extension}`;
      const assetKey = `asset/${existingAsset.id}.${existingAsset.extension}`;

      if (input.status === "approved") {
        const moved = await moveFile(limboKey, assetKey);
        if (!moved) {
          /* moveFile deletes the limbo source on success, so a retry after a
             failed status write finds no source and returns false. if the
             destination is already present a prior attempt moved it - treat as
             done and fall through to (re)commit the status. otherwise it's a
             real move failure. this keeps approve idempotent under retry */
          const alreadyMoved = await fileExists(assetKey);
          if (!alreadyMoved) {
            throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Failed to move file" });
          }
        }
      } else {
        await deleteFile(limboKey).catch((error) => {
          log.warn("Failed to delete limbo file", { error });
        });
        // the commit-time thumbnail lives under asset/ regardless of queue path
        await deleteFile(thumbKey(existingAsset.id)).catch(() => {});
      }

      await db.update(asset).set({ status: input.status }).where(eq(asset.id, input.assetId));

      if (input.status === "approved") {
        /* a newly-approved asset must appear in search, related, drops, the
           game landing, the sitemap, and the site totals - not just search */
        await cache.invalidateApprovedAssetContent();
      }

      return { success: true };
    }),

  /* bulk-approve every committed pending asset (the dashboard "approve all").
     moves each limbo object to the public prefix - idempotent per asset, like
     setStatus - then flips the moved ones to approved in one update and
     invalidates the public caches once. there is deliberately no "deny all" */
  approveAll: developerProcedure.use(withRateLimit(RATE_LIMITS.moderate)).mutation(async () => {
    const pending = await db.query.asset.findMany({
      where: and(eq(asset.status, "pending"), ne(asset.hash, asset.id)),
      columns: { id: true, extension: true },
    });
    if (pending.length === 0) {
      return { approved: 0 };
    }

    const moved = await Promise.all(
      pending.map(async (a) => {
        const limboKey = `limbo/${a.id}.${a.extension}`;
        const assetKey = `asset/${a.id}.${a.extension}`;
        if (await moveFile(limboKey, assetKey)) return a.id;
        // a prior partial attempt may have already moved this one
        if (await fileExists(assetKey)) return a.id;
        log.warn("approveAll: failed to move file", { assetId: a.id });
        return null;
      }),
    );
    const approvedIds = moved.filter((id): id is string => id !== null);
    if (approvedIds.length === 0) {
      return { approved: 0 };
    }

    await db.update(asset).set({ status: "approved" }).where(inArray(asset.id, approvedIds));
    await cache.invalidateApprovedAssetContent();

    return { approved: approvedIds.length };
  }),
});

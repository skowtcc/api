import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { notFound, forbidden, badRequest } from "../lib/errors";
import { v7 as uuidv7 } from "uuid";
import { contributorProcedure, protectedProcedure, router } from "../index";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import {
  db,
  asset,
  assetToTag,
  tag,
  game,
  category,
  eq,
  and,
  desc,
  asc,
  inArray,
  sql,
} from "@skowt-monorepo/db";
import {
  generatePresignedUploadUrl,
  fileExists,
  getFileSize,
  readFileFull,
  writeFile,
  deleteFile,
  ALLOWED_EXTENSIONS,
  MAX_FILE_SIZE,
  MIME_TO_EXTENSION,
} from "../lib/s3";
import * as cache from "../lib/cache";
import { readImageDimensions, hasImageSignature } from "../lib/image-dimensions";
import { generateThumbnail, thumbKey } from "../lib/thumbnails";
import { shouldSkipQueue } from "../lib/roles";
import { assertValidTagIds } from "../lib/ingest";
import { formatAssetResponse } from "../lib/schemas";
import { assetNameCondition } from "../lib/fts";
import { createLogger } from "@skowt-monorepo/observability/server";

const log = createLogger("uploads");

const requestUploadSchema = z.object({
  name: z.string().trim().min(3).max(255),
  gameId: z.string(),
  categoryId: z.string(),
  tagIds: z.array(z.string()).default([]),
  mimeType: z.string(),
  fileSize: z.number().positive(),
  isSuggestive: z.boolean().default(false),
  /* only honored for developers (shouldSkipQueue); everyone else always lands in the moderation queue regardless of what they send here */
  skipApproval: z.boolean().default(false),
});

const commitUploadSchema = z.object({
  assetId: z.string(),
});

/* same filter/sort vocabulary as asset.query / bookmark.list, scoped to the caller's own uploads (all statuses); offset-paginated like bookmark.list */
const uploadsListSchema = z.object({
  name: z.string().min(2).max(255).optional(),
  games: z.array(z.string().max(100)).max(20).optional(),
  categories: z.array(z.string().max(100)).max(20).optional(),
  tags: z.array(z.string().max(100)).max(20).optional(),
  sortBy: z.enum(["date", "name", "downloads", "views"]).default("date"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  status: z.enum(["pending", "approved", "denied"]).optional(),
  offset: z.number().min(0).default(0),
  limit: z.number().min(1).max(100).default(20),
});

export const uploadsRouter = router({
  list: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.query))
    .input(uploadsListSchema)
    .query(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const { name, games, categories, tags, sortBy, sortOrder, status, offset, limit } = input;

      const conditions = [eq(asset.uploadedBy, userId)];
      if (status) conditions.push(eq(asset.status, status));
      if (name) conditions.push(assetNameCondition(name));
      if (games && games.length > 0) conditions.push(inArray(asset.gameId, games));
      if (categories && categories.length > 0) {
        conditions.push(inArray(asset.categoryId, categories));
      }
      // and tag filtering via correlated EXISTS (same as bookmark.list)
      if (tags && tags.length > 0) {
        for (const tagSlug of tags) {
          conditions.push(sql`EXISTS (
            SELECT 1 FROM ${assetToTag}
            INNER JOIN ${tag} ON ${tag.id} = ${assetToTag.tagId}
            WHERE ${assetToTag.assetId} = ${asset.id}
              AND ${tag.slug} = ${tagSlug.toLowerCase()}
          )`);
        }
      }

      const orderFn = sortOrder === "asc" ? asc : desc;
      const orderBy = (() => {
        switch (sortBy) {
          case "name":
            // NOCASE to match asset.query's name ordering
            return [orderFn(sql`${asset.name} COLLATE NOCASE`), orderFn(asset.id)];
          case "downloads":
            return [orderFn(asset.downloadCount), orderFn(asset.id)];
          case "views":
            return [orderFn(asset.viewCount), orderFn(asset.id)];
          default:
            return [orderFn(asset.createdAt), orderFn(asset.id)];
        }
      })();

      const results = await db.query.asset.findMany({
        where: and(...conditions),
        orderBy,
        offset,
        limit: limit + 1,
        with: { game: true, category: true, assetToTags: { with: { tag: true } } },
      });

      const hasMore = results.length > limit;
      const items = (hasMore ? results.slice(0, limit) : results).map((a) => ({
        ...formatAssetResponse(a),
        status: a.status,
      }));

      return { items, hasMore };
    }),

  /* no current FE caller; per-user upload counters not surfaced anywhere in /dashboard or the upload form. tests retained as a behavioural contract */
  getStats: protectedProcedure.use(withRateLimit(RATE_LIMITS.query)).query(async ({ ctx }) => {
    const userId = ctx.session.user.id;

    // single query with conditional counts instead of 3 separate queries
    const [stats] = await db
      .select({
        pending: sql<number>`SUM(CASE WHEN ${asset.status} = 'pending' THEN 1 ELSE 0 END)`.mapWith(
          Number,
        ),
        approved:
          sql<number>`SUM(CASE WHEN ${asset.status} = 'approved' THEN 1 ELSE 0 END)`.mapWith(
            Number,
          ),
        denied: sql<number>`SUM(CASE WHEN ${asset.status} = 'denied' THEN 1 ELSE 0 END)`.mapWith(
          Number,
        ),
        total: sql<number>`COUNT(*)`.mapWith(Number),
      })
      .from(asset)
      .where(eq(asset.uploadedBy, userId));

    return {
      pending: stats?.pending ?? 0,
      approved: stats?.approved ?? 0,
      denied: stats?.denied ?? 0,
      total: stats?.total ?? 0,
    };
  }),

  /* no current FE caller; the upload form is single-step and the asset detail view has no edit affordance for uploads. tests retained as a behavioural contract for any future uploader-edits-own-asset surface */
  update: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.upload))
    .input(
      z.object({
        assetId: z.string(),
        name: z.string().trim().min(1).max(255).optional(),
        isSuggestive: z.boolean().optional(),
        tagIds: z.array(z.string()).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;
      const { assetId, tagIds, ...updates } = input;

      const existing = await db.query.asset.findFirst({
        where: and(eq(asset.id, assetId), eq(asset.uploadedBy, userId)),
      });

      if (!existing) {
        notFound("asset");
      }

      if (existing.status !== "pending") {
        forbidden("cannot edit reviewed assets");
      }

      let validatedTagIds: string[] | null = null;
      if (tagIds !== undefined) {
        await assertValidTagIds(tagIds);
        validatedTagIds = tagIds;
      }

      await db.transaction(async (tx) => {
        if (Object.keys(updates).length > 0) {
          await tx.update(asset).set(updates).where(eq(asset.id, assetId));
        }

        if (validatedTagIds !== null) {
          await tx.delete(assetToTag).where(eq(assetToTag.assetId, assetId));
          if (validatedTagIds.length > 0) {
            await tx
              .insert(assetToTag)
              .values(validatedTagIds.map((tagId) => ({ assetId, tagId })));
          }
        }
      });

      return { success: true };
    }),

  /* no current FE caller; uploader-side delete is only done via moderation flow (moderation.setStatus REJECTED) today. tests retained as a behavioural contract for any future "withdraw my upload" affordance */
  delete: protectedProcedure
    .use(withRateLimit(RATE_LIMITS.upload))
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const existing = await db.query.asset.findFirst({
        where: and(eq(asset.id, input.assetId), eq(asset.uploadedBy, userId)),
      });

      if (!existing) {
        notFound("asset");
      }

      if (existing.status !== "pending") {
        forbidden("cannot delete reviewed assets");
      }

      /* the folder depends on the skip-approval choice made at request time, not the user's current role - try both, like cancelUpload does */
      const baseName = `${existing.id}.${existing.extension}`;
      await deleteFile(`asset/${baseName}`).catch(() => {});
      await deleteFile(`limbo/${baseName}`).catch(() => {});
      await deleteFile(thumbKey(existing.id)).catch(() => {
        // thumb may not exist yet (pre-commit delete)
      });

      await db.delete(asset).where(eq(asset.id, input.assetId));
      return { success: true };
    }),

  requestUpload: contributorProcedure
    .use(withRateLimit(RATE_LIMITS.upload))
    .input(requestUploadSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const extension = MIME_TO_EXTENSION[input.mimeType];
      if (!extension) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Invalid file type. Allowed: ${Object.keys(MIME_TO_EXTENSION).join(", ")}`,
        });
      }

      if (input.fileSize > MAX_FILE_SIZE) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        });
      }

      const gameExists = await db.query.game.findFirst({
        where: eq(game.id, input.gameId),
        columns: { id: true },
      });
      if (!gameExists) {
        badRequest("invalid game");
      }

      const categoryExists = await db.query.category.findFirst({
        where: eq(category.id, input.categoryId),
        columns: { id: true },
      });
      if (!categoryExists) {
        badRequest("invalid category");
      }

      const assetId = uuidv7();

      await assertValidTagIds(input.tagIds);
      const validatedTagIds = input.tagIds;

      // always insert as pending - approval happens in commitUpload after file verification
      await db.insert(asset).values({
        id: assetId,
        name: input.name,
        gameId: input.gameId,
        categoryId: input.categoryId,
        uploadedBy: userId,
        status: "pending",
        /* placeholder until commitUpload computes the real content sha256 - storage keys never derive from hash, so this value is never load-bearing */
        hash: assetId,
        size: input.fileSize,
        extension,
        isSuggestive: input.isSuggestive,
      });

      if (validatedTagIds.length > 0) {
        await db.insert(assetToTag).values(validatedTagIds.map((tagId) => ({ assetId, tagId })));
      }

      const skipQ = shouldSkipQueue(ctx.session.user.role) && input.skipApproval;

      const { uploadUrl, s3Key, expiresIn } = generatePresignedUploadUrl(assetId, extension, skipQ);

      return {
        assetId,
        uploadUrl,
        s3Key,
        expiresIn,
      };
    }),

  commitUpload: contributorProcedure
    .use(withRateLimit(RATE_LIMITS.upload))
    .input(commitUploadSchema)
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const pendingAsset = await db.query.asset.findFirst({
        where: and(
          eq(asset.id, input.assetId),
          eq(asset.uploadedBy, userId),
          eq(asset.status, "pending"),
        ),
      });

      if (!pendingAsset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pending asset not found or access denied",
        });
      }

      /* check both paths - file could be in asset/ (skipped queue) or limbo/ (pending review). storage keys derive from the asset ID - `hash` is a content fingerprint, never a key (the catalog's hashes are sha256 of the bytes and change when content is known; keys must not) */
      const baseName = `${pendingAsset.id}.${pendingAsset.extension}`;
      const inAsset = await fileExists(`asset/${baseName}`);
      const inLimbo = !inAsset && (await fileExists(`limbo/${baseName}`));

      if (!inAsset && !inLimbo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "File not found in storage. Please try uploading again.",
        });
      }

      /* read the whole object once, for four purposes:
       *  1. reject non-image bytes (a presigned PUT does not pin Content-Type;
       *     magic-byte check is lenient so exotic-but-valid images pass while
       *     HTML/JS is blocked)
       *  2. dimensions, to reserve the client's layout box
       *  3. the real content sha256 into `hash` (matches the backfilled
       *     catalog; enables duplicate detection by GROUP BY hash)
       *  4. the card thumbnail. this one is FAIL-CLOSED: the web requests
       *     {id}-thumb.webp for every card, so an asset without a thumb would
       *     render broken - a commit that can't produce a thumb is rejected
       */
      const s3Key = `${inAsset ? "asset" : "limbo"}/${baseName}`;

      /* bound the object before reading it into memory. the presigned PUT accepts any byte count regardless of the requestUpload-declared fileSize, so this stat is the only real size enforcement. oversized -> delete + reject; unstattable -> reject without reading (could be unbounded) and without deleting (may be a valid object mid-flight) */
      const actualSize = await getFileSize(s3Key);
      if (actualSize === null) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to read uploaded file. Please try again.",
        });
      }
      if (actualSize > MAX_FILE_SIZE) {
        await deleteFile(s3Key).catch((error) =>
          log.warn("Failed to delete oversized upload", { error, assetId: input.assetId }),
        );
        throw new TRPCError({
          code: "PAYLOAD_TOO_LARGE",
          message: `File too large. Max size: ${MAX_FILE_SIZE / 1024 / 1024}MB`,
        });
      }

      const bytes = await readFileFull(s3Key);
      if (!bytes) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to read uploaded file. Please try again.",
        });
      }

      if (!hasImageSignature(bytes)) {
        /* stored bytes are not a valid image (e.g. HTML/JS behind an image extension). remove the object so it can never be served, then reject */
        await deleteFile(s3Key).catch((error) =>
          log.warn("Failed to delete rejected non-image upload", { error, assetId: input.assetId }),
        );
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Uploaded file is not a valid image.",
        });
      }

      let thumb: Uint8Array;
      try {
        thumb = await generateThumbnail(bytes);
      } catch (error) {
        log.warn("Thumbnail generation failed on commit", { error, assetId: input.assetId });
        await deleteFile(s3Key).catch(() => {});
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not process the uploaded image.",
        });
      }
      await writeFile(thumbKey(pendingAsset.id), thumb, "image/webp");

      const dims = readImageDimensions(bytes);
      const contentHash = new Bun.CryptoHasher("sha256").update(bytes).digest("hex");

      await db
        .update(asset)
        .set({
          hash: contentHash,
          // reconcile the client-declared size with the real bytes on disk
          size: actualSize,
          ...(dims ? { metadata: { image: dims } } : {}),
          ...(inAsset ? { status: "approved" as const } : {}),
        })
        .where(eq(asset.id, input.assetId));

      /* a skip-queue commit lands straight in `approved`, so it changes public content just like a moderation approval - invalidate the same caches */
      if (inAsset) {
        await cache.invalidateApprovedAssetContent();
      }

      return {
        success: true,
        assetId: input.assetId,
      };
    }),

  /* no current FE caller; abandoned-upload cleanup is future tooling. tests retained as a behavioural contract */
  cancelUpload: contributorProcedure
    .use(withRateLimit(RATE_LIMITS.upload))
    .input(z.object({ assetId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const userId = ctx.session.user.id;

      const pendingAsset = await db.query.asset.findFirst({
        where: and(
          eq(asset.id, input.assetId),
          eq(asset.uploadedBy, userId),
          eq(asset.status, "pending"),
        ),
      });

      if (!pendingAsset) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pending asset not found or access denied",
        });
      }

      // try both paths since developer may have opted into limbo
      const baseName = `${pendingAsset.id}.${pendingAsset.extension}`;
      try {
        await deleteFile(`asset/${baseName}`);
      } catch {
        /* may not exist */
      }
      try {
        await deleteFile(`limbo/${baseName}`);
      } catch {
        /* may not exist */
      }
      try {
        await deleteFile(thumbKey(pendingAsset.id));
      } catch {
        /* may not exist yet */
      }

      await db.delete(asset).where(eq(asset.id, input.assetId));

      return { success: true };
    }),

  /* no current FE caller; the upload form hardcodes the constraints client-side. tests retained as a behavioural contract for any future server-driven constraint surface */
  getUploadConstraints: contributorProcedure.use(withRateLimit(RATE_LIMITS.query)).query(() => ({
    maxFileSize: MAX_FILE_SIZE,
    allowedExtensions: ALLOWED_EXTENSIONS,
    allowedMimeTypes: Object.keys(MIME_TO_EXTENSION),
  })),
});

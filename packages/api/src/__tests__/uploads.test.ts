import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller, mockS3 } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestTag,
  seedTestAsset,
  createTestContext,
  createAuthenticatedContext,
  testDb,
} from "./helpers";
import * as schema from "@skowt-monorepo/db/schema";
import { eq } from "drizzle-orm";
import sharp from "sharp";

/* a real, sharp-decodable PNG - commitUpload reads the full object to
   signature-check, hash, measure, and thumbnail it, so a header-only fixture
   won't do */
let realPng: Uint8Array;

describe("Uploads Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
    realPng = new Uint8Array(
      await sharp({
        create: { width: 8, height: 8, channels: 4, background: { r: 10, g: 20, b: 30, alpha: 1 } },
      })
        .png()
        .toBuffer(),
    );
  });

  beforeEach(async () => {
    await clearTestDatabase();
    /* reset mock S3 to default behaviour: object exists, is a modest size, and
       holds a valid PNG */
    mockS3.fileExists = async () => true;
    mockS3.getFileSize = async () => 1024;
    mockS3.readFileFull = async () => realPng;
    mockS3.writeFile = async () => {};
    mockS3.deleteFile = async () => {};
  });

  describe("requestUpload", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: "some-game",
          categoryId: "some-category",
          mimeType: "image/png",
          fileSize: 1024,
        }),
      ).rejects.toThrow("Authentication required");
    });

    test("requires contributor role", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: game.id,
          categoryId: category.id,
          mimeType: "image/png",
          fileSize: 1024,
        }),
      ).rejects.toThrow("Contributor access required");
    });

    test("contributor can request upload URL", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);
      const result = await caller.uploads.requestUpload({
        name: "Test Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      expect(result.assetId).toBeDefined();
      expect(result.uploadUrl).toContain("mock-s3");
      expect(result.s3Key).toContain(result.assetId);
      expect(result.s3Key.startsWith("limbo/")).toBe(true);
      expect(result.expiresIn).toBe(300);

      const asset = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, result.assetId),
      });
      expect(asset).toBeDefined();
      expect(asset?.name).toBe("Test Asset");
      expect(asset?.status).toBe("pending");
      expect(asset?.extension).toBe("png");
    });

    test("contributor skipApproval is ignored - still presigns to limbo/", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);
      const result = await caller.uploads.requestUpload({
        name: "Sneaky Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
        skipApproval: true,
      });

      expect(result.s3Key.startsWith("limbo/")).toBe(true);
    });

    test("developer skipApproval presigns straight to asset/", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);
      const result = await caller.uploads.requestUpload({
        name: "Trusted Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
        skipApproval: true,
      });

      expect(result.s3Key.startsWith("asset/")).toBe(true);
    });

    test("rejects invalid mime type", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: game.id,
          categoryId: category.id,
          mimeType: "application/pdf",
          fileSize: 1024,
        }),
      ).rejects.toThrow("Invalid file type");
    });

    test("rejects file too large", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: game.id,
          categoryId: category.id,
          mimeType: "image/png",
          fileSize: 100 * 1024 * 1024, // 100MB
        }),
      ).rejects.toThrow("File too large");
    });

    test("rejects invalid game", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      await seedTestCategory();

      const caller = createTestCaller(context);

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: "non-existent-game",
          categoryId: "some-category",
          mimeType: "image/png",
          fileSize: 1024,
        }),
      ).rejects.toThrow("invalid game");
    });

    test("rejects invalid category", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();

      const caller = createTestCaller(context);

      await expect(
        caller.uploads.requestUpload({
          name: "Test Asset",
          gameId: game.id,
          categoryId: "non-existent-category",
          mimeType: "image/png",
          fileSize: 1024,
        }),
      ).rejects.toThrow("invalid category");
    });

    test("creates asset with tags", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const tag1 = await seedTestTag({ name: "Official", slug: "official" });
      const tag2 = await seedTestTag({ name: "HD", slug: "hd" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.requestUpload({
        name: "Tagged Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/jpeg",
        fileSize: 2048,
        tagIds: [tag1.id, tag2.id],
      });

      const assetTags = await testDb.query.assetToTag.findMany({
        where: eq(schema.assetToTag.assetId, result.assetId),
      });
      expect(assetTags).toHaveLength(2);
    });

    test("accepts different image formats", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      const formats = [
        { mime: "image/png", ext: "png" },
        { mime: "image/jpeg", ext: "jpg" },
        { mime: "image/webp", ext: "webp" },
        { mime: "image/gif", ext: "gif" },
      ];

      for (const { mime, ext } of formats) {
        const result = await caller.uploads.requestUpload({
          name: `Test ${ext}`,
          gameId: game.id,
          categoryId: category.id,
          mimeType: mime,
          fileSize: 1024,
        });

        const asset = await testDb.query.asset.findFirst({
          where: eq(schema.asset.id, result.assetId),
        });
        expect(asset?.extension).toBe(ext);
      }
    });
  });

  describe("commitUpload", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.uploads.commitUpload({ assetId: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("requires contributor role", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.uploads.commitUpload({ assetId: "some-id" })).rejects.toThrow(
        "Contributor access required",
      );
    });

    test("commits upload when file exists", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Test Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      mockS3.fileExists = async () => true;

      const result = await caller.uploads.commitUpload({ assetId });

      expect(result.success).toBe(true);
      expect(result.assetId).toBe(assetId);
    });

    test("captures image dimensions from the header on commit", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Sized Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      /* a real 800x600 PNG - dims come from the same full read that feeds
         the thumbnailer */
      const bigPng = new Uint8Array(
        await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 4,
            background: { r: 1, g: 2, b: 3, alpha: 1 },
          },
        })
          .png()
          .toBuffer(),
      );
      mockS3.fileExists = async () => true;
      mockS3.readFileFull = async () => bigPng;

      await caller.uploads.commitUpload({ assetId });

      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.metadata).toEqual({ image: { width: 800, height: 600 } });
    });

    test("writes the card thumbnail and content hash on commit", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Thumbed Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      const writes: Array<{ key: string; contentType: string; size: number }> = [];
      mockS3.fileExists = async () => true;
      mockS3.writeFile = async (key, bytes, contentType) => {
        writes.push({ key, contentType, size: bytes.byteLength });
      };

      await caller.uploads.commitUpload({ assetId });

      expect(writes).toHaveLength(1);
      expect(writes[0].key).toBe(`asset/${assetId}-thumb.webp`);
      expect(writes[0].contentType).toBe("image/webp");
      expect(writes[0].size).toBeGreaterThan(0);

      // hash upgraded from the assetId placeholder to the content sha256
      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      const expectedHash = new Bun.CryptoHasher("sha256").update(realPng).digest("hex");
      expect(row?.hash).toBe(expectedHash);
    });

    test("rejects and deletes an oversized upload without reading it", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Oversized Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024, // client under-declares; the stored object is huge
      });

      const deleted: string[] = [];
      let readCalled = false;
      mockS3.fileExists = async () => true;
      mockS3.getFileSize = async () => mockS3.maxFileSize + 1;
      mockS3.deleteFile = async (key: string) => {
        deleted.push(key);
      };
      mockS3.readFileFull = async () => {
        readCalled = true;
        return realPng;
      };

      await expect(caller.uploads.commitUpload({ assetId })).rejects.toThrow("File too large");

      // the oversized object is removed and never read into memory
      expect(readCalled).toBe(false);
      expect(deleted).toContain(`asset/${assetId}.png`);

      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.status).toBe("pending");
    });

    test("rejects commit without reading when the object size is unknown", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Unstattable Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      const deleted: string[] = [];
      let readCalled = false;
      mockS3.fileExists = async () => true;
      mockS3.getFileSize = async () => null; // stat failed
      mockS3.deleteFile = async (key: string) => {
        deleted.push(key);
      };
      mockS3.readFileFull = async () => {
        readCalled = true;
        return realPng;
      };

      await expect(caller.uploads.commitUpload({ assetId })).rejects.toThrow(
        "Failed to read uploaded file",
      );

      /* an unstattable object is not read (could be unbounded) and not deleted
         (may be a valid object mid-flight); the row stays pending for retry */
      expect(readCalled).toBe(false);
      expect(deleted).toHaveLength(0);
      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.status).toBe("pending");
    });

    test("reconciles the stored size with the real bytes on commit", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Mis-sized Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024, // client-declared size, not the truth
      });

      mockS3.fileExists = async () => true;
      mockS3.getFileSize = async () => 4242; // the real object's size

      await caller.uploads.commitUpload({ assetId });

      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.size).toBe(4242);
    });

    test("rejects commit when the file can't be read (thumb is required)", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Unreadable Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      mockS3.fileExists = async () => true;
      mockS3.readFileFull = async () => null; // read fails

      await expect(caller.uploads.commitUpload({ assetId })).rejects.toThrow(
        "Failed to read uploaded file",
      );

      // stays pending for retry
      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.status).toBe("pending");
    });

    test("rejects commit when the stored bytes are not an image", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Not An Image",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      /* the presigned PUT doesn't pin Content-Type, so the stored object could be
         HTML/JS behind a .png extension - the commit must reject it */
      mockS3.fileExists = async () => true;
      mockS3.readFileFull = async () =>
        new TextEncoder().encode("<html><script>alert(1)</script></html>");

      await expect(caller.uploads.commitUpload({ assetId })).rejects.toThrow("not a valid image");

      // must not have been approved - stays pending
      const row = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(row?.status).toBe("pending");
    });

    test("keeps pending asset if file not found in S3", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Test Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      mockS3.fileExists = async () => false;

      await expect(caller.uploads.commitUpload({ assetId })).rejects.toThrow(
        "File not found in storage",
      );

      // verify asset is still pending for retry
      const asset = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(asset?.status).toBe("pending");
    });

    test("rejects commit for non-existent asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.uploads.commitUpload({ assetId: "non-existent" })).rejects.toThrow(
        "asset not found",
      );
    });

    test("rejects commit for other user's asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other", role: "developer" });
      const game = await seedTestGame();
      const category = await seedTestCategory();

      const asset = await seedTestAsset(game.id, category.id, otherUser.id, {
        status: "pending",
      });

      const caller = createTestCaller(context);

      await expect(caller.uploads.commitUpload({ assetId: asset.id })).rejects.toThrow(
        "asset not found",
      );
    });
  });

  describe("cancelUpload", () => {
    test("cancels pending upload", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const caller = createTestCaller(context);

      const { assetId } = await caller.uploads.requestUpload({
        name: "Test Asset",
        gameId: game.id,
        categoryId: category.id,
        mimeType: "image/png",
        fileSize: 1024,
      });

      const result = await caller.uploads.cancelUpload({ assetId });

      expect(result.success).toBe(true);

      const asset = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, assetId),
      });
      expect(asset).toBeUndefined();
    });

    test("rejects cancel for non-existent asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.uploads.cancelUpload({ assetId: "non-existent" })).rejects.toThrow(
        "asset not found",
      );
    });
  });

  describe("list", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.uploads.list({})).rejects.toThrow("Authentication required");
    });

    test("returns user's uploads", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, { name: "My Asset 1" });
      await seedTestAsset(game.id, category.id, user.id, { name: "My Asset 2" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({});

      expect(result.items).toHaveLength(2);
    });

    test("does not return other users uploads", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, otherUser.id, { name: "Other's Asset" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({});

      expect(result.items).toHaveLength(0);
    });

    test("filters by status", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, {
        name: "Pending",
        status: "pending",
      });
      await seedTestAsset(game.id, category.id, user.id, {
        name: "Approved",
        status: "approved",
      });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({ status: "pending" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Pending");
    });

    test("filters by game", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const gameA = await seedTestGame({ name: "GA", slug: "up-list-ga" });
      const gameB = await seedTestGame({ name: "GB", slug: "up-list-gb" });
      const category = await seedTestCategory();
      await seedTestAsset(gameA.id, category.id, user.id, { name: "in-a" });
      await seedTestAsset(gameB.id, category.id, user.id, { name: "in-b" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({ games: [gameA.id] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("in-a");
    });

    test("paginates with offset and reports hasMore", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      for (let i = 0; i < 3; i++) {
        await seedTestAsset(game.id, category.id, user.id, { name: `u-${i}` });
      }

      const caller = createTestCaller(context);
      const page1 = await caller.uploads.list({ limit: 2 });
      expect(page1.items).toHaveLength(2);
      expect(page1.hasMore).toBe(true);

      const page2 = await caller.uploads.list({ limit: 2, offset: 2 });
      expect(page2.items).toHaveLength(1);
      expect(page2.hasMore).toBe(false);
    });

    test("sorts by name case-insensitively", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      await seedTestAsset(game.id, category.id, user.id, { name: "Banana" });
      await seedTestAsset(game.id, category.id, user.id, { name: "apple" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({ sortBy: "name", sortOrder: "asc" });

      expect(result.items.map((i) => i.name)).toEqual(["apple", "Banana"]);
    });
  });

  describe("getStats", () => {
    test("returns upload statistics", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, { status: "pending" });
      await seedTestAsset(game.id, category.id, user.id, { status: "pending" });
      await seedTestAsset(game.id, category.id, user.id, { status: "approved" });
      await seedTestAsset(game.id, category.id, user.id, { status: "denied" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.getStats();

      expect(result.pending).toBe(2);
      expect(result.approved).toBe(1);
      expect(result.denied).toBe(1);
      expect(result.total).toBe(4);
    });
  });

  describe("delete", () => {
    test("deletes pending asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, {
        status: "pending",
      });

      const caller = createTestCaller(context);
      const result = await caller.uploads.delete({ assetId: asset.id });

      expect(result.success).toBe(true);

      const deletedAsset = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, asset.id),
      });
      expect(deletedAsset).toBeUndefined();
    });

    test("cannot delete approved asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, {
        status: "approved",
      });

      const caller = createTestCaller(context);

      await expect(caller.uploads.delete({ assetId: asset.id })).rejects.toThrow(
        "cannot delete reviewed assets",
      );
    });

    test("cannot delete other user's asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, otherUser.id, {
        status: "pending",
      });

      const caller = createTestCaller(context);

      await expect(caller.uploads.delete({ assetId: asset.id })).rejects.toThrow("asset not found");
    });
  });

  describe("getUploadConstraints", () => {
    test("returns upload constraints", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.uploads.getUploadConstraints();

      expect(result.maxFileSize).toBe(50 * 1024 * 1024);
      expect(result.allowedExtensions).toContain("png");
      expect(result.allowedExtensions).toContain("jpg");
      expect(result.allowedMimeTypes).toContain("image/png");
      expect(result.allowedMimeTypes).toContain("image/jpeg");
    });
  });
});

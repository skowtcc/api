import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller, mockS3 } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestAsset,
  createTestContext,
  createAuthenticatedContext,
  testDb,
} from "./helpers";
import * as schema from "@skowt-monorepo/db/schema";
import { eq } from "drizzle-orm";

describe("Moderation Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    mockS3.fileExists = async () => true;
    mockS3.moveFile = async () => true;
    mockS3.deleteFile = async () => {};
  });

  describe("getPending", () => {
    test("requires developer role", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      await expect(caller.moderation.getPending({})).rejects.toThrow();
    });

    test("returns pending assets for staff", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      await seedTestAsset(game.id, category.id, user.id, {
        status: "pending",
        name: "pending-asset",
      });
      await seedTestAsset(game.id, category.id, user.id, {
        status: "approved",
        name: "approved-asset",
      });

      const caller = createTestCaller(context);
      const result = await caller.moderation.getPending({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("pending-asset");
    });

    test("returns empty when no pending assets", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.moderation.getPending({});

      expect(result.items).toHaveLength(0);
    });
  });

  describe("setStatus", () => {
    test("requires developer role", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      await expect(
        caller.moderation.setStatus({ assetId: "any-id", status: "approved" }),
      ).rejects.toThrow();
    });

    test("approves pending asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, { status: "pending" });

      const caller = createTestCaller(context);
      const result = await caller.moderation.setStatus({ assetId: asset.id, status: "approved" });

      expect(result.success).toBe(true);

      const updated = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, asset.id),
      });
      expect(updated?.status).toBe("approved");
    });

    test("approve is idempotent when a prior attempt already moved the file", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, { status: "pending" });

      /* simulate a retry: an earlier attempt moved limbo -> asset (source gone,
         so moveFile now returns false) but failed before the status write, so
         the destination is present */
      mockS3.moveFile = async () => false;
      mockS3.fileExists = async () => true;

      const caller = createTestCaller(context);
      const result = await caller.moderation.setStatus({ assetId: asset.id, status: "approved" });

      expect(result.success).toBe(true);
      const updated = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, asset.id),
      });
      expect(updated?.status).toBe("approved");
    });

    test("approve fails when the move fails and no destination exists", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, { status: "pending" });

      mockS3.moveFile = async () => false;
      mockS3.fileExists = async () => false; // no source and no destination

      const caller = createTestCaller(context);
      await expect(
        caller.moderation.setStatus({ assetId: asset.id, status: "approved" }),
      ).rejects.toThrow("Failed to move file");

      const updated = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, asset.id),
      });
      expect(updated?.status).toBe("pending");
    });

    test("denies pending asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, { status: "pending" });

      const caller = createTestCaller(context);
      const result = await caller.moderation.setStatus({ assetId: asset.id, status: "denied" });

      expect(result.success).toBe(true);

      const updated = await testDb.query.asset.findFirst({
        where: eq(schema.asset.id, asset.id),
      });
      expect(updated?.status).toBe("denied");
    });

    test("rejects non-pending asset", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, { status: "approved" });

      const caller = createTestCaller(context);
      await expect(
        caller.moderation.setStatus({ assetId: asset.id, status: "denied" }),
      ).rejects.toThrow("pending asset not found");
    });

    test("developer can moderate", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const contributor = await seedTestUser({ name: "Contributor", role: "contributor" });
      const asset = await seedTestAsset(game.id, category.id, contributor.id, {
        status: "pending",
      });

      const caller = createTestCaller(context);
      const result = await caller.moderation.setStatus({ assetId: asset.id, status: "approved" });

      expect(result.success).toBe(true);
    });
  });

  describe("approveAll", () => {
    test("requires developer role", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      await expect(caller.moderation.approveAll()).rejects.toThrow();
    });

    test("approves every committed pending asset, leaving already-approved ones", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const a = await seedTestAsset(game.id, category.id, user.id, {
        status: "pending",
        name: "p1",
      });
      const b = await seedTestAsset(game.id, category.id, user.id, {
        status: "pending",
        name: "p2",
      });
      await seedTestAsset(game.id, category.id, user.id, { status: "approved", name: "already" });

      const caller = createTestCaller(context);
      const result = await caller.moderation.approveAll();

      expect(result.approved).toBe(2);
      const rowA = await testDb.query.asset.findFirst({ where: eq(schema.asset.id, a.id) });
      const rowB = await testDb.query.asset.findFirst({ where: eq(schema.asset.id, b.id) });
      expect(rowA?.status).toBe("approved");
      expect(rowB?.status).toBe("approved");
    });

    test("returns 0 when nothing is pending", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.moderation.approveAll();
      expect(result.approved).toBe(0);
    });
  });

  describe("pending asset visibility", () => {
    test("pending assets are invisible in public queries", async () => {
      const creator = await seedTestUser({ role: "contributor" });
      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, creator.id, { status: "pending", name: "hidden" });
      await seedTestAsset(game.id, category.id, creator.id, {
        status: "approved",
        name: "visible",
      });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ sortBy: "date", sortOrder: "desc", limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("visible");
    });

    test("pending assets are invisible in getById", async () => {
      const creator = await seedTestUser({ role: "contributor" });
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, creator.id, { status: "pending" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.getById({ id: asset.id });

      expect(result).toBeNull();
    });

    test("denied assets are invisible in public queries", async () => {
      const creator = await seedTestUser({ role: "contributor" });
      const game = await seedTestGame();
      const category = await seedTestCategory();
      await seedTestAsset(game.id, category.id, creator.id, { status: "denied" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ sortBy: "date", sortOrder: "desc", limit: 50 });

      expect(result.items).toHaveLength(0);
    });

    test("pending assets show in uploader's own list", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      await seedTestAsset(game.id, category.id, user.id, { status: "pending", name: "my-pending" });

      const caller = createTestCaller(context);
      const result = await caller.uploads.list({ status: "pending", limit: 20 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("my-pending");
    });
  });
});

describe("Upload skipApproval", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    mockS3.fileExists = async () => true;
  });

  test("contributor upload lands in limbo even with skipApproval=true", async () => {
    /* uploads are contributor+ again; skipApproval is only honoured for
       developers (shouldSkipQueue), so a contributor sending it still queues */
    const { context, user } = createAuthenticatedContext("contributor");
    await seedTestUser(user);

    const game = await seedTestGame();
    const category = await seedTestCategory();

    const caller = createTestCaller(context);
    const result = await caller.uploads.requestUpload({
      name: "Lorem ipsum",
      gameId: game.id,
      categoryId: category.id,
      mimeType: "image/png",
      fileSize: 1024,
      skipApproval: true,
    });

    expect(result.s3Key).toContain("limbo/");
  });

  test("developer upload skips limbo by default", async () => {
    const { context, user } = createAuthenticatedContext("developer");
    await seedTestUser(user);

    const game = await seedTestGame();
    const category = await seedTestCategory();

    const caller = createTestCaller(context);
    const result = await caller.uploads.requestUpload({
      name: "Lorem ipsum",
      gameId: game.id,
      categoryId: category.id,
      mimeType: "image/png",
      fileSize: 1024,
      skipApproval: true,
    });

    // developer with skipApproval=true goes to asset/
    expect(result.s3Key).toContain("asset/");
  });

  test("developer can opt into limbo with skipApproval=false", async () => {
    const { context, user } = createAuthenticatedContext("developer");
    await seedTestUser(user);

    const game = await seedTestGame();
    const category = await seedTestCategory();

    const caller = createTestCaller(context);
    const result = await caller.uploads.requestUpload({
      name: "Lorem ipsum",
      gameId: game.id,
      categoryId: category.id,
      mimeType: "image/png",
      fileSize: 1024,
      skipApproval: false,
    });

    // developer with skipApproval=false goes to limbo
    expect(result.s3Key).toContain("limbo/");
  });

  test("staff skipApproval=true still presigns to limbo/", async () => {
    /* queue bypass is developer-only; staff moderate the queue but their own
       uploads go through it like anyone else's */
    const { context, user } = createAuthenticatedContext("staff");
    await seedTestUser(user);

    const game = await seedTestGame();
    const category = await seedTestCategory();

    const caller = createTestCaller(context);
    const result = await caller.uploads.requestUpload({
      name: "Lorem ipsum",
      gameId: game.id,
      categoryId: category.id,
      mimeType: "image/png",
      fileSize: 1024,
      skipApproval: true,
    });

    expect(result.s3Key).toContain("limbo/");
  });
});

import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { v7 as uuidv7 } from "uuid";
import { createTestCaller, mockDiscord, resetTestServiceMocks } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestAsset,
  createTestContext,
  createAuthenticatedContext,
} from "./helpers";

interface BatchAssetInput {
  id: string;
  name: string;
  extension: string;
  gameName: string;
  categoryName: string;
}

async function seedDownloadableAsset(userId: string, label: string): Promise<BatchAssetInput> {
  const game = await seedTestGame({
    name: `Game ${label}`,
    slug: `game-${label}-${uuidv7().slice(-8)}`,
  });
  const category = await seedTestCategory({
    name: `Category ${label}`,
    slug: `category-${label}-${uuidv7().slice(-8)}`,
  });
  const asset = await seedTestAsset(game.id, category.id, userId, {
    name: `Asset ${label}`,
    status: "approved",
    extension: "png",
  });

  return {
    id: asset.id,
    name: asset.name,
    extension: asset.extension,
    gameName: game.name,
    categoryName: category.name,
  };
}

describe("Downloads Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    resetTestServiceMocks();
  });

  describe("record", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(
        caller.downloads.record({
          assets: [
            {
              id: uuidv7(),
              name: "Asset",
              extension: "png",
              gameName: "Game",
              categoryName: "Category",
            },
          ],
        }),
      ).rejects.toThrow("Authentication required");
    });

    test("records batch for authenticated user", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const assetPayload = await seedDownloadableAsset(user.id, "one");

      const caller = createTestCaller(context);
      const result = await caller.downloads.record({ assets: [assetPayload] });

      expect(result.batchId).toBeTruthy();
      expect(typeof result.batchId).toBe("string");
    });

    test("increments download_count for every asset in the batch", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const assetA = await seedDownloadableAsset(user.id, "count-a");
      const assetB = await seedDownloadableAsset(user.id, "count-b");

      const caller = createTestCaller(context);
      await caller.downloads.record({ assets: [assetA, assetB] });
      await caller.downloads.record({ assets: [assetA] });

      const { db, asset, inArray } = await import("@skowt-monorepo/db");
      const rows = await db.query.asset.findMany({
        where: inArray(asset.id, [assetA.id, assetB.id]),
        columns: { id: true, downloadCount: true },
      });
      const counts = new Map(rows.map((r) => [r.id, r.downloadCount]));
      expect(counts.get(assetA.id)).toBe(2);
      expect(counts.get(assetB.id)).toBe(1);
    });

    test("rejects empty assets array", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.downloads.record({ assets: [] })).rejects.toThrow();
    });

    test("rejects when no approved assets are valid", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(
        caller.downloads.record({
          assets: [
            {
              id: uuidv7(),
              name: "Missing",
              extension: "png",
              gameName: "Game",
              categoryName: "Category",
            },
          ],
        }),
      ).rejects.toThrow("no valid assets to download");
    });

    test("validates asset schema", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const invalidAssets = [{ id: "", name: "", extension: "", gameName: "", categoryName: "" }];

      await expect(caller.downloads.record({ assets: invalidAssets as any })).rejects.toThrow();
    });
  });

  describe("history", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.downloads.history({})).rejects.toThrow("Authentication required");
    });

    test("returns empty when no downloads", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.downloads.history({});

      expect(result.batches).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.total).toBe(0);
    });

    test("returns batch summaries", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const assetA = await seedDownloadableAsset(user.id, "a");
      const assetB = await seedDownloadableAsset(user.id, "b");
      const assetC = await seedDownloadableAsset(user.id, "c");

      const caller = createTestCaller(context);
      await caller.downloads.record({ assets: [assetA, assetB, assetC] });

      const result = await caller.downloads.history({});

      expect(result.batches).toHaveLength(1);
      expect(result.batches[0].assetCount).toBe(3);
      expect(result.batches[0].gameNames).toContain(assetA.gameName);
      expect(result.batches[0].gameNames).toContain(assetB.gameName);
      expect(result.batches[0].gameNames).toContain(assetC.gameName);
      expect(result.total).toBe(1);
    });

    test("supports pagination", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      const asset1 = await seedDownloadableAsset(user.id, "1");
      const asset2 = await seedDownloadableAsset(user.id, "2");
      const asset3 = await seedDownloadableAsset(user.id, "3");

      await caller.downloads.record({ assets: [asset1] });
      await caller.downloads.record({ assets: [asset2] });
      await caller.downloads.record({ assets: [asset3] });

      const result = await caller.downloads.history({ limit: 2 });

      expect(result.batches).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.total).toBe(3);
    });
  });

  describe("getBatch", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.downloads.getBatch({ batchId: uuidv7() })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("returns batch assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const payloadA = await seedDownloadableAsset(user.id, "a");
      const payloadB = await seedDownloadableAsset(user.id, "b");

      const caller = createTestCaller(context);
      const { batchId } = await caller.downloads.record({ assets: [payloadA, payloadB] });

      const result = await caller.downloads.getBatch({ batchId: batchId! });

      expect(result.assets).toHaveLength(2);
      expect(result.assets[0]?.id).toBe(payloadA.id);
    });

    test("returns NOT_FOUND for non-existent batch", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.downloads.getBatch({ batchId: uuidv7() })).rejects.toThrow(
        "batch not found",
      );
    });

    test("validates batchId is UUID", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.downloads.getBatch({ batchId: "not-a-uuid" })).rejects.toThrow();
    });
  });

  describe("deleteBatch", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.downloads.deleteBatch({ batchId: uuidv7() })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("deletes batch", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const payload = await seedDownloadableAsset(user.id, "one");

      const caller = createTestCaller(context);
      const { batchId } = await caller.downloads.record({ assets: [payload] });

      const result = await caller.downloads.deleteBatch({ batchId: batchId! });
      expect(result.success).toBe(true);

      const history = await caller.downloads.history({});
      expect(history.batches).toHaveLength(0);
    });

    test("returns false for non-existent batch", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.downloads.deleteBatch({ batchId: uuidv7() });

      expect(result.success).toBe(false);
    });
  });

  describe("clear", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.downloads.clear()).rejects.toThrow("Authentication required");
    });

    test("clears all batches", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const payloadA = await seedDownloadableAsset(user.id, "one");
      const payloadB = await seedDownloadableAsset(user.id, "two");

      const caller = createTestCaller(context);

      await caller.downloads.record({ assets: [payloadA] });
      await caller.downloads.record({ assets: [payloadB] });

      let history = await caller.downloads.history({});
      expect(history.total).toBe(2);

      await caller.downloads.clear();

      history = await caller.downloads.history({});
      expect(history.total).toBe(0);
    });
  });

  describe("serverStatus", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.downloads.serverStatus()).rejects.toThrow("Authentication required");
    });

    test("returns server membership status", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      mockDiscord.inServer = false;

      const caller = createTestCaller(context);
      const result = await caller.downloads.serverStatus();

      expect(result.inServer).toBe(false);
      mockDiscord.inServer = true;
    });
  });
});

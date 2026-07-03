import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller, resetTestServiceMocks } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestAsset,
  seedTestSavedAsset,
  createTestContext,
  createAuthenticatedContext,
} from "./helpers";

describe("Bookmark Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
    resetTestServiceMocks();
  });

  describe("toggle", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.bookmark.toggle({ assetId: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("saves an asset when not already saved", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.toggle({ assetId: asset.id });

      expect(result.saved).toBe(true);
    });

    test("unsaves an asset when already saved", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id);

      await seedTestSavedAsset(user.id, asset.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.toggle({ assetId: asset.id });

      expect(result.saved).toBe(false);
    });

    test("toggle twice returns to unsaved state", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id);

      const caller = createTestCaller(context);

      const result1 = await caller.bookmark.toggle({ assetId: asset.id });
      expect(result1.saved).toBe(true);

      const result2 = await caller.bookmark.toggle({ assetId: asset.id });
      expect(result2.saved).toBe(false);
    });
  });

  describe("exists", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.bookmark.exists({ assetId: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("returns false when asset is not saved", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.exists({ assetId: asset.id });

      expect(result.saved).toBe(false);
    });

    test("returns true when asset is saved", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id);

      await seedTestSavedAsset(user.id, asset.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.exists({ assetId: asset.id });

      expect(result.saved).toBe(true);
    });
  });

  describe("list", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.bookmark.list({})).rejects.toThrow("Authentication required");
    });

    test("returns empty array when no saved assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({});

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
    });

    test("returns user's saved assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, {
        name: "Saved Asset",
      });

      await seedTestSavedAsset(user.id, asset.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].asset.name).toBe("Saved Asset");
    });

    test("does not return other users saved assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other User" });

      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, otherUser.id);

      await seedTestSavedAsset(otherUser.id, asset.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({});

      expect(result.items).toEqual([]);
    });

    test("excludes non-approved assets from list", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const approvedAsset = await seedTestAsset(game.id, category.id, user.id, {
        name: "Approved",
        status: "approved",
      });
      const pendingAsset = await seedTestAsset(game.id, category.id, user.id, {
        name: "Pending",
        status: "pending",
      });

      await seedTestSavedAsset(user.id, approvedAsset.id);
      await seedTestSavedAsset(user.id, pendingAsset.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].asset.name).toBe("Approved");
    });

    test("supports pagination", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      for (let i = 0; i < 5; i++) {
        const asset = await seedTestAsset(game.id, category.id, user.id, {
          name: `Asset ${i}`,
        });
        await seedTestSavedAsset(user.id, asset.id);
      }

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(true);
    });

    test("filters saved assets by name via FTS trigram substring", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      const match = await seedTestAsset(game.id, category.id, user.id, {
        name: "Saved_Luckdraw_UI",
      });
      const other = await seedTestAsset(game.id, category.id, user.id, {
        name: "Saved_Background",
      });
      await seedTestSavedAsset(user.id, match.id);
      await seedTestSavedAsset(user.id, other.id);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.list({ name: "draw" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].asset.name).toBe("Saved_Luckdraw_UI");
    });
  });

  describe("count", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.bookmark.count()).rejects.toThrow("Authentication required");
    });

    test("returns 0 when no saved assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.bookmark.count();

      expect(result.count).toBe(0);
    });

    test("returns correct count of saved assets", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const game = await seedTestGame();
      const category = await seedTestCategory();

      for (let i = 0; i < 3; i++) {
        const asset = await seedTestAsset(game.id, category.id, user.id);
        await seedTestSavedAsset(user.id, asset.id);
      }

      const caller = createTestCaller(context);
      const result = await caller.bookmark.count();

      expect(result.count).toBe(3);
    });
  });
});

import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestTag,
  seedTestAsset,
  linkAssetTag,
  createTestContext,
} from "./helpers";

describe("Asset Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe("query", () => {
    test("returns empty array when no assets exist", async () => {
      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({});

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test("returns only approved assets", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, {
        name: "Approved Asset",
        status: "approved",
      });
      await seedTestAsset(game.id, category.id, user.id, {
        name: "Pending Asset",
        status: "pending",
      });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Approved Asset");
    });

    test("filters by game id", async () => {
      const user = await seedTestUser();
      const game1 = await seedTestGame({ slug: "game-one", name: "Game One" });
      const game2 = await seedTestGame({ slug: "game-two", name: "Game Two" });
      const category = await seedTestCategory();

      await seedTestAsset(game1.id, category.id, user.id, { name: "Asset 1" });
      await seedTestAsset(game2.id, category.id, user.id, { name: "Asset 2" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ games: [game1.id] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Asset 1");
      expect(result.items[0].game.slug).toBe("game-one");
    });

    test("filters by category id", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const cat1 = await seedTestCategory({ slug: "cat-one", name: "Category One" });
      const cat2 = await seedTestCategory({ slug: "cat-two", name: "Category Two" });

      await seedTestAsset(game.id, cat1.id, user.id, { name: "Asset 1" });
      await seedTestAsset(game.id, cat2.id, user.id, { name: "Asset 2" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ categories: [cat1.id] });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Asset 1");
      expect(result.items[0].category.slug).toBe("cat-one");
    });

    test("filters by name term", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, { name: "Character Sheet" });
      await seedTestAsset(game.id, category.id, user.id, { name: "Background Art" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ name: "character" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe("Character Sheet");
    });

    test("supports pagination with limit", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();

      for (let i = 0; i < 5; i++) {
        await seedTestAsset(game.id, category.id, user.id, {
          name: `Asset ${i}`,
          createdAt: new Date(Date.now() - i * 1000), // different timestamps
        });
      }

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).not.toBeNull();
    });

    test("includes tags in response", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const tag = await seedTestTag({ slug: "official", name: "Official" });

      const asset = await seedTestAsset(game.id, category.id, user.id, { name: "Tagged Asset" });
      await linkAssetTag(asset.id, tag.id);

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.query({});

      expect(result.items).toHaveLength(1);
      expect(result.items[0].tags).toHaveLength(1);
      expect(result.items[0].tags[0].slug).toBe("official");
    });
  });

  describe("getById", () => {
    test("returns asset by id", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, {
        name: "Test Asset",
      });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.getById({ id: asset.id });

      expect(result.id).toBe(asset.id);
      expect(result.name).toBe("Test Asset");
      expect(result.uploader.id).toBe(user.id);
    });

    test("returns null for non-existent asset", async () => {
      const caller = createTestCaller(createTestContext());

      const result = await caller.asset.getById({ id: "non-existent-id" });
      expect(result).toBeNull();
    });

    test("returns null for pending asset", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const asset = await seedTestAsset(game.id, category.id, user.id, {
        name: "Pending Asset",
        status: "pending",
      });

      const caller = createTestCaller(createTestContext());

      const result = await caller.asset.getById({ id: asset.id });
      expect(result).toBeNull();
    });
  });

  describe("getRecent", () => {
    test("returns assets in descending order by createdAt", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();

      await seedTestAsset(game.id, category.id, user.id, {
        name: "Older Asset",
        createdAt: new Date(Date.now() - 10000),
      });
      await seedTestAsset(game.id, category.id, user.id, {
        name: "Newer Asset",
        createdAt: new Date(),
      });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.getRecent({});

      expect(result.items).toHaveLength(2);
      expect(result.items[0].name).toBe("Newer Asset");
      expect(result.items[1].name).toBe("Older Asset");
    });
  });

  describe("getRelated", () => {
    test("empty (with null cursor) for a non-existent source asset", async () => {
      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.getRelated({ assetId: "does-not-exist" });

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test("orders by relevance tier and excludes the source + unrelated + non-approved", async () => {
      const user = await seedTestUser();
      const gameA = await seedTestGame({ slug: "game-a", name: "Game A" });
      const gameB = await seedTestGame({ slug: "game-b", name: "Game B" });
      const catX = await seedTestCategory({ slug: "cat-x", name: "Cat X" });
      const catY = await seedTestCategory({ slug: "cat-y", name: "Cat Y" });

      const source = await seedTestAsset(gameA.id, catX.id, user.id, { name: "SOURCE" });
      const tier0 = await seedTestAsset(gameA.id, catX.id, user.id, {
        name: "tier0-same-game-cat",
      });
      const tier1 = await seedTestAsset(gameA.id, catY.id, user.id, { name: "tier1-same-game" });
      const tier2 = await seedTestAsset(gameB.id, catX.id, user.id, { name: "tier2-same-cat" });
      // unrelated (other game + other category) - must not appear
      await seedTestAsset(gameB.id, catY.id, user.id, { name: "unrelated" });
      // same game+cat but pending - must not appear
      await seedTestAsset(gameA.id, catX.id, user.id, { name: "pending", status: "pending" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.asset.getRelated({ assetId: source.id });

      expect(result.items.map((a) => a.name)).toEqual([
        "tier0-same-game-cat",
        "tier1-same-game",
        "tier2-same-cat",
      ]);
      expect(result.items.map((a) => a.id)).not.toContain(source.id);
      expect(result.nextCursor).toBeNull();
      void tier0;
      void tier1;
      void tier2;
    });

    test("keyset-paginates a single tier with no dupes or gaps", async () => {
      const user = await seedTestUser();
      const game = await seedTestGame();
      const category = await seedTestCategory();
      const source = await seedTestAsset(game.id, category.id, user.id, { name: "SOURCE" });

      // 5 related in the same game+category (tier 0), distinct createdAt (R0 newest)
      for (let i = 0; i < 5; i++) {
        await seedTestAsset(game.id, category.id, user.id, {
          name: `R${i}`,
          createdAt: new Date(Date.now() - i * 1000),
        });
      }

      const caller = createTestCaller(createTestContext());
      const seen: string[] = [];
      let cursor: string | undefined = undefined;
      let pages = 0;
      do {
        const page = await caller.asset.getRelated({ assetId: source.id, limit: 2, cursor });
        seen.push(...page.items.map((a) => a.name));
        cursor = page.nextCursor ?? undefined;
        pages++;
      } while (cursor && pages < 10);

      expect(seen).toEqual(["R0", "R1", "R2", "R3", "R4"]); // createdAt desc, no dupes
      expect(new Set(seen).size).toBe(5);
      expect(pages).toBe(3); // 2 + 2 + 1
    });

    test("cursor continues across a tier boundary, relevance beats recency", async () => {
      const user = await seedTestUser();
      const gameA = await seedTestGame({ slug: "g-a", name: "G A" });
      const catX = await seedTestCategory({ slug: "c-x", name: "C X" });
      const catY = await seedTestCategory({ slug: "c-y", name: "C Y" });

      const source = await seedTestAsset(gameA.id, catX.id, user.id, { name: "SOURCE" });
      // tier 0 (same game+cat) - deliberately older than tier 1
      await seedTestAsset(gameA.id, catX.id, user.id, {
        name: "t0a",
        createdAt: new Date(Date.now() - 10000),
      });
      await seedTestAsset(gameA.id, catX.id, user.id, {
        name: "t0b",
        createdAt: new Date(Date.now() - 11000),
      });
      // tier 1 (same game, other cat) - newer, but must still come after tier 0
      await seedTestAsset(gameA.id, catY.id, user.id, { name: "t1a", createdAt: new Date() });
      await seedTestAsset(gameA.id, catY.id, user.id, {
        name: "t1b",
        createdAt: new Date(Date.now() - 1000),
      });

      const caller = createTestCaller(createTestContext());
      const page1 = await caller.asset.getRelated({ assetId: source.id, limit: 2 });
      expect(page1.items.map((a) => a.name)).toEqual(["t0a", "t0b"]);
      expect(page1.nextCursor).not.toBeNull();

      const page2 = await caller.asset.getRelated({
        assetId: source.id,
        limit: 2,
        cursor: page1.nextCursor!,
      });
      expect(page2.items.map((a) => a.name)).toEqual(["t1a", "t1b"]);
      expect(page2.nextCursor).toBeNull();
    });
  });
});

describe("Asset getRecentDrops", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  test("returns one entry per game with burst count and capped samples", async () => {
    const creator = await seedTestUser({ role: "contributor" });
    const gameA = await seedTestGame({ name: "Game A", slug: "drops-game-a" });
    const gameB = await seedTestGame({ name: "Game B", slug: "drops-game-b" });
    const category = await seedTestCategory();

    for (let i = 0; i < 4; i++) {
      await seedTestAsset(gameA.id, category.id, creator.id, {
        status: "approved",
        name: `a-${i}`,
      });
    }
    await seedTestAsset(gameB.id, category.id, creator.id, { status: "approved", name: "b-0" });
    // a pending asset in gameB must not count or appear in samples
    await seedTestAsset(gameB.id, category.id, creator.id, {
      status: "pending",
      name: "b-pending",
    });

    const caller = createTestCaller(createTestContext());
    const { drops } = await caller.asset.getRecentDrops();

    const byGame = new Map(drops.map((d) => [d.game.slug, d]));
    expect(byGame.has("drops-game-a")).toBe(true);
    expect(byGame.has("drops-game-b")).toBe(true);

    // burst counts only approved assets; samples cap at 3
    expect(byGame.get("drops-game-a")!.count).toBe(4);
    expect(byGame.get("drops-game-a")!.samples.length).toBe(3);
    expect(byGame.get("drops-game-b")!.count).toBe(1);
    expect(byGame.get("drops-game-b")!.samples.length).toBe(1);
  });

  test("excludes games with no approved assets", async () => {
    const creator = await seedTestUser({ role: "contributor" });
    const game = await seedTestGame({ name: "Pending Only", slug: "drops-pending-only" });
    const category = await seedTestCategory();
    await seedTestAsset(game.id, category.id, creator.id, { status: "pending" });

    const caller = createTestCaller(createTestContext());
    const { drops } = await caller.asset.getRecentDrops();

    expect(drops.find((d) => d.game.slug === "drops-pending-only")).toBeUndefined();
  });
});

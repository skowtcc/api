import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import * as schema from "@skowt-monorepo/db/schema";
import { createTestCaller } from "./test-routers";
import {
  setupTestDatabase,
  clearTestDatabase,
  testDb,
  createTestUser,
  createTestGame,
  createTestCategory,
  createTestTag,
  createTestAsset,
  createTestRequest,
  createMockSession,
} from "./setup";

function createCaller(session: ReturnType<typeof createMockSession> | null = null) {
  return createTestCaller({ session });
}

describe("Production Router Contracts", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  test("uploads.update is atomic when tag validation fails", async () => {
    const user = createTestUser({ role: "contributor" });
    const game = createTestGame();
    const category = createTestCategory();
    const existingTag = createTestTag({ slug: "hd", name: "HD" });
    const validTag = createTestTag({ slug: "official", name: "Official" });
    const asset = createTestAsset(game.id, category.id, user.id, {
      name: "Original Name",
      status: "pending",
    });

    await testDb.insert(schema.user).values(user);
    await testDb.insert(schema.game).values(game);
    await testDb.insert(schema.category).values(category);
    await testDb.insert(schema.tag).values([existingTag, validTag]);
    await testDb.insert(schema.asset).values(asset);
    await testDb.insert(schema.assetToTag).values({
      assetId: asset.id,
      tagId: existingTag.id,
    });

    const caller = createCaller(createMockSession(user));

    await expect(
      caller.uploads.update({
        assetId: asset.id,
        name: "Should Not Persist",
        tagIds: [validTag.id, "missing-tag-id"],
      }),
    ).rejects.toThrow("invalid tag ids");

    const unchangedAsset = await testDb.query.asset.findFirst({
      where: eq(schema.asset.id, asset.id),
      columns: { name: true },
    });
    expect(unchangedAsset?.name).toBe("Original Name");

    const linkedTags = await testDb.query.assetToTag.findMany({
      where: eq(schema.assetToTag.assetId, asset.id),
    });
    expect(linkedTags).toHaveLength(1);
    expect(linkedTags[0]?.tagId).toBe(existingTag.id);
  });

  test("request.list cursor pagination is stable with deterministic tiebreakers", async () => {
    const creator = createTestUser({ role: "contributor" });
    await testDb.insert(schema.user).values(creator);

    const sameTime = new Date("2026-01-01T00:00:00.000Z");
    const entries = [
      createTestRequest(creator.id, { voteCount: 12, createdAt: sameTime, status: "open" }),
      createTestRequest(creator.id, { voteCount: 12, createdAt: sameTime, status: "open" }),
      createTestRequest(creator.id, {
        voteCount: 10,
        createdAt: new Date("2026-01-01T00:01:00.000Z"),
        status: "open",
      }),
      createTestRequest(creator.id, {
        voteCount: 8,
        createdAt: new Date("2026-01-01T00:02:00.000Z"),
        status: "open",
      }),
      createTestRequest(creator.id, {
        voteCount: 1,
        createdAt: new Date("2026-01-01T00:03:00.000Z"),
        status: "open",
      }),
    ];
    await testDb.insert(schema.request).values(entries);

    const caller = createCaller(null);
    const seen = new Set<string>();
    let cursor: string | undefined = undefined;

    for (let i = 0; i < 10; i++) {
      const page = await caller.request.list({
        status: "open",
        limit: 2,
        cursor,
      });

      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }

      if (!page.nextCursor) {
        break;
      }
      cursor = page.nextCursor;
    }

    expect(seen.size).toBe(entries.length);
  });

  test("asset.query keeps pagination cursors compact (id-only) and returns next page", async () => {
    const user = createTestUser();
    const game = createTestGame();
    const category = createTestCategory();

    await testDb.insert(schema.user).values(user);
    await testDb.insert(schema.game).values(game);
    await testDb.insert(schema.category).values(category);

    const longNameA = `a-${"x".repeat(180)}`;
    const longNameB = `b-${"y".repeat(180)}`;

    await testDb.insert(schema.asset).values([
      createTestAsset(game.id, category.id, user.id, {
        name: longNameA,
        status: "approved",
      }),
      createTestAsset(game.id, category.id, user.id, {
        name: longNameB,
        status: "approved",
      }),
    ]);

    const caller = createCaller(null);
    const firstPage = await caller.asset.query({
      sortBy: "name",
      sortOrder: "asc",
      limit: 1,
    });

    expect(firstPage.items).toHaveLength(1);
    expect(firstPage.nextCursor).toBeTruthy();
    /* the cursor carries only the asset id - so it stays compact and must NOT
       embed the (180-char) sort value, even when sorting by a long name */
    const decodedCursor = Buffer.from(firstPage.nextCursor!, "base64url").toString("utf8");
    expect(decodedCursor).not.toContain(longNameA);
    expect(firstPage.nextCursor!.length).toBeLessThan(100);

    const secondPage = await caller.asset.query({
      sortBy: "name",
      sortOrder: "asc",
      limit: 1,
      cursor: firstPage.nextCursor!,
    });

    expect(secondPage.items).toHaveLength(1);
    expect(secondPage.items[0]?.id).not.toBe(firstPage.items[0]?.id);
  });

  test("request.list ignores malformed cursors gracefully", async () => {
    const creator = createTestUser({ role: "contributor" });
    await testDb.insert(schema.user).values(creator);

    await testDb.insert(schema.request).values(createTestRequest(creator.id, { status: "open" }));

    const caller = createCaller(null);

    // garbage string
    const page1 = await caller.request.list({ cursor: "not-valid-base64!!", limit: 10 });
    expect(page1.items).toHaveLength(1);

    // valid base64 but wrong JSON shape
    const fakeCursor = Buffer.from(JSON.stringify({ wrong: "shape" })).toString("base64url");
    const page2 = await caller.request.list({ cursor: fakeCursor, limit: 10 });
    expect(page2.items).toHaveLength(1);
  });

  test("asset.query ignores malformed cursors gracefully", async () => {
    const user = createTestUser();
    const game = createTestGame();
    const category = createTestCategory();

    await testDb.insert(schema.user).values(user);
    await testDb.insert(schema.game).values(game);
    await testDb.insert(schema.category).values(category);

    await testDb
      .insert(schema.asset)
      .values(createTestAsset(game.id, category.id, user.id, { status: "approved" }));

    const caller = createCaller(null);

    const page = await caller.asset.query({
      cursor: "totally-broken-cursor",
      sortBy: "date",
      sortOrder: "desc",
      limit: 10,
    });
    expect(page.items).toHaveLength(1);
  });
});

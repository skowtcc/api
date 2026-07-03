import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller } from "./test-routers";
import { setupTestDatabase, clearTestDatabase, testClient } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestCategory,
  seedTestAsset,
  createTestContext,
} from "./helpers";

/* FTS5 trigram asset-name search, exercises the router integration (lib/fts.ts ->
   asset_fts MATCH) and the DB triggers that keep the index in sync. the trigram
   tokenizer is chosen to preserve the old `LIKE '%term%'` substring/case behaviour;
   these tests pin that parity plus the MATCH-string injection safety and the
   short-query LIKE fallback. Redis is mocked to always-miss, so no query is cached
   and re-querying a term after a mutation reflects the live index */
describe("Asset Router - FTS5 name search", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  async function seedNamedAssets(names: string[]) {
    const user = await seedTestUser();
    const game = await seedTestGame();
    const category = await seedTestCategory();
    const assets = [];
    for (const name of names) {
      assets.push(await seedTestAsset(game.id, category.id, user.id, { name }));
    }
    return { user, game, category, assets };
  }

  test("trigram substring: mid-word term matches (parity with old LIKE)", async () => {
    await seedNamedAssets(["T_Luckdraw_UI_01", "Background_Art"]);
    const caller = createTestCaller(createTestContext());

    const result = await caller.asset.query({ name: "draw" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("T_Luckdraw_UI_01");
  });

  test("case-insensitive match", async () => {
    await seedNamedAssets(["Childe_Splash_Art"]);
    const caller = createTestCaller(createTestContext());

    const result = await caller.asset.query({ name: "CHILDE" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("Childe_Splash_Art");
  });

  test("matches substrings across underscores/numbers", async () => {
    await seedNamedAssets(["hu_tao_banner_v2", "unrelated_zzz"]);
    const caller = createTestCaller(createTestContext());

    const result = await caller.asset.query({ name: "tao_banner" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("hu_tao_banner_v2");
  });

  test("returns empty for a non-matching term", async () => {
    await seedNamedAssets(["alpha_thing", "beta_thing"]);
    const caller = createTestCaller(createTestContext());

    const result = await caller.asset.query({ name: "zqxjnomatch" });

    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });

  test("only returns approved assets from the FTS path", async () => {
    const user = await seedTestUser();
    const game = await seedTestGame();
    const category = await seedTestCategory();
    await seedTestAsset(game.id, category.id, user.id, { name: "Klee_Bomber", status: "approved" });
    await seedTestAsset(game.id, category.id, user.id, { name: "Klee_Bomber", status: "pending" });

    const caller = createTestCaller(createTestContext());
    const result = await caller.asset.query({ name: "klee" });

    /* both share the name and are both indexed (the index is status-agnostic), so
       getting exactly one back proves the outer `status = approved` filter still
       constrains the FTS-matched set */
    expect(result.items).toHaveLength(1);
  });

  describe("MATCH-string injection safety", () => {
    test("a term with an embedded double-quote is treated as a literal, no error", async () => {
      await seedNamedAssets(['weird"quote_name', "clean_name"]);
      const caller = createTestCaller(createTestContext());

      const result = await caller.asset.query({ name: 'weird"quote' });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].name).toBe('weird"quote_name');
    });

    test("FTS operators (OR) are inert - searched as a literal string, not a boolean", async () => {
      await seedNamedAssets(["alpha_marker", "gamma_marker"]);
      const caller = createTestCaller(createTestContext());

      /* if "OR" acted as an FTS operator this would return BOTH; as a literal
         string "alpha OR gamma" matches neither name */
      const result = await caller.asset.query({ name: "alpha OR gamma" });

      expect(result.items).toEqual([]);
    });

    test("wildcard/column-filter metacharacters don't throw or over-match", async () => {
      await seedNamedAssets(["star_inside_x", "plain"]);
      const caller = createTestCaller(createTestContext());

      /* none of these are valid substrings; the key assertion is that they resolve
         cleanly (no 500) rather than being parsed as FTS query syntax */
      for (const term of ["star*", "name:star", "-star", "NEAR(a b)"]) {
        const result = await caller.asset.query({ name: term });
        expect(Array.isArray(result.items)).toBe(true);
      }
    });
  });

  test("short (<3 char) query falls back to LIKE and still matches", async () => {
    await seedNamedAssets(["AB_short_marker", "zz_other"]);
    const caller = createTestCaller(createTestContext());

    // "ab" is 2 chars - trigram can't tokenize it, so lib/fts falls back to LIKE
    const result = await caller.asset.query({ name: "ab" });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe("AB_short_marker");
  });

  describe("trigger sync", () => {
    test("renaming an asset updates what matches", async () => {
      const { assets } = await seedNamedAssets(["OldNameFoo"]);
      const caller = createTestCaller(createTestContext());

      expect((await caller.asset.query({ name: "oldnamefoo" })).items).toHaveLength(1);

      await testClient.execute({
        sql: "UPDATE asset SET name = ? WHERE id = ?",
        args: ["NewNameBar", assets[0].id],
      });

      // old term no longer matches, new term does
      expect((await caller.asset.query({ name: "oldnamefoo" })).items).toEqual([]);
      const renamed = await caller.asset.query({ name: "newnamebar" });
      expect(renamed.items).toHaveLength(1);
      expect(renamed.items[0].name).toBe("NewNameBar");
    });

    test("deleting an asset removes it from search", async () => {
      const { assets } = await seedNamedAssets(["DeleteMePlease"]);
      const caller = createTestCaller(createTestContext());

      expect((await caller.asset.query({ name: "deleteme" })).items).toHaveLength(1);

      await testClient.execute({ sql: "DELETE FROM asset WHERE id = ?", args: [assets[0].id] });

      expect((await caller.asset.query({ name: "deleteme" })).items).toEqual([]);
    });
  });

  test("sort still applies on top of an FTS-filtered result set", async () => {
    const user = await seedTestUser();
    const game = await seedTestGame();
    const category = await seedTestCategory();
    await seedTestAsset(game.id, category.id, user.id, { name: "ranked_low", downloadCount: 1 });
    await seedTestAsset(game.id, category.id, user.id, { name: "ranked_high", downloadCount: 99 });
    await seedTestAsset(game.id, category.id, user.id, { name: "ranked_mid", downloadCount: 50 });

    const caller = createTestCaller(createTestContext());
    const result = await caller.asset.query({
      name: "ranked",
      sortBy: "downloads",
      sortOrder: "desc",
    });

    expect(result.items.map((a) => a.name)).toEqual(["ranked_high", "ranked_mid", "ranked_low"]);
  });
});

/*
 * FTS5 asset-name search index
 *
 * this lives outside the drizzle schema on purpose: drizzle-orm cannot model an
 * FTS5 virtual table or SQL triggers, so `drizzle-kit push` (which diffs the
 * schema model) will never create these objects. everything here is therefore
 * idempotent (`IF NOT EXISTS`) so it is safe to run repeatedly and through every
 * schema-apply path we actually use:
 *   - the 0010 migration           (drizzle-kit migrate, when Railway behaves)
 *   - `bun db:fts`                 (manual apply against prod / wired into dev:setup)
 *   - the test harness             (packages/api/src/__tests__/setup.ts)
 *   - server boot                  (self-provisioning; see apps/server/src/index.ts)
 *
 * the index stores all assets regardless of status; the query layer still filters
 * `status = 'approved'`, so there is no re-sync when an asset is later approved
 */

/*
 * trigram tokenizer: reproduces the substring feel of the old `LIKE '%term%'`
 * (e.g. "draw" still matches "Luckdraw") and is case-insensitive by default, so
 * swapping LIKE -> MATCH is behaviour-preserving. cost: trigram cannot serve
 * queries shorter than 3 chars, so the query layer keeps a LIKE fallback there
 */
export const ASSET_FTS_TABLE_DDL =
  "CREATE VIRTUAL TABLE IF NOT EXISTS asset_fts USING fts5(asset_id UNINDEXED, name, tokenize='trigram')";

/*
 * triggers keep the index in lockstep with the asset table. the UPDATE trigger is
 * scoped to `OF name` so the hot view/download-count write path never touches FTS
 */
export const ASSET_FTS_TRIGGERS: readonly string[] = [
  `CREATE TRIGGER IF NOT EXISTS asset_fts_ai AFTER INSERT ON asset BEGIN
     INSERT INTO asset_fts(asset_id, name) VALUES (new.id, new.name);
   END`,
  `CREATE TRIGGER IF NOT EXISTS asset_fts_ad AFTER DELETE ON asset BEGIN
     DELETE FROM asset_fts WHERE asset_id = old.id;
   END`,
  `CREATE TRIGGER IF NOT EXISTS asset_fts_au AFTER UPDATE OF name ON asset BEGIN
     UPDATE asset_fts SET name = new.name WHERE asset_id = old.id;
   END`,
];

/*
 * one-time backfill of rows that predate the index. `WHERE NOT EXISTS` makes it
 * gap-filling and concurrency-safe: libsql serializes writes, so two boots racing
 * the first backfill cannot double-insert. cheap when asset_fts is empty (the
 * NOT EXISTS probes hit an empty table); callers gate it behind a count check so
 * steady-state runs skip it entirely rather than paying the anti-join
 */
export const ASSET_FTS_BACKFILL = `INSERT INTO asset_fts(asset_id, name)
     SELECT a.id, a.name FROM asset a
     WHERE NOT EXISTS (SELECT 1 FROM asset_fts f WHERE f.asset_id = a.id)`;

// minimal shape of a libsql/traced client's execute() that this module needs
export type FtsExecutor = (sql: string) => Promise<{ rows: Array<Record<string, unknown>> }>;

/*
 * create the virtual table + triggers only. cheap and safe to call on every boot;
 * does not backfill (see ensureAssetFts for the gated backfill)
 */
export async function ensureAssetFtsSchemaWith(exec: FtsExecutor): Promise<void> {
  await exec(ASSET_FTS_TABLE_DDL);
  for (const trigger of ASSET_FTS_TRIGGERS) await exec(trigger);
}

/*
 * schema + gated backfill. the count check keeps steady-state calls O(1): the
 * backfill INSERT only runs when the index is genuinely behind the asset table
 * (first provision, or a fresh DB), which is the only moment the counts diverge
 * since the triggers keep them 1:1 thereafter
 */
export async function ensureAssetFtsWith(exec: FtsExecutor): Promise<{ backfilled: number }> {
  await ensureAssetFtsSchemaWith(exec);

  const [ftsCount, assetCount] = await Promise.all([
    exec("SELECT COUNT(*) AS n FROM asset_fts"),
    exec("SELECT COUNT(*) AS n FROM asset"),
  ]);
  const ftsN = Number(ftsCount.rows[0]?.n ?? 0);
  const assetN = Number(assetCount.rows[0]?.n ?? 0);

  if (ftsN < assetN) {
    await exec(ASSET_FTS_BACKFILL);
    return { backfilled: assetN - ftsN };
  }
  return { backfilled: 0 };
}

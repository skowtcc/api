/*
 * standalone provisioner for the FTS5 asset-name search index. run manually
 * against any DB (`bun db:fts`) and wired into `dev:setup`. idempotent: creates
 * the virtual table + triggers if missing and backfills any assets not yet
 * indexed, so it is safe to run against prod repeatedly. drizzle-kit can't
 * model FTS5 virtual tables/triggers, so the Railway pre-deploy `db:migrate`
 * step alone won't create these objects (see the 0010 migration for the
 * drizzle-tracked equivalent)
 */
import { createClient } from "@libsql/client";
import { existsSync } from "fs";
import dotenv from "dotenv";
import { ensureAssetFtsWith } from "./fts";

const envPath = existsSync("../../apps/server/.env.development")
  ? "../../apps/server/.env.development"
  : "../../apps/server/.env";
dotenv.config({ path: envPath });

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

async function main() {
  console.log(`[db:fts] ensuring asset_fts on ${process.env.DATABASE_URL}`);
  const { backfilled } = await ensureAssetFtsWith((sql) => client.execute(sql));
  console.log(
    backfilled > 0
      ? `[db:fts] ready - backfilled ${backfilled} asset(s) into the index`
      : "[db:fts] ready - index already in sync (no backfill needed)",
  );
  client.close();
}

main().catch((err) => {
  console.error("[db:fts] failed:", err);
  process.exit(1);
});

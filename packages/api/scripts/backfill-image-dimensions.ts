/**
 * backfill `asset.metadata.image` (width/height) for assets uploaded before
 * dimension capture existed. reuses the exact same header reader + S3 client as
 * commitUpload, so new and old assets get dimensions the same way.
 *
 * safe to run against prod AFTER the schema + code are deployed: the column is
 * nullable and the frontend degrades gracefully, so there is no "backfill before
 * deploy" ordering trap. idempotent (only touches null-metadata rows) and
 * keyset-paginated, so it can be run in small increments and resumed
 *
 *   bun packages/api/scripts/backfill-image-dimensions.ts [--dry-run] [--limit N]
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";

/* load the dev env when present; prod/CI provide real env vars directly. must
   run before importing anything that reads env at module load (@skowt-monorepo/db) */
for (const p of ["apps/server/.env.development", "../../apps/server/.env.development"]) {
  if (existsSync(p)) {
    dotenv.config({ path: p });
    break;
  }
}

const [
  { db, asset, and, isNull, inArray, gt, asc, eq },
  { readFileBytes },
  { readImageDimensions },
] = await Promise.all([
  import("@skowt-monorepo/db"),
  import("../src/lib/s3"),
  import("../src/lib/image-dimensions"),
]);

const DRY_RUN = process.argv.includes("--dry-run");
const limitIdx = process.argv.indexOf("--limit");
const LIMIT = limitIdx >= 0 ? Number(process.argv[limitIdx + 1] ?? "0") : Infinity;
const BATCH = 50;
const HEADER_BYTES = 32 * 1024;
const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const THROTTLE_MS = 100;

let processed = 0;
let filled = 0;
let skipped = 0; // header unreadable / not confidently parseable - left null, retried on a later run
let lastId = "";

console.log(`backfill-image-dimensions starting (dryRun=${DRY_RUN}, limit=${LIMIT})`);

while (processed < LIMIT) {
  const rows = await db.query.asset.findMany({
    where: and(
      isNull(asset.metadata),
      inArray(asset.extension, IMAGE_EXTENSIONS),
      gt(asset.id, lastId),
    ),
    orderBy: [asc(asset.id)],
    columns: { id: true, hash: true, extension: true },
    limit: Math.min(BATCH, LIMIT - processed),
  });

  if (rows.length === 0) break;

  for (const row of rows) {
    lastId = row.id;
    processed++;

    /* R2 objects are keyed by asset ID, not content hash - verified against the
       live CDN (asset/{id}.png -> 200, asset/{hash}.png -> 404) */
    const key = `asset/${row.id}.${row.extension}`;
    const header = await readFileBytes(key, 0, HEADER_BYTES);
    const dims = header ? readImageDimensions(header) : null;

    if (!dims) {
      skipped++;
      continue;
    }

    if (!DRY_RUN) {
      await db
        .update(asset)
        .set({ metadata: { image: dims } })
        .where(eq(asset.id, row.id));
    }
    filled++;
  }

  console.log(`  … processed=${processed} filled=${filled} skipped=${skipped}`);
  await new Promise((r) => setTimeout(r, THROTTLE_MS));
}

console.log(
  `done: processed=${processed} filled=${filled} skipped=${skipped} dryRun=${DRY_RUN}` +
    (skipped > 0 ? ` (skipped rows stayed null and will be retried on the next run)` : ""),
);

process.exit(0);

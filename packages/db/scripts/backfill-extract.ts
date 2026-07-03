/**
 * Backfill the five extracted games (balatro, neon-white, crosscode, ror2,
 * silksong) into skowt: R2 first, then DB, so no row ever references a
 * missing file.
 *
 * Phases (run in order; each writes a marker the next requires):
 *   bun packages/db/scripts/backfill-extract.ts stage    - assign uuidv7 ids, friendly
 *     names, sha256; copy originals+thumbs into staging/asset/{id}.* and
 *     game art into staging/game/. Writes plan.json. Source tree untouched.
 *   bun packages/db/scripts/backfill-extract.ts upload   - rclone copy staging → R2,
 *     then rclone check; writes UPLOAD_OK only if verification passes.
 *   bun packages/db/scripts/backfill-extract.ts insert   - requires UPLOAD_OK. Upserts
 *     games/categories/links, batch-inserts assets, updates assetCount.
 *     Needs DATABASE_URL / DATABASE_AUTH_TOKEN env pointed at prod.
 *
 * plan.json is the id→row source of truth; re-running stage regenerates ids,
 * so never re-stage after upload without re-uploading
 */

import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { v7 as uuidv7 } from "uuid";

const ROOT = join(homedir(), "skowt-backfill");
const SRC = join(ROOT, "src");
const STAGING = join(ROOT, "staging");
const PLAN = join(ROOT, "plan.json");
const UPLOAD_OK = join(ROOT, "UPLOAD_OK");
const BUCKET = "r2prod:cdn-asset-site";

// ---------------------------------------------------------------- name helpers

const humanize = (s: string): string =>
  s
    .replace(/(?<=[a-z0-9])(?=[A-Z])/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const NW_PREFIXES =
  /^(portrait|card_|characterSprite_|Emote_FX_|Item_RelationshipReward_|Gift_|crystalMarbleCard_|bookOfLifePageCard_?)/;
const ROR2_STRIP = /^tex|Icon$|BodyIcon$/g;

// ---------------------------------------------------------------- game configs

type Entry = {
  name: string;
  category: string;
  internal: string;
  file: string;
  w?: number;
  h?: number;
};

type GameCfg = {
  dir: string;
  slug: string;
  displayName: string;
  suggestive: boolean;
  // extracted category dir -> site category {slug, name}
  categories: Record<string, { slug: string; name: string }>;
  entries: (manifest: any[]) => Entry[];
};

const GAMES: GameCfg[] = [
  {
    dir: "balatro",
    slug: "balatro",
    displayName: "Balatro",
    suggestive: false,
    categories: {
      jokers: { slug: "jokers", name: "Jokers" },
      tarot: { slug: "tarot", name: "Tarot" },
      planets: { slug: "planets", name: "Planets" },
      spectral: { slug: "spectral", name: "Spectral" },
      vouchers: { slug: "vouchers", name: "Vouchers" },
      boosters: { slug: "boosters", name: "Boosters" },
      decks: { slug: "decks", name: "Decks" },
      enhancers: { slug: "enhancers", name: "Enhancers" },
      tags: { slug: "tags", name: "Tags" },
    },
    entries: (m) =>
      m
        .filter((e) => e.file)
        .map((e) => ({
          name: String(e.name).toLowerCase(),
          category: e.category,
          internal: e.key,
          file: e.file,
          w: e.size?.[0],
          h: e.size?.[1],
        })),
  },
  {
    dir: "neon-white",
    slug: "neon-white",
    displayName: "Neon White",
    suggestive: true, // per Marcel 2026-07-02: whole game flagged suggestive
    categories: {
      portraits: { slug: "portraits", name: "Portraits" },
      cards: { slug: "cards", name: "Cards" },
      emotes: { slug: "emotes", name: "Emotes" },
      gifts: { slug: "gifts", name: "Gifts" },
      "character-sprites": { slug: "characters", name: "Characters" },
    },
    entries: (m) =>
      m.map((e) => ({
        name: humanize(String(e.internal_name).replace(NW_PREFIXES, "")),
        category: e.category,
        internal: e.internal_name,
        file: e.file,
        w: e.size?.[0],
        h: e.size?.[1],
      })),
  },
  {
    dir: "crosscode",
    slug: "crosscode",
    displayName: "CrossCode",
    suggestive: false,
    categories: { portraits: { slug: "portraits", name: "Portraits" } },
    entries: (m) =>
      m.map((e) => {
        const char = String(e.character).toLowerCase();
        const expr = humanize(String(e.expression));
        return {
          name: expr === "default" ? char : `${char} (${expr})`,
          category: "portraits",
          internal: `${e.character}/${e.expression}`,
          file: e.file,
          w: e.size?.[0],
          h: e.size?.[1],
        };
      }),
  },
  {
    dir: "ror2",
    slug: "risk-of-rain-2",
    displayName: "Risk of Rain 2",
    suggestive: false,
    categories: {
      survivors: { slug: "survivors", name: "Survivors" },
      buffs: { slug: "buffs", name: "Buffs" },
      artifacts: { slug: "artifacts", name: "Artifacts" },
      icons: { slug: "icons", name: "Icons" },
    },
    entries: (m) =>
      m.map((e) => ({
        name: humanize(String(e.internal_name).replace(ROR2_STRIP, "")),
        category: e.category,
        internal: e.internal_name,
        file: e.file,
        w: e.size?.[0],
        h: e.size?.[1],
      })),
  },
  {
    dir: "silksong",
    slug: "hollow-knight-silksong",
    displayName: "Hollow Knight: Silksong",
    suggestive: false,
    categories: {
      journal: { slug: "journal", name: "Journal" },
      "journal-icons": { slug: "journal-icons", name: "Journal Icons" },
      tools: { slug: "tools", name: "Tools" },
      crests: { slug: "crests", name: "Crests" },
      inventory: { slug: "items", name: "Items" },
      needles: { slug: "weapons", name: "Weapons" },
      furniture: { slug: "furniture", name: "Furniture" },
      currency: { slug: "currency", name: "Currency" },
      materium: { slug: "materium", name: "Materium" },
      wishes: { slug: "wishes", name: "Wishes" },
      achievements: { slug: "achievements", name: "Achievements" },
    },
    entries: (m) =>
      m.map((e) => ({
        // strip trailing animation-frame counters kept by the extractor (0000)
        name: humanize(String(e.internal_name).replace(/[_ ]?\d{4,}$/, "")),
        category: e.category,
        internal: e.internal_name,
        file: e.file,
        w: e.size?.[0],
        h: e.size?.[1],
      })),
  },
];

// ---------------------------------------------------------------- stage

type PlanAsset = {
  id: string;
  name: string;
  gameSlug: string;
  categorySlug: string;
  hash: string;
  size: number;
  width?: number;
  height?: number;
  suggestive: boolean;
  internal: string;
  srcFile: string;
};

function stage() {
  const plan: { assets: PlanAsset[]; games: { slug: string; name: string }[] } = {
    assets: [],
    games: [],
  };
  mkdirSync(join(STAGING, "asset"), { recursive: true });
  mkdirSync(join(STAGING, "game"), { recursive: true });

  for (const g of GAMES) {
    const out = join(SRC, g.dir, "out");
    const thumbs = join(SRC, g.dir, "out-thumbs");
    const manifest = JSON.parse(readFileSync(join(out, "manifest.json"), "utf8"));
    const entries = g.entries(manifest);
    let staged = 0;

    for (const e of entries) {
      const srcPng = join(out, e.file);
      const srcThumb = join(thumbs, e.file.replace(/\.png$/, ".webp"));
      if (!existsSync(srcPng)) {
        console.warn(`  missing original: ${g.dir}/${e.file}`);
        continue;
      }
      if (!existsSync(srcThumb)) {
        console.warn(`  missing thumb: ${g.dir}/${e.file}`);
        continue;
      }
      const cat = g.categories[e.category];
      if (!cat) {
        console.warn(`  unmapped category ${e.category} (${e.file})`);
        continue;
      }

      const bytes = readFileSync(srcPng);
      const id = uuidv7();
      cpSync(srcPng, join(STAGING, "asset", `${id}.png`));
      cpSync(srcThumb, join(STAGING, "asset", `${id}-thumb.webp`));
      plan.assets.push({
        id,
        name: e.name,
        gameSlug: g.slug,
        categorySlug: cat.slug,
        hash: createHash("sha256").update(bytes).digest("hex"),
        size: bytes.length,
        width: e.w,
        height: e.h,
        suggestive: g.suggestive,
        internal: e.internal,
        srcFile: `${g.dir}/${e.file}`,
      });
      staged++;
    }
    plan.games.push({ slug: g.slug, name: g.displayName });
    console.log(`${g.slug}: staged ${staged}/${entries.length}`);
  }

  for (const f of readdirSync(join(SRC, "game-assets"))) {
    cpSync(join(SRC, "game-assets", f), join(STAGING, "game", f));
  }

  writeFileSync(PLAN, JSON.stringify(plan, null, 1));
  const nStaged = readdirSync(join(STAGING, "asset")).length;
  console.log(
    `plan: ${plan.assets.length} assets (${nStaged} staged files incl thumbs), game art: ${readdirSync(join(STAGING, "game")).length} files`,
  );
}

// ---------------------------------------------------------------- upload

async function run(cmd: string[]): Promise<number> {
  const p = Bun.spawn(cmd, { stdout: "inherit", stderr: "inherit" });
  return await p.exited;
}

async function upload() {
  if (!existsSync(PLAN)) throw new Error("run stage first");
  console.log("uploading asset/ …");
  if (
    (await run([
      "rclone",
      "copy",
      join(STAGING, "asset"),
      `${BUCKET}/asset`,
      "--transfers",
      "16",
      "--stats-one-line",
      "-P",
    ])) !== 0
  )
    throw new Error("asset upload failed");
  console.log("uploading game/ …");
  if (
    (await run(["rclone", "copy", join(STAGING, "game"), `${BUCKET}/game`, "--transfers", "8"])) !==
    0
  )
    throw new Error("game art upload failed");
  console.log("verifying (rclone check, one-way) …");
  if (
    (await run(["rclone", "check", join(STAGING, "asset"), `${BUCKET}/asset`, "--one-way"])) !== 0
  )
    throw new Error("verification FAILED - do not insert");
  if ((await run(["rclone", "check", join(STAGING, "game"), `${BUCKET}/game`, "--one-way"])) !== 0)
    throw new Error("game art verification FAILED");
  writeFileSync(UPLOAD_OK, new Date().toISOString());
  console.log("UPLOAD_OK written - safe to insert");
}

// ---------------------------------------------------------------- insert

async function insert() {
  if (!existsSync(UPLOAD_OK))
    throw new Error("no UPLOAD_OK marker - run upload (and let verification pass) first");
  if (!process.env.DATABASE_URL?.startsWith("libsql://"))
    throw new Error("DATABASE_URL must point at prod turso (libsql://…)");

  const { drizzle } = await import("drizzle-orm/libsql");
  const { createClient } = await import("@libsql/client");
  const { eq, sql, inArray } = await import("drizzle-orm");
  const schema = await import("../src/schema");

  const client = createClient({
    url: process.env.DATABASE_URL!,
    authToken: process.env.DATABASE_AUTH_TOKEN,
  });
  const db = drizzle({ client, schema });

  const plan: { assets: PlanAsset[]; games: { slug: string; name: string }[] } = JSON.parse(
    readFileSync(PLAN, "utf8"),
  );
  const now = new Date();

  // -- games (skip existing by slug)
  const gameIds = new Map<string, string>();
  for (const g of plan.games) {
    const existing = await db.query.game.findFirst({ where: eq(schema.game.slug, g.slug) });
    if (existing) {
      gameIds.set(g.slug, existing.id);
      console.log(`game exists: ${g.slug}`);
    } else {
      const id = uuidv7();
      await db
        .insert(schema.game)
        .values({ id, slug: g.slug, name: g.name, lastUpdated: now, assetCount: 0 });
      gameIds.set(g.slug, id);
      console.log(`game created: ${g.slug}`);
    }
  }

  // -- categories (create missing), game↔category links
  const catSlugs = [...new Set(plan.assets.map((a) => a.categorySlug))];
  const catIds = new Map<string, string>();
  const existingCats = await db.query.category.findMany({
    where: inArray(schema.category.slug, catSlugs),
  });
  for (const c of existingCats) catIds.set(c.slug, c.id);
  const CAT_NAMES = new Map(
    GAMES.flatMap((g) => Object.values(g.categories).map((c) => [c.slug, c.name] as const)),
  );
  for (const slug of catSlugs) {
    if (catIds.has(slug)) continue;
    const id = uuidv7();
    await db.insert(schema.category).values({ id, slug, name: CAT_NAMES.get(slug) ?? slug });
    catIds.set(slug, id);
    console.log(`category created: ${slug}`);
  }
  const pairs = new Set(plan.assets.map((a) => `${a.gameSlug} ${a.categorySlug}`));
  for (const p of pairs) {
    const [gs, cs] = p.split(" ");
    if (!gs || !cs) continue;
    await db
      .insert(schema.gameToCategory)
      .values({ gameId: gameIds.get(gs)!, categoryId: catIds.get(cs)! })
      .onConflictDoNothing();
  }

  /* assets: sequential createdAt (1s apart, ending now) so keyset pagination
     on created_at (strict lt, second resolution) never sees ties within the drop */
  const base = now.getTime() - plan.assets.length * 1000;
  const rows = plan.assets.map((a, i) => ({
    id: a.id,
    name: a.name,
    gameId: gameIds.get(a.gameSlug)!,
    categoryId: catIds.get(a.categorySlug)!,
    uploadedBy: null,
    status: "approved" as const,
    hash: a.hash,
    size: a.size,
    extension: "png",
    isSuggestive: a.suggestive,
    metadata: a.width && a.height ? { image: { width: a.width, height: a.height } } : null,
    createdAt: new Date(base + (i + 1) * 1000),
  }));
  for (let i = 0; i < rows.length; i += 200) {
    await db.insert(schema.asset).values(rows.slice(i, i + 200));
    process.stdout.write(`\rinserted ${Math.min(i + 200, rows.length)}/${rows.length}`);
  }
  console.log();

  // -- denormalized game.assetCount + lastUpdated
  for (const [slug, gid] of gameIds) {
    const n = plan.assets.filter((a) => a.gameSlug === slug).length;
    await db
      .update(schema.game)
      .set({ assetCount: sql`${schema.game.assetCount} + ${n}`, lastUpdated: now })
      .where(eq(schema.game.id, gid));
    console.log(`${slug}: +${n} assets`);
  }
  console.log("insert complete");
}

// ---------------------------------------------------------------- main

const phase = process.argv[2];
if (phase === "stage") stage();
else if (phase === "upload") await upload();
else if (phase === "insert") await insert();
else console.log("usage: bun packages/db/scripts/backfill-extract.ts <stage|upload|insert>");

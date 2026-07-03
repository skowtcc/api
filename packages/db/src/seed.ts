import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { S3Client } from "bun";
import { existsSync } from "fs";
import dotenv from "dotenv";
import * as schema from "./schema";
import { eq, sql } from "drizzle-orm";

const envPath = existsSync("../../apps/server/.env.development")
  ? "../../apps/server/.env.development"
  : "../../apps/server/.env";
dotenv.config({ path: envPath });

const client = createClient({
  url: process.env.DATABASE_URL!,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

const db = drizzle({ client, schema });

// production data (fetched from den.skowt.cc/trpc)

const CDN_BASE = "https://pack.skowt.cc";
const API_BASE = "https://den.skowt.cc";

const tagsData = [
  { id: "0198392c-b7f1-75d4-9633-4741422cea74", slug: "official", name: "Official" },
  { id: "0198392c-b818-714f-a5f6-910a427e0cf9", slug: "fanmade", name: "Fanmade" },
];

const categoriesData = [
  {
    id: "01983909-866e-708a-a51a-275301f4c956",
    slug: "character-sheets",
    name: "Character Sheets",
  },
  {
    id: "0198390a-84bc-7739-8c2d-e01504a5a91d",
    slug: "gacha-backgrounds",
    name: "Gacha Backgrounds",
  },
  { id: "0198390a-8bb3-757b-8799-ed0d39396bd2", slug: "splash-art", name: "Splash Art" },
  { id: "0198390a-9b77-712e-ae27-6a2758715f91", slug: "artifacts", name: "Artifacts" },
  { id: "0198390a-bb7f-768a-80da-7f1193c4a264", slug: "character-cards", name: "Character Cards" },
  { id: "0198390a-c7e5-75e9-8909-b949ed999a60", slug: "character-icons", name: "Character Icons" },
  { id: "0198390b-2d66-7218-8399-222aa0de0265", slug: "elements", name: "Elements" },
  { id: "0198390b-2ea5-7540-abd7-cf05989b8538", slug: "emotes", name: "Emotes" },
  { id: "0198390b-b09f-723a-a99a-e2c7e7c535ab", slug: "food", name: "Food" },
  { id: "0198390b-d854-737d-900e-e787bcf55d2a", slug: "items", name: "Items" },
  { id: "0198390c-2b1c-72d8-8d08-b75dda4379bf", slug: "namecards", name: "Namecards" },
  { id: "0198390c-42d8-7648-988a-faf9051629e3", slug: "skills", name: "Skills" },
  { id: "0198390c-7a4f-759a-b9aa-2767a60d0eb9", slug: "talents", name: "Talents" },
  { id: "0198390c-deab-746f-840f-466e7cab0428", slug: "tcg", name: "TCG" },
  { id: "0198390c-fe3a-75c0-8d55-65f672d1181c", slug: "tcg-sheets", name: "TCG Sheets" },
  { id: "0198390d-0634-7317-86e8-9a36f0482310", slug: "weapon-icons", name: "Weapon Icons" },
  { id: "0198390d-5e6c-706c-ac6e-e394f3b408d4", slug: "full-body", name: "Full Body" },
  { id: "0198390d-6c31-735f-9732-b3a5acd504af", slug: "icons", name: "Icons" },
  {
    id: "0198390d-e672-736b-bd31-da74d1d12cd2",
    slug: "character-ascension-material",
    name: "Character Ascension Material",
  },
  {
    id: "0198390d-ed52-734e-8494-b52ab0e6d5b1",
    slug: "character-exp-material",
    name: "Character EXP Material",
  },
  { id: "0198390d-f733-719a-8c39-8bef5b38e01c", slug: "common-currency", name: "Common Currency" },
  { id: "0198390d-f7de-7663-a26a-111a5a7402ec", slug: "consumables", name: "Consumables" },
  { id: "0198390e-0dfc-73b4-a37f-e2611fc5b748", slug: "eidolons", name: "Eidolons" },
  { id: "0198390e-6c65-73e9-bb8c-991026008121", slug: "head-icons", name: "Head Icons" },
  {
    id: "0198390e-6ff4-71fd-b5a8-aa1e3989aa6b",
    slug: "light-cone-ascension-material",
    name: "Light Cone Ascension Material",
  },
  {
    id: "0198390e-75e1-7208-ba0b-ec2cd1b6e18a",
    slug: "light-cone-exp-material",
    name: "Light Cone EXP Material",
  },
  { id: "0198390e-7692-7076-9775-545fdd9fc1ce", slug: "light-cones", name: "Light Cones" },
  { id: "0198390e-96a1-70d9-8c27-49f0ead6078f", slug: "mission-items", name: "Mission Items" },
  { id: "0198390e-9732-73ad-8132-97aac8ed2451", slug: "other", name: "Other" },
  {
    id: "0198390e-9fff-74b9-8a67-342ec73c0bc8",
    slug: "relic-exp-material",
    name: "Relic EXP Material",
  },
  { id: "0198390e-a0d6-7127-930f-a305257ca83b", slug: "skill-icons", name: "Skill Icons" },
  {
    id: "0198390e-ddee-749b-aa85-e9bee6580dae",
    slug: "synthesis-material",
    name: "Synthesis Material",
  },
  { id: "0198390e-e4d5-7725-bb44-d0f36d73faae", slug: "tab-icons", name: "Tab Icons" },
  { id: "0198390e-ecd5-71da-bd52-011598af27c1", slug: "trace-materials", name: "Trace Materials" },
  {
    id: "0198390e-edd0-71b3-be5e-59c0637f926a",
    slug: "valuable-objects",
    name: "Valuable Objects",
  },
  { id: "0198390e-f011-706d-bd5f-0873e22b602b", slug: "world-currency", name: "World Currency" },
  { id: "0198390e-f123-766e-bad0-c84aa3aa47b7", slug: "background", name: "Background" },
  { id: "0198390e-ffe1-728c-ad3b-3e5911f50141", slug: "characters", name: "Characters" },
  { id: "0198390f-76d9-752d-a1f4-9afe6bbd5d10", slug: "emojis", name: "Emojis" },
  { id: "0198390f-87a7-7026-8e95-08b7d5e505a9", slug: "food-icons", name: "Food Icons" },
  { id: "0198390f-a3ab-75ae-bf42-b702c8910cd6", slug: "stream", name: "Stream" },
  { id: "0198390f-de82-7419-a164-feb728de1eb3", slug: "tweet", name: "Tweet" },
  { id: "0198390f-e8a8-7788-ba61-aa2b3e618e80", slug: "character", name: "Character" },
  { id: "0198390f-f3bc-7659-b20a-bb0e1fe8a46e", slug: "etc", name: "Etc" },
  { id: "01983911-4218-76ca-b589-20adf9ad4093", slug: "map", name: "Map" },
  { id: "01983911-62d8-7389-b7b1-ce66f13563fe", slug: "tutorial", name: "Tutorial" },
  { id: "01983911-7153-705a-9070-8e755f1d19d4", slug: "ui", name: "UI" },
  { id: "01983911-ec19-73b8-91b1-7ba06e4d07b1", slug: "chibi-sheets", name: "Chibi Sheets" },
  { id: "01983912-07c9-7226-acfe-4b4352692d83", slug: "stamps", name: "Stamps" },
  { id: "01983914-9ff9-774c-a512-9847bcdaa3fa", slug: "achievements", name: "Achievements" },
  { id: "01983916-1444-71db-ad22-34c0f95ac671", slug: "cutscenes", name: "Cutscenes" },
  { id: "01983917-3281-7338-9f2d-02fa94e08503", slug: "id-cards", name: "ID Cards" },
  { id: "01983917-d8b5-75fe-9883-b6d638536070", slug: "logos-names", name: "Logos Names" },
  { id: "0198391a-df81-77b5-befa-bb9d3ad449b1", slug: "silhouettes", name: "Silhouettes" },
  { id: "0198391b-2195-7329-9db9-05f629c0fbef", slug: "textures", name: "Textures" },
  { id: "0198391f-8077-726e-8ebc-52b7185635e3", slug: "weapons", name: "Weapons" },
  { id: "01983920-5539-74ea-b31f-b1fbeb4a5ff7", slug: "archive-images", name: "Archive Images" },
  { id: "01983920-5c8f-764b-a4d5-98cac7a5352f", slug: "backgrounds", name: "Backgrounds" },
  { id: "01983920-660e-77e6-aa30-71f9aad97c3a", slug: "cards", name: "Cards" },
  { id: "01983920-ad42-760a-9e3b-acdc48bc8c88", slug: "luckdraw", name: "Luckdraw" },
  { id: "01983920-bcd7-715d-b68f-2bf0931b635c", slug: "monster-icons", name: "Monster Icons" },
  { id: "01983920-d975-70d5-94e8-c1b29ee53797", slug: "portraits", name: "Portraits" },
  { id: "01983920-ef86-729d-a167-a48297d73eb9", slug: "card", name: "Card" },
  { id: "01983921-8012-74a5-ba90-579e65d0c37b", slug: "currency", name: "Currency" },
  { id: "01983921-9c7e-7251-8136-5a72d44e96f8", slug: "equip", name: "Equip" },
  { id: "01983921-a835-7428-a186-8e40576b184d", slug: "gacha", name: "Gacha" },
  { id: "01983921-b02b-77c0-a54d-0c10baea925c", slug: "icon", name: "Icon" },
  { id: "01983922-1ad4-77ba-9985-e6b797a987ba", slug: "logos", name: "Logos" },
  { id: "01983922-2bc0-7729-adda-c28973ad63a1", slug: "materials", name: "Materials" },
  { id: "01983922-5d37-7448-b744-2c571c0829b1", slug: "monsters", name: "Monsters" },
  { id: "01983922-86fb-76df-a8d4-1dfd4c1f9271", slug: "others", name: "Others" },
  { id: "01983922-e719-7472-8c28-9766ced6c949", slug: "scene", name: "Scene" },
  { id: "01983923-87de-763c-b5d5-b82b02adbf5c", slug: "stickers", name: "Stickers" },
];

const gamesData = [
  {
    id: "01983909-8633-77ae-b6bd-baf9ed3f4078",
    slug: "blue-archive",
    name: "Blue Archive",
    categories: ["character-sheets"],
  },
  {
    id: "01983909-b408-7036-888a-76ff68e97bc8",
    slug: "cookie-run",
    name: "Cookie Run",
    categories: ["gacha-backgrounds", "splash-art"],
  },
  {
    id: "0198390a-8b7a-7134-a487-8f2ef41deb7a",
    slug: "dislyte",
    name: "Dislyte",
    categories: ["splash-art"],
  },
  {
    id: "0198390a-9b36-7687-83c4-e133684e4d39",
    slug: "genshin-impact",
    name: "Genshin Impact",
    categories: [
      "character-sheets",
      "splash-art",
      "artifacts",
      "character-cards",
      "character-icons",
      "elements",
      "emotes",
      "food",
      "items",
      "namecards",
      "skills",
      "talents",
      "tcg",
      "tcg-sheets",
      "weapon-icons",
    ],
  },
  {
    id: "0198390d-21b5-752d-9728-ba2903890013",
    slug: "goddess-of-victory-nikke",
    name: "Goddess Of Victory: Nikke",
    categories: ["character-sheets", "full-body", "icons"],
  },
  {
    id: "0198390d-876d-712a-a290-1872f520d7bd",
    slug: "honkai-impact-3rd",
    name: "Honkai Impact 3rd",
    categories: ["splash-art", "emotes"],
  },
  {
    id: "0198f4ae-4572-7e86-859e-896ba2672ce8",
    slug: "honkai-nexus-anima",
    name: "Honkai: Nexus Anima",
    categories: ["character-sheets", "splash-art"],
  },
  {
    id: "0198390d-e63b-77e0-959c-d5449cb290db",
    slug: "honkai-star-rail",
    name: "Honkai: Star Rail",
    categories: [
      "character-sheets",
      "splash-art",
      "elements",
      "emotes",
      "icons",
      "character-ascension-material",
      "character-exp-material",
      "common-currency",
      "consumables",
      "eidolons",
      "head-icons",
      "light-cone-ascension-material",
      "light-cone-exp-material",
      "light-cones",
      "mission-items",
      "other",
      "relic-exp-material",
      "skill-icons",
      "synthesis-material",
      "tab-icons",
      "trace-materials",
      "valuable-objects",
      "world-currency",
    ],
  },
  {
    id: "0198390e-f0e3-76be-a1d6-b7e593954072",
    slug: "needy-streamer-overload",
    name: "Needy Streamer Overload",
    categories: [
      "icons",
      "other",
      "background",
      "characters",
      "emojis",
      "food-icons",
      "stream",
      "tweet",
    ],
  },
  {
    id: "0198390f-e86f-714b-b9bd-17d1a2b13a9d",
    slug: "persona-3-reload",
    name: "Persona 3 Reload",
    categories: ["character", "etc", "map", "tutorial", "ui"],
  },
  {
    id: "01983911-cd79-728c-9d24-0ccc79325f87",
    slug: "project-sekai",
    name: "Project Sekai",
    categories: ["character-sheets", "chibi-sheets", "stamps"],
  },
  {
    id: "01983912-4346-7182-93b3-d20c75f7b7fc",
    slug: "reverse-1999",
    name: "Reverse: 1999",
    categories: ["character-sheets"],
  },
  {
    id: "01983912-6de6-72ff-8c52-54b849de4142",
    slug: "sino-alice",
    name: "Sino Alice",
    categories: ["character-sheets", "splash-art", "other"],
  },
  {
    id: "01983914-9fb2-7193-986b-9b236eaa5f5e",
    slug: "strinova",
    name: "Strinova",
    categories: [
      "emotes",
      "items",
      "icons",
      "other",
      "background",
      "characters",
      "achievements",
      "cutscenes",
      "id-cards",
      "logos-names",
      "silhouettes",
      "textures",
      "weapons",
    ],
  },
  {
    id: "0198f590-4efd-7752-a0b7-142f12b29398",
    slug: "tears-of-themis",
    name: "Tears of Themis",
    categories: ["character-sheets", "splash-art"],
  },
  {
    id: "01983920-48a8-724f-959a-17d76310eb4a",
    slug: "tower-of-fantasy",
    name: "Tower Of Fantasy",
    categories: ["splash-art"],
  },
  {
    id: "01983920-54ff-778e-81a7-8997b0dd9f7d",
    slug: "wuthering-waves",
    name: "Wuthering Waves",
    categories: [
      "character-sheets",
      "character-icons",
      "elements",
      "emotes",
      "weapon-icons",
      "icons",
      "other",
      "skill-icons",
      "archive-images",
      "backgrounds",
      "cards",
      "luckdraw",
      "monster-icons",
      "portraits",
    ],
  },
  {
    id: "01983920-ee89-756a-a41a-0aa350739a0c",
    slug: "zenless-zone-zero",
    name: "Zenless Zone Zero",
    categories: [
      "character-sheets",
      "character-icons",
      "emotes",
      "food",
      "items",
      "background",
      "characters",
      "emojis",
      "textures",
      "weapons",
      "portraits",
      "card",
      "currency",
      "equip",
      "gacha",
      "icon",
      "logos",
      "materials",
      "monsters",
      "others",
      "scene",
      "stickers",
    ],
  },
];

/* assets are fetched live from the prod API at seed time: the top assets by
   downloads for a few games with good data. real ids/names/dims/hashes; the
   image bytes come from the pre-generated ~23KB thumbs rather than the
   multi-MB originals, so a full seed downloads a few MB total */
const SEED_GAME_SLUGS = ["genshin-impact", "honkai-star-rail", "zenless-zone-zero"];
const ASSETS_PER_GAME = 30;

interface FetchedAsset {
  id: string;
  name: string;
  hash: string;
  extension: string;
  size: number;
  isSuggestive: boolean;
  metadata: { image: { width: number; height: number } } | null;
  game: { slug: string };
  category: { slug: string };
  tags: Array<{ slug: string }>;
}

async function fetchTopAssets(): Promise<FetchedAsset[]> {
  const gameBySlug = new Map(gamesData.map((g) => [g.slug, g]));
  const out: FetchedAsset[] = [];
  for (const slug of SEED_GAME_SLUGS) {
    const game = gameBySlug.get(slug);
    if (!game) {
      console.warn(`   unknown seed game slug: ${slug}`);
      continue;
    }
    const input = encodeURIComponent(
      JSON.stringify({ games: [game.id], sortBy: "downloads", limit: ASSETS_PER_GAME }),
    );
    try {
      const res = await fetch(`${API_BASE}/trpc/asset.query?input=${input}`);
      if (!res.ok) {
        console.warn(`   asset.query failed for ${slug}: ${res.status}`);
        continue;
      }
      const body = (await res.json()) as { result?: { data?: { items?: FetchedAsset[] } } };
      out.push(...(body.result?.data?.items ?? []));
    } catch (error) {
      console.warn(`   asset.query failed for ${slug}:`, error);
    }
  }
  return out;
}

const testUsers = [
  { id: "test-user-001", name: "Test User", email: "test@skowt.cc", role: "user" as const },
  { id: "test-user-002", name: "Dev Account", email: "dev@skowt.cc", role: "developer" as const },
  {
    id: "test-user-003",
    name: "Contributor",
    email: "contributor@skowt.cc",
    role: "contributor" as const,
  },
  { id: "test-user-004", name: "Staff Member", email: "staff@skowt.cc", role: "staff" as const },
];

function getS3Client(): S3Client {
  return new S3Client({
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    endpoint: process.env.S3_ENDPOINT!,
    bucket: process.env.S3_BUCKET!,
    region: "auto",
  });
}

async function downloadToS3(id: string, extension: string, s3: S3Client): Promise<boolean> {
  const s3Key = `asset/${id}.${extension}`;

  const file = s3.file(s3Key);
  if (await file.exists()) return true;

  /* prefer the ~23KB pre-generated thumb over the multi-MB original: local dev
     serves whatever bytes sit at the raw key, and browsers content-sniff the
     webp payload fine. fall back to the original if the thumb is missing */
  for (const url of [
    `${CDN_BASE}/asset/${id}-thumb.webp`,
    `${CDN_BASE}/asset/${id}.${extension}`,
  ]) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      await file.write(await response.arrayBuffer());
      return true;
    } catch {
      // try the next source
    }
  }
  console.warn(`   failed to download image for ${id}`);
  return false;
}

async function seedGames() {
  console.log("Seeding games...");
  for (const g of gamesData) {
    await db
      .insert(schema.game)
      .values({ id: g.id, slug: g.slug, name: g.name, lastUpdated: new Date(), assetCount: 0 })
      .onConflictDoNothing();
  }
  console.log(`   ${gamesData.length} games`);
}

async function seedCategories() {
  console.log("Seeding categories...");
  for (const c of categoriesData) {
    await db
      .insert(schema.category)
      .values({ id: c.id, slug: c.slug, name: c.name })
      .onConflictDoNothing();
  }
  console.log(`   ${categoriesData.length} categories`);
}

async function seedGameToCategory() {
  console.log("Linking games to categories...");
  let count = 0;
  const categoryBySlug = new Map(categoriesData.map((c) => [c.slug, c]));

  for (const g of gamesData) {
    for (const slug of g.categories) {
      const cat = categoryBySlug.get(slug);
      if (cat) {
        await db
          .insert(schema.gameToCategory)
          .values({ gameId: g.id, categoryId: cat.id })
          .onConflictDoNothing();
        count++;
      }
    }
  }
  console.log(`   ${count} game-category links`);
}

async function seedTags() {
  console.log("Seeding tags...");
  for (const t of tagsData) {
    await db
      .insert(schema.tag)
      .values({ id: t.id, slug: t.slug, name: t.name })
      .onConflictDoNothing();
  }
  console.log(`   ${tagsData.length} tags`);
}

async function seedUsers() {
  console.log("Seeding test users...");
  for (const user of testUsers) {
    await db
      .insert(schema.user)
      .values({
        id: user.id,
        name: user.name,
        email: user.email,
        emailVerified: true,
        role: user.role,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: { role: user.role, name: user.name },
      });
  }
  console.log(`   ${testUsers.length} users`);
}

async function seedAssets() {
  console.log(
    `Seeding assets (top ${ASSETS_PER_GAME} by downloads from ${SEED_GAME_SLUGS.length} games, live from ${API_BASE})...`,
  );
  const fetched = await fetchTopAssets();
  if (fetched.length === 0) {
    console.warn("   no assets fetched - is den.skowt.cc reachable? skipping asset seed");
    return;
  }

  const gameBySlug = new Map(gamesData.map((g) => [g.slug, g]));
  const categoryBySlug = new Map(categoriesData.map((c) => [c.slug, c]));
  const tagBySlug = new Map(tagsData.map((t) => [t.slug, t]));

  let s3: S3Client | null = null;
  try {
    s3 = getS3Client();
  } catch {
    console.warn("   S3 not available; skipping image downloads");
  }

  let downloaded = 0;
  let failed = 0;
  let seeded = 0;

  for (let i = 0; i < fetched.length; i++) {
    const a = fetched[i]!;
    const game = gameBySlug.get(a.game.slug);
    const category = categoryBySlug.get(a.category.slug);
    if (!game || !category) continue;

    await db
      .insert(schema.asset)
      .values({
        id: a.id,
        name: a.name,
        gameId: game.id,
        categoryId: category.id,
        uploadedBy: testUsers[0]!.id,
        status: "approved",
        hash: a.hash,
        size: a.size,
        extension: a.extension,
        /* the public API stopped exposing per-asset counts; synthesize
           rank-correlated values so the popularity sorts have variance locally */
        downloadCount: (fetched.length - i) * 25,
        viewCount: (fetched.length - i) * 90,
        isSuggestive: a.isSuggestive,
        ...(a.metadata ? { metadata: a.metadata } : {}),
        // stagger creation times so the date sort has variance too
        createdAt: new Date(Date.now() - i * 60 * 60 * 1000),
      })
      .onConflictDoNothing();
    seeded++;

    for (const t of a.tags ?? []) {
      const tag = tagBySlug.get(t.slug);
      if (tag) {
        await db
          .insert(schema.assetToTag)
          .values({ assetId: a.id, tagId: tag.id })
          .onConflictDoNothing();
      }
    }

    if (s3) {
      const ok = await downloadToS3(a.id, a.extension, s3);
      if (ok) downloaded++;
      else failed++;
      process.stdout.write(`\r   ${downloaded} downloaded, ${failed} failed...`);
    }
  }

  // keep the per-game denormalized counts honest for anything that reads them
  for (const g of gamesData) {
    await db
      .update(schema.game)
      .set({
        assetCount: sql<number>`(SELECT COUNT(*) FROM ${schema.asset} WHERE ${schema.asset.gameId} = ${g.id})`,
        lastUpdated: new Date(),
      })
      .where(eq(schema.game.id, g.id));
  }

  console.log(
    `\r   ${seeded} assets seeded, ${downloaded} images downloaded${failed > 0 ? `, ${failed} failed` : ""}                `,
  );
}

const requestEntriesData = [
  // game requests
  {
    id: "vote-001",
    type: "game" as const,
    title: "Lorem ipsum dolor sit amet",
    description:
      "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium doloremque laudantium.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-001",
    voteCount: 47,
  },
  {
    id: "vote-002",
    type: "game" as const,
    title: "Consectetur adipiscing elit",
    description: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-002",
    voteCount: 34,
  },
  {
    id: "vote-003",
    type: "game" as const,
    title: "Nemo enim ipsam voluptatem",
    description:
      "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse quam nihil molestiae.",
    status: "in_progress" as const,
    gameId: null,
    createdBy: "test-user-003",
    voteCount: 29,
  },
  {
    id: "vote-004",
    type: "game" as const,
    title: "Ut enim ad minima veniam",
    description: "Neque porro quisquam est qui dolorem ipsum quia dolor sit amet consectetur.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-001",
    voteCount: 22,
  },
  {
    id: "vote-005",
    type: "game" as const,
    title: "Quis nostrud exercitation",
    description: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-002",
    voteCount: 19,
  },

  // game category requests (tied to existing games)
  {
    id: "vote-006",
    type: "game_category" as const,
    title: "Excepteur sint occaecat cupidatat",
    description: "At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis.",
    status: "open" as const,
    gameId: "0198390a-9b36-7687-83c4-e133684e4d39",
    createdBy: "test-user-003",
    voteCount: 15,
  },
  {
    id: "vote-007",
    type: "game_category" as const,
    title: "Temporibus autem quibusdam",
    description: "Nam libero tempore cum soluta nobis est eligendi optio cumque nihil impedit.",
    status: "open" as const,
    gameId: "01983920-ee89-756a-a41a-0aa350739a0c",
    createdBy: "test-user-001",
    voteCount: 12,
  },
  {
    id: "vote-008",
    type: "game_category" as const,
    title: "Itaque earum rerum hic",
    description: "Similique sunt in culpa qui officia deserunt mollitia animi id est laborum.",
    status: "completed" as const,
    gameId: "0198390d-e63b-77e0-959c-d5449cb290db",
    createdBy: "test-user-002",
    voteCount: 41,
  },
  {
    id: "vote-009",
    type: "game_category" as const,
    title: "Neque porro quisquam est",
    description: "Nisi ut aliquid ex ea commodi consequatur quis autem vel eum iure.",
    status: "open" as const,
    gameId: "01983909-8633-77ae-b6bd-baf9ed3f4078",
    createdBy: "test-user-003",
    voteCount: 26,
  },
  {
    id: "vote-010",
    type: "game_category" as const,
    title: "Sed ut perspiciatis unde",
    description: "Totam rem aperiam eaque ipsa quae ab illo inventore veritatis et quasi.",
    status: "open" as const,
    gameId: "0198390d-21b5-752d-9728-ba2903890013",
    createdBy: "test-user-001",
    voteCount: 8,
  },

  // other / feature requests
  {
    id: "vote-011",
    type: "other" as const,
    title: "Duis aute irure dolor",
    description:
      "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia deserunt.",
    status: "in_progress" as const,
    gameId: null,
    createdBy: "test-user-002",
    voteCount: 63,
  },
  {
    id: "vote-012",
    type: "other" as const,
    title: "Voluptatem accusantium doloremque",
    description:
      "Totam rem aperiam eaque ipsa quae ab illo inventore veritatis et quasi architecto.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-003",
    voteCount: 38,
  },
  {
    id: "vote-013",
    type: "other" as const,
    title: "Accusamus et iusto odio",
    description: "Dignissimos ducimus qui blanditiis praesentium voluptatum deleniti.",
    status: "rejected" as const,
    gameId: null,
    createdBy: "test-user-001",
    voteCount: 5,
  },
  {
    id: "vote-014",
    type: "other" as const,
    title: "Nam libero tempore cum",
    description:
      "Soluta nobis est eligendi optio cumque nihil impedit quo minus id quod maxime placeat.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-002",
    voteCount: 31,
  },
  {
    id: "vote-015",
    type: "other" as const,
    title: "Similique sunt in culpa",
    description: "Qui officia deserunt mollitia animi id est laborum et dolorum fuga.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-003",
    voteCount: 11,
  },
  {
    id: "vote-016",
    type: "other" as const,
    title: "Et harum quidem rerum",
    description: "Facilis est et expedita distinctio nam libero tempore cum soluta nobis est.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-001",
    voteCount: 44,
  },
  {
    id: "vote-017",
    type: "game" as const,
    title: "Inventore veritatis et quasi",
    description: "Architecto beatae vitae dicta sunt explicabo nemo enim ipsam voluptatem.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-003",
    voteCount: 7,
  },
  {
    id: "vote-018",
    type: "other" as const,
    title: "Omnis voluptas assumenda est",
    description: "Omnis dolor repellendus temporibus autem quibusdam et aut officiis debitis.",
    status: "open" as const,
    gameId: null,
    createdBy: "test-user-002",
    voteCount: 52,
  },
];

const requestCommentsData = [
  {
    id: "vc-001",
    entryId: "vote-001",
    userId: "test-user-002",
    content: "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse.",
    upvoteCount: 8,
  },
  {
    id: "vc-002",
    entryId: "vote-001",
    userId: "test-user-003",
    content: "Nemo enim ipsam voluptatem quia voluptas sit aspernatur aut odit.",
    upvoteCount: 3,
  },
  {
    id: "vc-003",
    entryId: "vote-003",
    userId: "test-user-001",
    content: "Ut enim ad minima veniam quis nostrum exercitationem ullam corporis.",
    upvoteCount: 5,
  },
  {
    id: "vc-004",
    entryId: "vote-011",
    userId: "test-user-001",
    content: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium.",
    upvoteCount: 14,
  },
  {
    id: "vc-005",
    entryId: "vote-011",
    userId: "test-user-003",
    content: "At vero eos et accusamus et iusto odio dignissimos ducimus.",
    upvoteCount: 6,
  },
  {
    id: "vc-006",
    entryId: "vote-012",
    userId: "test-user-001",
    content: "Nam libero tempore cum soluta nobis est eligendi optio cumque.",
    upvoteCount: 9,
  },
  {
    id: "vc-007",
    entryId: "vote-008",
    userId: "test-user-001",
    content: "Temporibus autem quibusdam et aut officiis debitis aut rerum.",
    upvoteCount: 11,
  },
  {
    id: "vc-008",
    entryId: "vote-008",
    userId: "test-user-003",
    content: "Itaque earum rerum hic tenetur a sapiente delectus.",
    upvoteCount: 4,
  },
  {
    id: "vc-009",
    entryId: "vote-016",
    userId: "test-user-002",
    content: "Neque porro quisquam est qui dolorem ipsum quia dolor sit amet.",
    upvoteCount: 7,
  },
  {
    id: "vc-010",
    entryId: "vote-018",
    userId: "test-user-001",
    content: "Excepteur sint occaecat cupidatat non proident sunt in culpa qui officia.",
    upvoteCount: 10,
  },
  {
    id: "vc-011",
    entryId: "vote-014",
    userId: "test-user-003",
    content: "Duis aute irure dolor in reprehenderit in voluptate velit esse cillum.",
    upvoteCount: 5,
  },
  {
    id: "vc-012",
    entryId: "vote-013",
    userId: "test-user-002",
    content: "Lorem ipsum dolor sit amet consectetur adipiscing elit.",
    upvoteCount: 2,
  },
  {
    id: "vc-013",
    entryId: "vote-011",
    userId: "test-user-004",
    content:
      "Similique sunt in culpa qui officia deserunt mollitia animi id est laborum et dolorum fuga.",
    upvoteCount: 18,
  },
  {
    id: "vc-014",
    entryId: "vote-003",
    userId: "test-user-004",
    content: "Voluptatem accusantium doloremque laudantium totam rem aperiam.",
    upvoteCount: 12,
  },
  {
    id: "vc-015",
    entryId: "vote-013",
    userId: "test-user-004",
    content: "Inventore veritatis et quasi architecto beatae vitae dicta sunt explicabo.",
    upvoteCount: 3,
  },
  {
    id: "vc-016",
    entryId: "vote-008",
    userId: "test-user-004",
    content: "Omnis voluptas assumenda est omnis dolor repellendus temporibus autem quibusdam.",
    upvoteCount: 15,
  },
];

async function seedRequests() {
  console.log("Seeding request entries...");

  const now = Date.now();
  for (let i = 0; i < requestEntriesData.length; i++) {
    const entry = requestEntriesData[i]!;
    // stagger creation dates so they appear over a span of time
    const createdAt = new Date(now - (requestEntriesData.length - i) * 2 * 24 * 60 * 60 * 1000);
    await db
      .insert(schema.request)
      .values({
        id: entry.id,
        type: entry.type,
        title: entry.title,
        description: entry.description,
        status: entry.status,
        gameId: entry.gameId,
        createdBy: entry.createdBy,
        voteCount: entry.voteCount,
        createdAt,
      })
      .onConflictDoNothing();
  }
  console.log(`   ${requestEntriesData.length} request entries`);

  // seed some votes (from test users to match voteCount loosely)
  console.log("Seeding votes on requests...");
  let voteIdx = 0;
  for (const entry of requestEntriesData) {
    for (const user of testUsers) {
      if (entry.voteCount > 5) {
        voteIdx++;
        await db
          .insert(schema.requestVote)
          .values({
            id: `vote-record-${String(voteIdx).padStart(4, "0")}`,
            entryId: entry.id,
            userId: user.id,
            createdAt: new Date(now - Math.random() * 30 * 24 * 60 * 60 * 1000),
          })
          .onConflictDoNothing();
      }
    }
  }
  console.log(`   ${voteIdx} vote records`);

  console.log("Seeding request comments...");
  for (const comment of requestCommentsData) {
    await db
      .insert(schema.requestComment)
      .values({
        id: comment.id,
        entryId: comment.entryId,
        userId: comment.userId,
        content: comment.content,
        upvoteCount: comment.upvoteCount,
        createdAt: new Date(now - Math.random() * 20 * 24 * 60 * 60 * 1000),
        updatedAt: new Date(now - Math.random() * 5 * 24 * 60 * 60 * 1000),
      })
      .onConflictDoNothing();
  }
  console.log(`   ${requestCommentsData.length} comments`);
}

async function main() {
  console.log("\nStarting database seed...\n");

  const startTime = Date.now();

  try {
    await seedGames();
    await seedCategories();
    await seedGameToCategory();
    await seedTags();
    await seedUsers();
    await seedAssets();
    await seedRequests();

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\nSeed completed in ${duration}s!\n`);
  } catch (error) {
    console.error("\nSeed failed:", error);
    process.exit(1);
  }

  process.exit(0);
}

main();

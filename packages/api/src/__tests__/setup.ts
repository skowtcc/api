import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { v7 as uuidv7 } from "uuid";
import * as schema from "@skowt-monorepo/db/schema";
import type { UserRole } from "@skowt-monorepo/db/schema/auth";
import { ASSET_FTS_TABLE_DDL, ASSET_FTS_TRIGGERS } from "@skowt-monorepo/db/fts";

process.env.NODE_ENV = "test";

/* env defaults are set in _env-preload.ts (loaded via bunfig.toml [test] preload) so they
   land before any module-load-time getServerEnv() call. this block stays as belt-and-braces
   for direct imports outside the test runner */
process.env.BETTER_AUTH_SECRET ??= "test-secret-do-not-use-in-prod-min-1-char";

/* file-backed SQLite by default. multiple libsql clients (setup.ts's testClient and the
   shared db from packages/db) need to see the same backing store, which `:memory:` does
   not guarantee (each createClient(':memory:') gets a separate DB). schema drift is
   handled by _env-preload.ts unlinking the file at process startup + DROP IF EXISTS in
   setupTestDatabase */
const testDatabaseUrl = process.env.DATABASE_URL?.trim() || "file:api-test.db";
process.env.DATABASE_URL = testDatabaseUrl;

const client = createClient({
  url: testDatabaseUrl,
  authToken: process.env.DATABASE_AUTH_TOKEN,
});

export const testDb = drizzle({ client, schema });

export function createTestUser(overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  return {
    id: uuidv7(),
    name: "Test User",
    email: `test-${uuidv7()}@example.com`,
    emailVerified: true,
    role: "user" as UserRole,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestGame(overrides: Partial<typeof schema.game.$inferInsert> = {}) {
  const id = uuidv7();
  return {
    id,
    slug: `test-game-${id.slice(0, 8)}`,
    name: "Test Game",
    lastUpdated: new Date(),
    assetCount: 0,
    ...overrides,
  };
}

export function createTestCategory(overrides: Partial<typeof schema.category.$inferInsert> = {}) {
  const id = uuidv7();
  return {
    id,
    slug: `test-category-${id.slice(0, 8)}`,
    name: "Test Category",
    ...overrides,
  };
}

export function createTestTag(overrides: Partial<typeof schema.tag.$inferInsert> = {}) {
  const id = uuidv7();
  return {
    id,
    slug: `test-tag-${id.slice(0, 8)}`,
    name: "Test Tag",
    ...overrides,
  };
}

export function createTestAsset(
  gameId: string,
  categoryId: string,
  uploadedBy: string,
  overrides: Partial<typeof schema.asset.$inferInsert> = {},
) {
  return {
    id: uuidv7(),
    name: "Test Asset",
    gameId,
    categoryId,
    uploadedBy,
    status: "approved" as const,
    hash: uuidv7(),
    size: 1024,
    extension: "png",
    downloadCount: 0,
    viewCount: 0,
    isSuggestive: false,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestRequest(
  createdBy: string,
  overrides: Partial<typeof schema.request.$inferInsert> = {},
) {
  return {
    id: uuidv7(),
    type: "game" as const,
    title: "Lorem ipsum dolor sit amet",
    description: "Sed ut perspiciatis unde omnis iste natus error sit voluptatem accusantium",
    status: "open" as const,
    createdBy,
    voteCount: 0,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestRequestVote(
  entryId: string,
  userId: string,
  overrides: Partial<typeof schema.requestVote.$inferInsert> = {},
) {
  return {
    id: uuidv7(),
    entryId,
    userId,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createTestRequestComment(
  entryId: string,
  userId: string,
  overrides: Partial<typeof schema.requestComment.$inferInsert> = {},
) {
  return {
    id: uuidv7(),
    entryId,
    userId,
    content: "Quis autem vel eum iure reprehenderit qui in ea voluptate velit esse",
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

export function createTestSavedAsset(
  userId: string,
  assetId: string,
  overrides: Partial<typeof schema.savedAsset.$inferInsert> = {},
) {
  return {
    id: uuidv7(),
    userId,
    assetId,
    createdAt: new Date(),
    ...overrides,
  };
}

export function createMockSession(user: typeof schema.user.$inferInsert) {
  return {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      emailVerified: user.emailVerified,
      image: user.image ?? null,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    },
    session: {
      id: uuidv7(),
      userId: user.id,
      token: uuidv7(),
      expiresAt: new Date(Date.now() + 86400000), // 24 hours
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

/* database setup helpers
   drops every table first so the CREATE statements below run against a clean slate.
   pairs with _env-preload.ts unlinking the test DB file on process startup; together
   they guarantee schema-current state regardless of leftover state from prior runs */
const ALL_TABLES = [
  "comment_upvote",
  "vote_comment",
  "vote",
  "vote_entry",
  "saved_asset",
  "asset_to_tag",
  "asset",
  "game_to_category",
  "tag",
  "category",
  "game",
  "verification",
  "account",
  "session",
  "user",
];

export async function setupTestDatabase() {
  /* drop the FTS virtual table first; its triggers live on `asset` and are dropped
     automatically when the asset table is dropped in the loop below */
  await client.execute("DROP TABLE IF EXISTS asset_fts");

  // drop in reverse-dependency order so foreign keys don't block
  for (const table of ALL_TABLES) {
    await client.execute(`DROP TABLE IF EXISTS ${table}`);
  }

  // create all tables
  await client.execute(`
    CREATE TABLE IF NOT EXISTS user (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      display_name TEXT,
      email TEXT NOT NULL UNIQUE,
      email_verified INTEGER NOT NULL,
      image TEXT,
      role TEXT NOT NULL DEFAULT 'user',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      profile_updated_at INTEGER
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS session (
      id TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      token TEXT NOT NULL UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS account (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      provider_id TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      access_token TEXT,
      refresh_token TEXT,
      id_token TEXT,
      access_token_expires_at INTEGER,
      refresh_token_expires_at INTEGER,
      scope TEXT,
      password TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  /* verification table; required by better-auth even though no test currently exercises it.
     missing it would cause better-auth bootstrap to fail in any test that touches auth init */
  await client.execute(`
    CREATE TABLE IF NOT EXISTS verification (
      id TEXT PRIMARY KEY,
      identifier TEXT NOT NULL,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      created_at INTEGER,
      updated_at INTEGER
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS game (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      last_updated INTEGER NOT NULL,
      asset_count INTEGER NOT NULL DEFAULT 0,
      publisher TEXT,
      usage_terms TEXT,
      terms_url TEXT
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS category (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS tag (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS game_to_category (
      game_id TEXT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES category(id) ON DELETE CASCADE,
      PRIMARY KEY (game_id, category_id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS asset (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      game_id TEXT NOT NULL REFERENCES game(id) ON DELETE CASCADE,
      category_id TEXT NOT NULL REFERENCES category(id) ON DELETE CASCADE,
      uploaded_by TEXT REFERENCES user(id),
      status TEXT NOT NULL DEFAULT 'pending',
      hash TEXT NOT NULL,
      size INTEGER NOT NULL,
      extension TEXT NOT NULL,
      download_count INTEGER NOT NULL DEFAULT 0,
      view_count INTEGER NOT NULL DEFAULT 0,
      is_suggestive INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS asset_to_tag (
      asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      tag_id TEXT NOT NULL REFERENCES tag(id) ON DELETE CASCADE,
      PRIMARY KEY (asset_id, tag_id)
    )
  `);

  /* FTS5 asset-name search index + sync triggers, from the same DDL constants the
     app uses (packages/db/src/fts.ts). must come after the `asset` table exists so
     the triggers bind. assets seeded by tests then flow into asset_fts via the
     INSERT trigger, exercising the real search path */
  await client.execute(ASSET_FTS_TABLE_DDL);
  for (const trigger of ASSET_FTS_TRIGGERS) {
    await client.execute(trigger);
  }

  await client.execute(`
    CREATE TABLE IF NOT EXISTS saved_asset (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      asset_id TEXT NOT NULL REFERENCES asset(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, asset_id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS vote_entry (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      game_id TEXT REFERENCES game(id) ON DELETE SET NULL,
      created_by TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      vote_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS vote (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES vote_entry(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(entry_id, user_id)
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS vote_comment (
      id TEXT PRIMARY KEY,
      entry_id TEXT NOT NULL REFERENCES vote_entry(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      upvote_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  await client.execute(`
    CREATE TABLE IF NOT EXISTS comment_upvote (
      id TEXT PRIMARY KEY,
      comment_id TEXT NOT NULL REFERENCES vote_comment(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(comment_id, user_id)
    )
  `);
}

export async function clearTestDatabase() {
  // clear all tables in reverse dependency order
  await client.execute("DELETE FROM comment_upvote");
  await client.execute("DELETE FROM vote_comment");
  await client.execute("DELETE FROM vote");
  await client.execute("DELETE FROM vote_entry");
  await client.execute("DELETE FROM saved_asset");
  await client.execute("DELETE FROM asset_to_tag");
  await client.execute("DELETE FROM asset");
  await client.execute("DELETE FROM game_to_category");
  await client.execute("DELETE FROM tag");
  await client.execute("DELETE FROM category");
  await client.execute("DELETE FROM game");
  await client.execute("DELETE FROM verification");
  await client.execute("DELETE FROM account");
  await client.execute("DELETE FROM session");
  await client.execute("DELETE FROM user");
}

export { client as testClient };

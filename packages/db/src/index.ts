import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import { getServerEnv } from "@skowt-monorepo/env/server";
import { Redacted } from "@skowt-monorepo/observability/core";
import * as schema from "./schema";
import { tracedClient } from "./traced-client";
import { ensureAssetFtsWith } from "./fts";

const env = getServerEnv();

/* wrap the auth token at the env read site (consumer-boundary pattern);
   the LibSQL client expects a raw string, so we unwrap exactly once at the handoff */
const dbAuthToken = env.DATABASE_AUTH_TOKEN ? Redacted.make(env.DATABASE_AUTH_TOKEN) : undefined;

/* wrap the LibSQL client with OTel tracing before handing it to Drizzle so
   every query becomes a visible `db.<OPERATION>` span; see traced-client.ts
   for the boundary-choice rationale (LibSQL Client > Drizzle Logger) */
const client = tracedClient(
  createClient({
    url: env.DATABASE_URL,
    authToken: dbAuthToken ? Redacted.value(dbAuthToken) : undefined,
  }),
);

export const db = drizzle({ client, schema });

export * from "./schema";

export { eq, and, or, lt, gt, gte, ne, desc, asc, like, inArray, isNull, sql } from "drizzle-orm";

export async function isDbHealthy(): Promise<boolean> {
  try {
    await client.execute("SELECT 1");
    return true;
  } catch {
    return false;
  }
}

/* provisions the FTS5 asset-name search index (virtual table + triggers) and
   backfills it if behind; bound to the shared traced client so callers (server
   boot, the db:fts script) don't need the client. idempotent and cheap in steady
   state (see packages/db/src/fts.ts). the test harness imports the raw DDL from
   the @skowt-monorepo/db/fts subpath, not from here */
export async function ensureAssetFts(): Promise<{ backfilled: number }> {
  return ensureAssetFtsWith((sql) => client.execute(sql));
}

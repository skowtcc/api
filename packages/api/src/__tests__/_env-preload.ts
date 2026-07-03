/* preloaded by bunfig.toml [test] preload list, runs before any test file's imports,
   which means before packages/db/src/index.ts (and friends) call getServerEnv() at
   module-load time; without this, env validation fails on any test run that doesn't
   have a real shell .env loaded */

/* also nukes the previous test DB file (if any) so setupTestDatabase() rebuilds the
   schema from scratch every run; that eliminates the schema-drift class of test bug
   where columns added to the drizzle schema never reach the test DB because
   `CREATE TABLE IF NOT EXISTS` is a no-op against the persisted file */

// real values via shell env or CI override; ??= only fills missing vars

import { existsSync, unlinkSync } from "node:fs";

process.env.NODE_ENV ??= "test";
process.env.BETTER_AUTH_SECRET ??= "test-secret-do-not-use-in-prod-min-1-char";
process.env.DATABASE_URL ??= "file:api-test.db";

// required-in-prod env vars stay undefined here; env schema relaxes them in test mode

/* best-effort nuke of the test DB file. only matches the local default; if CI overrides
   DATABASE_URL to something else, leave it alone */
const TEST_DB_FILE = "api-test.db";
if (process.env.DATABASE_URL === `file:${TEST_DB_FILE}` && existsSync(TEST_DB_FILE)) {
  try {
    unlinkSync(TEST_DB_FILE);
  } catch {
    /* if the file is locked / can't be removed, fall through. setupTestDatabase's
       DROP IF EXISTS pattern will still produce a clean schema */
  }
}

/* live integration test against the real antifield/discord-lookup worker, off by
   default so unit-test runs stay hermetic and CI doesn't depend on an external
   HTTP endpoint. run with:

     RUN_LIVE_TESTS=1 bun --env-file=../../apps/server/.env test src/__tests__/discord-profile.live.test.ts

   what it verifies that unit tests can't:
     1. the deployed worker is reachable at DEFAULT_DISCORD_LOOKUP_URL
     2. the JSON shape matches what mapLookupResponse expects
     3. the avatar URL satisfies the TRUSTED_AVATAR_PREFIXES allowlist
     4. end-to-end: a real lookup writes name/displayName/image + bumps profileUpdatedAt

   uses a snowflake provided by the operator. Discord can theoretically change
   values on this account, so assertions check shape, not specific strings */

import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";
import * as schema from "@skowt-monorepo/db/schema";
import { setupTestDatabase, clearTestDatabase, testDb } from "./setup";
import { refreshDiscordProfile } from "../lib/discord-profile";

const TEST_SNOWFLAKE = "492731761680187403"; // dromzeh

const runLive = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!runLive)("discord-profile (LIVE against discord-lookup.dromzeh.dev)", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  test("refreshes profile against the real worker and writes valid shape to DB", async () => {
    // seed a user with a Discord-linked account using a known snowflake
    const userId = uuidv7();
    await testDb.insert(schema.user).values({
      id: userId,
      name: `placeholder-${userId.slice(0, 8)}`,
      displayName: "Placeholder",
      email: `${userId}@example.com`,
      emailVerified: true,
      image: "https://cdn.discordapp.com/avatars/0/STALE.png",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      profileUpdatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });

    await testDb.insert(schema.account).values({
      id: uuidv7(),
      accountId: TEST_SNOWFLAKE,
      providerId: "discord",
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await refreshDiscordProfile(userId);

    expect(result.updated).toBe(true);

    /* name + displayName: just assert non-empty string. don't lock in specific
       values; the real account's username/globalName can change */
    expect(typeof result.name).toBe("string");
    expect((result.name ?? "").length).toBeGreaterThan(0);
    expect(typeof result.displayName).toBe("string");
    expect((result.displayName ?? "").length).toBeGreaterThan(0);

    // image: either null (default discord avatar) or a CDN URL with extension + size
    if (result.image !== null) {
      expect(result.image).toMatch(
        /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\/avatars\/\d+\/[a-f0-9_]+\.(png|gif)\?size=128$/,
      );
    }

    // DB row reflects what was returned, plus a fresh profileUpdatedAt
    const row = await testDb.query.user.findFirst({ where: eq(schema.user.id, userId) });
    expect(row?.name).toBe(result.name);
    expect(row?.displayName).toBe(result.displayName);
    expect(row?.image).toBe(result.image);
    expect(row?.profileUpdatedAt).toBeInstanceOf(Date);
    expect(Date.now() - (row?.profileUpdatedAt?.getTime() ?? 0)).toBeLessThan(5000);
  }, 15_000);

  test("404 path: discord-lookup gives a stable response for a definitely-not-a-user snowflake", async () => {
    /* 1 is technically a valid 64-bit unsigned int but no real user. discord
       returns either 404 (user not found) or a non-user-shape payload */
    const userId = uuidv7();
    await testDb.insert(schema.user).values({
      id: userId,
      name: `placeholder-${userId.slice(0, 8)}`,
      displayName: "Placeholder",
      email: `${userId}@example.com`,
      emailVerified: true,
      image: "https://cdn.discordapp.com/avatars/0/STALE.png",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      profileUpdatedAt: new Date(Date.now() - 8 * 24 * 60 * 60 * 1000),
    });
    await testDb.insert(schema.account).values({
      id: uuidv7(),
      accountId: "1",
      providerId: "discord",
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await refreshDiscordProfile(userId);
    /* either a deleted/missing user (updated: true, image: null) or transient (updated: false),
       both are safe; the helper never throws */
    expect([true, false]).toContain(result.updated);
  }, 15_000);
});

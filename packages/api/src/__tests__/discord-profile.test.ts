import { describe, test, expect, beforeAll, beforeEach, afterEach, mock } from "bun:test";
import { v7 as uuidv7 } from "uuid";
import { eq } from "drizzle-orm";
import * as schema from "@skowt-monorepo/db/schema";
import { setupTestDatabase, clearTestDatabase, testDb } from "./setup";
import { refreshDiscordProfile, enqueueLazyProfileRefresh } from "../lib/discord-profile";

type FetchFn = typeof globalThis.fetch;

const originalFetch: FetchFn = globalThis.fetch;

function mockFetch(impl: FetchFn): void {
  globalThis.fetch = mock(impl) as FetchFn;
}

/* default to "stale enough to refresh" (8 days ago) so cooldown doesn't block
   happy-path tests; cooldown is exercised explicitly in its own test */
const STALE_DEFAULT = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

async function seedUserWithDiscord(opts: {
  snowflake?: string | null;
  image?: string | null;
  name?: string;
  displayName?: string | null;
  profileUpdatedAt?: Date | null;
}) {
  const userId = uuidv7();
  await testDb.insert(schema.user).values({
    id: userId,
    name: opts.name ?? `old-username-${userId.slice(0, 8)}`,
    displayName: opts.displayName ?? "Old Display",
    email: `${userId}@example.com`,
    emailVerified: true,
    image: opts.image ?? "https://cdn.discordapp.com/avatars/123/old.png",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    profileUpdatedAt: opts.profileUpdatedAt === undefined ? STALE_DEFAULT : opts.profileUpdatedAt,
  });

  if (opts.snowflake) {
    await testDb.insert(schema.account).values({
      id: uuidv7(),
      accountId: opts.snowflake,
      providerId: "discord",
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  return userId;
}

async function readUser(userId: string) {
  return await testDb.query.user.findFirst({ where: eq(schema.user.id, userId) });
}

function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

describe("discord-profile", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  describe("refreshDiscordProfile", () => {
    test("happy path: writes name + displayName + image with .png and ?size=128, bumps timestamp", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "987654321" });

      mockFetch(async () =>
        jsonResponse({
          user: { username: "alice", globalName: "Alice!" },
          avatar: { url: "https://cdn.discordapp.com/avatars/987654321/abc", animated: false },
        }),
      );

      const result = await refreshDiscordProfile(userId);

      expect(result).toEqual({
        name: "alice",
        displayName: "Alice!",
        image: "https://cdn.discordapp.com/avatars/987654321/abc.png?size=128",
        updated: true,
      });

      const row = await readUser(userId);
      expect(row?.name).toBe("alice");
      expect(row?.displayName).toBe("Alice!");
      expect(row?.image).toBe("https://cdn.discordapp.com/avatars/987654321/abc.png?size=128");
      expect(row?.profileUpdatedAt).toBeInstanceOf(Date);
    });

    test("animated avatar uses .gif extension", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });

      mockFetch(async () =>
        jsonResponse({
          user: { username: "u", globalName: "u" },
          avatar: { url: "https://cdn.discordapp.com/avatars/1/a_hash", animated: true },
        }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.image).toBe("https://cdn.discordapp.com/avatars/1/a_hash.gif?size=128");
    });

    test("missing globalName falls back to username", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });

      mockFetch(async () =>
        jsonResponse({
          user: { username: "alice", globalName: null },
          avatar: { url: "https://cdn.discordapp.com/avatars/1/h", animated: false },
        }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.displayName).toBe("alice");
    });

    test("null avatar url stores image=null", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });

      mockFetch(async () =>
        jsonResponse({
          user: { username: "alice", globalName: "Alice" },
          avatar: { url: null, animated: false },
        }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.image).toBeNull();

      const row = await readUser(userId);
      expect(row?.image).toBeNull();
      expect(row?.name).toBe("alice");
    });

    test("no discord-linked account: bumps timestamp only, leaves other fields alone", async () => {
      const userId = await seedUserWithDiscord({ snowflake: null });

      let fetchCalls = 0;
      mockFetch(async () => {
        fetchCalls++;
        return jsonResponse({});
      });

      const result = await refreshDiscordProfile(userId);

      expect(result.updated).toBe(false);
      expect(fetchCalls).toBe(0);

      const row = await readUser(userId);
      expect(row?.name).toMatch(/^old-username-/);
      expect(row?.image).toBe("https://cdn.discordapp.com/avatars/123/old.png");
      expect(row?.profileUpdatedAt).toBeInstanceOf(Date);
    });

    test("5xx response: does NOT bump timestamp, returns updated=false", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });
      const before = await readUser(userId);

      mockFetch(async () => new Response("boom", { status: 500 }));

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(false);

      const after = await readUser(userId);
      expect(after?.profileUpdatedAt).toEqual(before?.profileUpdatedAt ?? null);
      expect(after?.image).toBe(before?.image);
      expect(after?.name).toBe(before?.name);
    });

    test("timeout (AbortError): does NOT bump timestamp", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });
      const before = await readUser(userId);

      mockFetch(
        async (_input, init) =>
          new Promise<Response>((_, reject) => {
            init?.signal?.addEventListener("abort", () => {
              reject(new DOMException("aborted", "AbortError"));
            });
            // never resolve - rely on the helper's AbortController to fire
          }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(false);

      const row = await readUser(userId);
      // profileUpdatedAt unchanged from seeded value; no bump on transient failure
      expect(row?.profileUpdatedAt?.getTime()).toBe(before?.profileUpdatedAt?.getTime());
    }, 10_000);

    test("404: clears image, bumps timestamp, keeps name/displayName, returns existing name/displayName", async () => {
      const userId = await seedUserWithDiscord({
        snowflake: "1",
        name: "old-known-name",
      });

      mockFetch(async () => new Response("not found", { status: 404 }));

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(true);
      expect(result.image).toBeNull();
      /* return value preserves existing identity so callers using the response
         directly don't fall back to nothing */
      expect(result.name).toBe("old-known-name");
      expect(result.displayName).toBe("Old Display");

      const row = await readUser(userId);
      expect(row?.image).toBeNull();
      expect(row?.name).toBe("old-known-name");
      expect(row?.displayName).toBe("Old Display");
      expect(row?.profileUpdatedAt).toBeInstanceOf(Date);
    });

    test("per-user cooldown: refresh within 60s returns existing data without a network call", async () => {
      const userId = await seedUserWithDiscord({
        snowflake: "1",
        name: "cooldown-name",
        profileUpdatedAt: new Date(), // refreshed right now
      });

      let fetchCalls = 0;
      mockFetch(async () => {
        fetchCalls++;
        return jsonResponse({});
      });

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(false);
      expect(result.name).toBe("cooldown-name");
      expect(fetchCalls).toBe(0);
    });

    test("non-discord-cdn avatar URLs are rejected (image=null) even if lookup returns them", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });

      mockFetch(async () =>
        jsonResponse({
          user: { username: "alice", globalName: "Alice" },
          avatar: { url: "https://evil.example/track.png", animated: false },
        }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.image).toBeNull();

      const row = await readUser(userId);
      expect(row?.image).toBeNull();
      expect(row?.name).toBe("alice"); // name/displayName still applied
    });

    test("oversize username (>100 chars) treated as malformed; no DB write", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });
      const before = await readUser(userId);

      mockFetch(async () =>
        jsonResponse({
          user: { username: "x".repeat(200), globalName: "ok" },
          avatar: { url: "https://cdn.discordapp.com/avatars/1/h", animated: false },
        }),
      );

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(false);

      const after = await readUser(userId);
      expect(after?.name).toBe(before?.name);
      expect(after?.profileUpdatedAt).toEqual(before?.profileUpdatedAt ?? null);
    });

    test("never throws; outer try/catch swallows unexpected errors", async () => {
      /* call with a non-existent user; getDiscordAccountId returns null,
         cooldown query returns nothing, helper bumps a non-existent row,
         should never throw */
      mockFetch(async () => jsonResponse({}));

      const result = await refreshDiscordProfile("nonexistent-user-id");
      expect(result).toEqual({
        name: null,
        displayName: null,
        image: null,
        updated: false,
      });
    });

    test("response missing username: treated as transient, does not bump", async () => {
      const userId = await seedUserWithDiscord({ snowflake: "1" });
      const before = await readUser(userId);

      mockFetch(async () => jsonResponse({ error: "No token available" }));

      const result = await refreshDiscordProfile(userId);
      expect(result.updated).toBe(false);

      const row = await readUser(userId);
      expect(row?.profileUpdatedAt?.getTime()).toBe(before?.profileUpdatedAt?.getTime());
    });
  });

  describe("enqueueLazyProfileRefresh", () => {
    test("triggers refresh for stale and null-timestamp users; skips fresh ones", async () => {
      const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

      const staleId = await seedUserWithDiscord({
        snowflake: "stale",
        profileUpdatedAt: eightDaysAgo,
      });
      const nullId = await seedUserWithDiscord({
        snowflake: "null",
        profileUpdatedAt: null,
      });
      const freshId = await seedUserWithDiscord({
        snowflake: "fresh",
        profileUpdatedAt: oneDayAgo,
      });

      const seen: string[] = [];
      mockFetch(async (input) => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        seen.push(url);
        return jsonResponse({
          user: { username: "x", globalName: "x" },
          avatar: { url: "https://cdn.discordapp.com/avatars/x/h", animated: false },
        });
      });

      enqueueLazyProfileRefresh([
        { id: staleId, profileUpdatedAt: eightDaysAgo },
        { id: nullId, profileUpdatedAt: null },
        { id: freshId, profileUpdatedAt: oneDayAgo },
      ]);

      // give fire-and-forget promises a tick to settle
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(seen).toHaveLength(2);
      expect(seen.some((u) => u.endsWith("/user/stale"))).toBe(true);
      expect(seen.some((u) => u.endsWith("/user/null"))).toBe(true);
      expect(seen.some((u) => u.endsWith("/user/fresh"))).toBe(false);
    });

    test("empty array: no calls, no throw", async () => {
      let fetchCalls = 0;
      mockFetch(async () => {
        fetchCalls++;
        return jsonResponse({});
      });

      expect(() => enqueueLazyProfileRefresh([])).not.toThrow();
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(fetchCalls).toBe(0);
    });

    test("returns synchronously without awaiting", async () => {
      const userId = await seedUserWithDiscord({
        snowflake: "1",
        profileUpdatedAt: null,
      });

      let fetchResolved = false;
      mockFetch(async () => {
        await new Promise((resolve) => setTimeout(resolve, 200));
        fetchResolved = true;
        return jsonResponse({
          user: { username: "u", globalName: "u" },
          avatar: { url: "https://cdn.discordapp.com/avatars/1/h", animated: false },
        });
      });

      const start = Date.now();
      enqueueLazyProfileRefresh([{ id: userId, profileUpdatedAt: null }]);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(50);
      expect(fetchResolved).toBe(false);
    });
  });
});

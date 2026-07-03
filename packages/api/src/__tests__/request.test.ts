import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestGame,
  seedTestRequest,
  seedTestRequestVote,
  createTestContext,
  createAuthenticatedContext,
  testDb,
} from "./helpers";
import * as schema from "@skowt-monorepo/db/schema";
import { eq } from "drizzle-orm";

describe("Request Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe("list", () => {
    test("returns empty array when no entries exist", async () => {
      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({});

      expect(result.items).toEqual([]);
      expect(result.nextCursor).toBeNull();
    });

    test("returns all entries by default", async () => {
      const user = await seedTestUser();
      await seedTestRequest(user.id, { title: "Open Entry", status: "open" });
      await seedTestRequest(user.id, { title: "Completed Entry", status: "completed" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({});

      expect(result.items).toHaveLength(2);
      expect(result.items.map((item) => item.title)).toContain("Open Entry");
      expect(result.items.map((item) => item.title)).toContain("Completed Entry");
    });

    test("filters by type", async () => {
      const user = await seedTestUser();
      await seedTestRequest(user.id, { title: "Game Entry", type: "game" });
      await seedTestRequest(user.id, { title: "Other Entry", type: "other" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({ type: "game" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Game Entry");
    });

    test("filters by status", async () => {
      const user = await seedTestUser();
      await seedTestRequest(user.id, { title: "Open", status: "open" });
      await seedTestRequest(user.id, { title: "Completed", status: "completed" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({ status: "completed" });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].title).toBe("Completed");
    });

    test("orders by vote count then created date", async () => {
      const user = await seedTestUser();
      await seedTestRequest(user.id, { title: "Low Votes", voteCount: 1 });
      await seedTestRequest(user.id, { title: "High Votes", voteCount: 10 });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({});

      expect(result.items[0].title).toBe("High Votes");
      expect(result.items[1].title).toBe("Low Votes");
    });

    test("supports pagination", async () => {
      const user = await seedTestUser();
      for (let i = 0; i < 5; i++) {
        await seedTestRequest(user.id, { title: `Entry ${i}` });
      }

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.list({ limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.nextCursor).not.toBeNull();
    });
  });

  describe("getById", () => {
    test("returns entry by id", async () => {
      const user = await seedTestUser();
      const entry = await seedTestRequest(user.id, { title: "Test Entry" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.getById({ id: entry.id });

      expect(result.id).toBe(entry.id);
      expect(result.title).toBe("Test Entry");
      expect(result.hasVoted).toBe(false);
    });

    test("throws NOT_FOUND for non-existent entry", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.getById({ id: "non-existent" })).rejects.toThrow(
        "entry not found",
      );
    });

    test("returns hasVoted true for authenticated user who voted", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { title: "Test Entry" });
      await seedTestRequestVote(entry.id, user.id);

      const caller = createTestCaller(context);
      const result = await caller.request.getById({ id: entry.id });

      expect(result.hasVoted).toBe(true);
    });
  });

  describe("toggle", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.toggle({ entryId: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("adds vote when not already voted", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { voteCount: 0 });

      const caller = createTestCaller(context);
      const result = await caller.request.toggle({ entryId: entry.id });

      expect(result.voted).toBe(true);

      const updatedEntry = await testDb.query.request.findFirst({
        where: eq(schema.request.id, entry.id),
      });
      expect(updatedEntry?.voteCount).toBe(1);
    });

    test("removes vote when already voted", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { voteCount: 1 });
      await seedTestRequestVote(entry.id, user.id);

      const caller = createTestCaller(context);
      const result = await caller.request.toggle({ entryId: entry.id });

      expect(result.voted).toBe(false);

      const updatedEntry = await testDb.query.request.findFirst({
        where: eq(schema.request.id, entry.id),
      });
      expect(updatedEntry?.voteCount).toBe(0);
    });

    test("throws NOT_FOUND for non-existent entry", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.request.toggle({ entryId: "non-existent" })).rejects.toThrow(
        "entry not found",
      );
    });

    test("throws BAD_REQUEST for closed entries", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { status: "completed" });

      const caller = createTestCaller(context);

      await expect(caller.request.toggle({ entryId: entry.id })).rejects.toThrow(
        "cannot vote on closed entries",
      );
    });
  });

  describe("hasVoted", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.hasVoted({ entryId: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("returns false when not voted", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);

      const caller = createTestCaller(context);
      const result = await caller.request.hasVoted({ entryId: entry.id });

      expect(result.voted).toBe(false);
    });

    test("returns true when voted", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);
      await seedTestRequestVote(entry.id, user.id);

      const caller = createTestCaller(context);
      const result = await caller.request.hasVoted({ entryId: entry.id });

      expect(result.voted).toBe(true);
    });
  });

  describe("create", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.create({ type: "game", title: "Test" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("requires contributor role", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.request.create({ type: "game", title: "Test" })).rejects.toThrow(
        "Contributor access required",
      );
    });

    test("contributor can create entry", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.request.create({
        type: "game",
        title: "New Game Request",
        description: "Please add this game",
      });

      expect(result.title).toBe("New Game Request");
      expect(result.type).toBe("game");
      expect(result.createdBy).toBe(user.id);
    });

    test("staff can create entry", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.request.create({
        type: "other",
        title: "Feature Request",
      });

      expect(result.title).toBe("Feature Request");
    });

    test("developer can create entry", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const caller = createTestCaller(context);
      const result = await caller.request.create({
        type: "game",
        title: "Admin Entry",
      });

      expect(result.title).toBe("Admin Entry");
    });

    test("requires gameId for game_category type", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(
        caller.request.create({ type: "game_category", title: "Category Request" }),
      ).rejects.toThrow("gameId is required for game_category entries");
    });

    test("game_category entry with gameId succeeds", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const game = await seedTestGame();

      const caller = createTestCaller(context);
      const result = await caller.request.create({
        type: "game_category",
        title: "New Category",
        gameId: game.id,
      });

      expect(result.type).toBe("game_category");
      expect(result.gameId).toBe(game.id);
    });
  });

  describe("update", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.update({ id: "some-id", title: "Updated" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("requires contributor role", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id);

      const caller = createTestCaller(context);

      await expect(caller.request.update({ id: entry.id, title: "Updated" })).rejects.toThrow(
        "Contributor access required",
      );
    });

    test("contributor can update own entry", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id, { title: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.update({ id: entry.id, title: "Updated" });

      expect(result.success).toBe(true);

      const updatedEntry = await testDb.query.request.findFirst({
        where: eq(schema.request.id, entry.id),
      });
      expect(updatedEntry?.title).toBe("Updated");
    });

    test("contributor cannot update other's entry", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other", role: "contributor" });
      const entry = await seedTestRequest(otherUser.id, { title: "Other's Entry" });

      const caller = createTestCaller(context);

      await expect(caller.request.update({ id: entry.id, title: "Hijacked" })).rejects.toThrow(
        "you can only edit your own entries",
      );
    });

    test("staff can update any entry", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id, { title: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.update({ id: entry.id, title: "Mod Updated" });

      expect(result.success).toBe(true);
    });

    test("developer can update any entry", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id, { title: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.update({ id: entry.id, title: "Admin Updated" });

      expect(result.success).toBe(true);
    });
  });

  describe("setStatus", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(
        caller.request.setStatus({ id: "some-id", status: "completed" }),
      ).rejects.toThrow("Authentication required");
    });

    test("requires staff role", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id);

      const caller = createTestCaller(context);

      await expect(caller.request.setStatus({ id: entry.id, status: "completed" })).rejects.toThrow(
        "Staff access required",
      );
    });

    test("staff can set status", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { status: "open" });

      const caller = createTestCaller(context);
      const result = await caller.request.setStatus({ id: entry.id, status: "completed" });

      expect(result.success).toBe(true);

      const updatedEntry = await testDb.query.request.findFirst({
        where: eq(schema.request.id, entry.id),
      });
      expect(updatedEntry?.status).toBe("completed");
    });

    test("developer can set status", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id, { status: "open" });

      const caller = createTestCaller(context);
      const result = await caller.request.setStatus({ id: entry.id, status: "rejected" });

      expect(result.success).toBe(true);
    });
  });

  describe("delete", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.delete({ id: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("contributor can only delete own entries", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);

      const caller = createTestCaller(context);

      await expect(caller.request.delete({ id: entry.id })).rejects.toThrow(
        "you can only delete your own entries",
      );
    });

    test("staff can delete entry", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);

      const caller = createTestCaller(context);
      const result = await caller.request.delete({ id: entry.id });

      expect(result.success).toBe(true);

      const deletedEntry = await testDb.query.request.findFirst({
        where: eq(schema.request.id, entry.id),
      });
      expect(deletedEntry).toBeUndefined();
    });
  });
});

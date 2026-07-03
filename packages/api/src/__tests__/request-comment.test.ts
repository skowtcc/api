import { describe, test, expect, beforeAll, beforeEach } from "bun:test";
import { createTestCaller } from "./test-routers";
import { setupTestDatabase, clearTestDatabase } from "./setup";
import {
  seedTestUser,
  seedTestRequest,
  seedTestRequestComment,
  createTestContext,
  createAuthenticatedContext,
  testDb,
} from "./helpers";
import * as schema from "@skowt-monorepo/db/schema";
import { eq } from "drizzle-orm";

describe("Request Comment Router", () => {
  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await clearTestDatabase();
  });

  describe("listComments", () => {
    test("returns empty array when no comments exist", async () => {
      const user = await seedTestUser();
      const entry = await seedTestRequest(user.id);

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.listComments({ entryId: entry.id });

      expect(result.items).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.nextOffset).toBeNull();
    });

    test("returns comments for entry", async () => {
      const user = await seedTestUser();
      const entry = await seedTestRequest(user.id);
      await seedTestRequestComment(entry.id, user.id, { content: "Test comment" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.listComments({ entryId: entry.id });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe("Test comment");
      expect(result.items[0].user.id).toBe(user.id);
    });

    test("does not return comments from other entries", async () => {
      const user = await seedTestUser();
      const entry1 = await seedTestRequest(user.id, { title: "Entry 1" });
      const entry2 = await seedTestRequest(user.id, { title: "Entry 2" });

      await seedTestRequestComment(entry1.id, user.id, { content: "Comment on entry 1" });
      await seedTestRequestComment(entry2.id, user.id, { content: "Comment on entry 2" });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.listComments({ entryId: entry1.id });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].content).toBe("Comment on entry 1");
    });

    test("returns comments in descending order by created date", async () => {
      const user = await seedTestUser();
      const entry = await seedTestRequest(user.id);

      await seedTestRequestComment(entry.id, user.id, {
        content: "Older",
        createdAt: new Date(Date.now() - 10000),
      });
      await seedTestRequestComment(entry.id, user.id, {
        content: "Newer",
        createdAt: new Date(),
      });

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.listComments({ entryId: entry.id });

      expect(result.items[0].content).toBe("Newer");
      expect(result.items[1].content).toBe("Older");
    });

    test("supports pagination", async () => {
      const user = await seedTestUser();
      const entry = await seedTestRequest(user.id);

      for (let i = 0; i < 5; i++) {
        await seedTestRequestComment(entry.id, user.id, { content: `Comment ${i}` });
      }

      const caller = createTestCaller(createTestContext());
      const result = await caller.request.listComments({ entryId: entry.id, limit: 3 });

      expect(result.items).toHaveLength(3);
      expect(result.hasMore).toBe(true);
      expect(result.nextOffset).toBe(3);
    });
  });

  describe("addComment", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(
        caller.request.addComment({ entryId: "some-id", content: "Test" }),
      ).rejects.toThrow("Authentication required");
    });

    test("any authenticated user can add comment", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);

      const caller = createTestCaller(context);
      const result = await caller.request.addComment({
        entryId: entry.id,
        content: "My comment",
      });

      expect(result.content).toBe("My comment");
      expect(result.userId).toBe(user.id);
      expect(result.entryId).toBe(entry.id);
    });

    test("throws NOT_FOUND for non-existent entry", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(
        caller.request.addComment({ entryId: "non-existent", content: "Test" }),
      ).rejects.toThrow("entry not found");
    });

    test("validates content length", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const creator = await seedTestUser({ name: "Creator" });
      const entry = await seedTestRequest(creator.id);

      const caller = createTestCaller(context);

      await expect(caller.request.addComment({ entryId: entry.id, content: "" })).rejects.toThrow();
    });
  });

  describe("updateComment", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(
        caller.request.updateComment({ id: "some-id", content: "Updated" }),
      ).rejects.toThrow("Authentication required");
    });

    test("user can update own comment", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id);
      const comment = await seedTestRequestComment(entry.id, user.id, { content: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.updateComment({
        id: comment.id,
        content: "Updated content",
      });

      expect(result.success).toBe(true);

      const updatedComment = await testDb.query.requestComment.findFirst({
        where: eq(schema.requestComment.id, comment.id),
      });
      expect(updatedComment?.content).toBe("Updated content");
    });

    test("user cannot update other's comment", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, {
        content: "Other's comment",
      });

      const caller = createTestCaller(context);

      await expect(
        caller.request.updateComment({ id: comment.id, content: "Hijacked" }),
      ).rejects.toThrow("you can only edit your own comments");
    });

    test("staff can update any comment", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, { content: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.updateComment({
        id: comment.id,
        content: "Mod updated",
      });

      expect(result.success).toBe(true);
    });

    test("developer can update any comment", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, { content: "Original" });

      const caller = createTestCaller(context);
      const result = await caller.request.updateComment({
        id: comment.id,
        content: "Admin updated",
      });

      expect(result.success).toBe(true);
    });

    test("throws NOT_FOUND for non-existent comment", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(
        caller.request.updateComment({ id: "non-existent", content: "Test" }),
      ).rejects.toThrow("comment not found");
    });

    test("updates updatedAt timestamp", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id);
      const originalDate = new Date(Date.now() - 10000);
      const comment = await seedTestRequestComment(entry.id, user.id, {
        content: "Original",
        updatedAt: originalDate,
      });

      const caller = createTestCaller(context);
      await caller.request.updateComment({ id: comment.id, content: "Updated" });

      const updatedComment = await testDb.query.requestComment.findFirst({
        where: eq(schema.requestComment.id, comment.id),
      });

      expect(updatedComment?.updatedAt?.getTime()).toBeGreaterThan(originalDate.getTime());
    });
  });

  describe("deleteComment", () => {
    test("requires authentication", async () => {
      const caller = createTestCaller(createTestContext());

      await expect(caller.request.deleteComment({ id: "some-id" })).rejects.toThrow(
        "Authentication required",
      );
    });

    test("user can delete own comment", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const entry = await seedTestRequest(user.id);
      const comment = await seedTestRequestComment(entry.id, user.id, { content: "My comment" });

      const caller = createTestCaller(context);
      const result = await caller.request.deleteComment({ id: comment.id });

      expect(result.success).toBe(true);

      const deletedComment = await testDb.query.requestComment.findFirst({
        where: eq(schema.requestComment.id, comment.id),
      });
      expect(deletedComment).toBeUndefined();
    });

    test("user cannot delete other's comment", async () => {
      const { context, user } = createAuthenticatedContext("user");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, {
        content: "Other's comment",
      });

      const caller = createTestCaller(context);

      await expect(caller.request.deleteComment({ id: comment.id })).rejects.toThrow(
        "you can only delete your own comments",
      );
    });

    test("staff can delete any comment", async () => {
      const { context, user } = createAuthenticatedContext("staff");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, {
        content: "Other's comment",
      });

      const caller = createTestCaller(context);
      const result = await caller.request.deleteComment({ id: comment.id });

      expect(result.success).toBe(true);
    });

    test("developer can delete any comment", async () => {
      const { context, user } = createAuthenticatedContext("developer");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, {
        content: "Other's comment",
      });

      const caller = createTestCaller(context);
      const result = await caller.request.deleteComment({ id: comment.id });

      expect(result.success).toBe(true);
    });

    test("throws NOT_FOUND for non-existent comment", async () => {
      const { context, user } = createAuthenticatedContext();
      await seedTestUser(user);

      const caller = createTestCaller(context);

      await expect(caller.request.deleteComment({ id: "non-existent" })).rejects.toThrow(
        "comment not found",
      );
    });

    test("contributor cannot delete other's comment", async () => {
      const { context, user } = createAuthenticatedContext("contributor");
      await seedTestUser(user);

      const otherUser = await seedTestUser({ name: "Other" });
      const entry = await seedTestRequest(otherUser.id);
      const comment = await seedTestRequestComment(entry.id, otherUser.id, {
        content: "Other's comment",
      });

      const caller = createTestCaller(context);

      await expect(caller.request.deleteComment({ id: comment.id })).rejects.toThrow(
        "you can only delete your own comments",
      );
    });
  });
});

import type { Session } from "@skowt-monorepo/auth";
import type { UserRole } from "@skowt-monorepo/db/schema/auth";
import {
  testDb,
  createTestUser,
  createTestGame,
  createTestCategory,
  createTestTag,
  createTestAsset,
  createTestRequest,
  createTestRequestVote,
  createTestRequestComment,
  createTestSavedAsset,
  createMockSession,
} from "./setup";
import * as schema from "@skowt-monorepo/db/schema";

export {
  testDb,
  createTestUser,
  createTestGame,
  createTestCategory,
  createTestTag,
  createTestAsset,
  createTestRequest,
  createTestRequestVote,
  createTestRequestComment,
  createTestSavedAsset,
  createMockSession,
};

type TestContext = {
  session: Session | null;
};

export function createTestContext(session: Session | null = null): TestContext {
  return { session };
}

export function createAuthenticatedContext(role: UserRole = "user"): {
  context: TestContext;
  user: typeof schema.user.$inferInsert;
} {
  const user = createTestUser({ role });
  const session = createMockSession(user);
  return {
    context: { session },
    user,
  };
}

export async function seedTestUser(overrides: Partial<typeof schema.user.$inferInsert> = {}) {
  const userData = createTestUser(overrides);
  await testDb.insert(schema.user).values(userData);
  return userData;
}

export async function seedTestGame(overrides: Partial<typeof schema.game.$inferInsert> = {}) {
  const gameData = createTestGame(overrides);
  await testDb.insert(schema.game).values(gameData);
  return gameData;
}

export async function seedTestCategory(
  overrides: Partial<typeof schema.category.$inferInsert> = {},
) {
  const categoryData = createTestCategory(overrides);
  await testDb.insert(schema.category).values(categoryData);
  return categoryData;
}

export async function seedTestTag(overrides: Partial<typeof schema.tag.$inferInsert> = {}) {
  const tagData = createTestTag(overrides);
  await testDb.insert(schema.tag).values(tagData);
  return tagData;
}

export async function seedTestAsset(
  gameId: string,
  categoryId: string,
  uploadedBy: string,
  overrides: Partial<typeof schema.asset.$inferInsert> = {},
) {
  const assetData = createTestAsset(gameId, categoryId, uploadedBy, overrides);
  await testDb.insert(schema.asset).values(assetData);
  return assetData;
}

export async function seedTestRequest(
  createdBy: string,
  overrides: Partial<typeof schema.request.$inferInsert> = {},
) {
  const entryData = createTestRequest(createdBy, overrides);
  await testDb.insert(schema.request).values(entryData);
  return entryData;
}

export async function seedTestRequestVote(
  entryId: string,
  userId: string,
  overrides: Partial<typeof schema.requestVote.$inferInsert> = {},
) {
  const voteData = createTestRequestVote(entryId, userId, overrides);
  await testDb.insert(schema.requestVote).values(voteData);
  return voteData;
}

export async function seedTestRequestComment(
  entryId: string,
  userId: string,
  overrides: Partial<typeof schema.requestComment.$inferInsert> = {},
) {
  const commentData = createTestRequestComment(entryId, userId, overrides);
  await testDb.insert(schema.requestComment).values(commentData);
  return commentData;
}

export async function seedTestSavedAsset(
  userId: string,
  assetId: string,
  overrides: Partial<typeof schema.savedAsset.$inferInsert> = {},
) {
  const savedData = createTestSavedAsset(userId, assetId, overrides);
  await testDb.insert(schema.savedAsset).values(savedData);
  return savedData;
}

export async function linkAssetTag(assetId: string, tagId: string) {
  await testDb.insert(schema.assetToTag).values({ assetId, tagId });
}

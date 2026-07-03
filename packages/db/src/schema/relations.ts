import { relations } from "drizzle-orm";
import { user, session, account } from "./auth";
import { game } from "./game";
import { category } from "./category";
import { gameToCategory } from "./game-to-category";
import { asset } from "./asset";
import { tag } from "./tag";
import { assetToTag } from "./asset-to-tag";
import { savedAsset } from "./saved-asset";
import { request } from "./request";
import { requestVote } from "./request-vote";
import { requestComment, commentUpvote } from "./request-comment";

// auth relations
export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  uploadedAssets: many(asset),
  savedAssets: many(savedAsset),
  requests: many(request),
  requestVotes: many(requestVote),
  requestComments: many(requestComment),
  commentUpvotes: many(commentUpvote),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

// game relations
export const gameRelations = relations(game, ({ many }) => ({
  assets: many(asset),
  gameToCategories: many(gameToCategory),
  requests: many(request),
}));

// category relations
export const categoryRelations = relations(category, ({ many }) => ({
  assets: many(asset),
  gameToCategories: many(gameToCategory),
}));

// game to category junction relations
export const gameToCategoryRelations = relations(gameToCategory, ({ one }) => ({
  game: one(game, {
    fields: [gameToCategory.gameId],
    references: [game.id],
  }),
  category: one(category, {
    fields: [gameToCategory.categoryId],
    references: [category.id],
  }),
}));

// asset relations
export const assetRelations = relations(asset, ({ one, many }) => ({
  game: one(game, {
    fields: [asset.gameId],
    references: [game.id],
  }),
  category: one(category, {
    fields: [asset.categoryId],
    references: [category.id],
  }),
  uploader: one(user, {
    fields: [asset.uploadedBy],
    references: [user.id],
  }),
  assetToTags: many(assetToTag),
  savedByUsers: many(savedAsset),
}));

// tag relations
export const tagRelations = relations(tag, ({ many }) => ({
  assetToTags: many(assetToTag),
}));

// asset to tag junction relations
export const assetToTagRelations = relations(assetToTag, ({ one }) => ({
  asset: one(asset, {
    fields: [assetToTag.assetId],
    references: [asset.id],
  }),
  tag: one(tag, {
    fields: [assetToTag.tagId],
    references: [tag.id],
  }),
}));

// saved asset relations
export const savedAssetRelations = relations(savedAsset, ({ one }) => ({
  user: one(user, {
    fields: [savedAsset.userId],
    references: [user.id],
  }),
  asset: one(asset, {
    fields: [savedAsset.assetId],
    references: [asset.id],
  }),
}));

// request relations
export const requestRelations = relations(request, ({ one, many }) => ({
  creator: one(user, {
    fields: [request.createdBy],
    references: [user.id],
  }),
  game: one(game, {
    fields: [request.gameId],
    references: [game.id],
  }),
  votes: many(requestVote),
  comments: many(requestComment),
}));

// request vote relations
export const requestVoteRelations = relations(requestVote, ({ one }) => ({
  entry: one(request, {
    fields: [requestVote.entryId],
    references: [request.id],
  }),
  user: one(user, {
    fields: [requestVote.userId],
    references: [user.id],
  }),
}));

// request comment relations
export const requestCommentRelations = relations(requestComment, ({ one, many }) => ({
  entry: one(request, {
    fields: [requestComment.entryId],
    references: [request.id],
  }),
  user: one(user, {
    fields: [requestComment.userId],
    references: [user.id],
  }),
  upvotes: many(commentUpvote),
}));

// comment upvote relations
export const commentUpvoteRelations = relations(commentUpvote, ({ one }) => ({
  comment: one(requestComment, {
    fields: [commentUpvote.commentId],
    references: [requestComment.id],
  }),
  user: one(user, {
    fields: [commentUpvote.userId],
    references: [user.id],
  }),
}));

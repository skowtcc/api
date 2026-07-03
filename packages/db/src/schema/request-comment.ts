import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { request } from "./request";

export const requestComment = sqliteTable(
  "vote_comment",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    entryId: text("entry_id")
      .notNull()
      .references(() => request.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    content: text("content").notNull(),
    upvoteCount: integer("upvote_count").notNull().default(0),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("vote_comment_entry_id_idx").on(table.entryId),
    index("vote_comment_user_id_idx").on(table.userId),
    index("vote_comment_created_at_idx").on(table.createdAt),
    index("vote_comment_upvote_count_idx").on(table.upvoteCount),
  ],
);

export const commentUpvote = sqliteTable(
  "comment_upvote",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    commentId: text("comment_id")
      .notNull()
      .references(() => requestComment.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("comment_upvote_comment_user_unique").on(table.commentId, table.userId),
    index("comment_upvote_comment_id_idx").on(table.commentId),
    index("comment_upvote_user_id_idx").on(table.userId),
  ],
);

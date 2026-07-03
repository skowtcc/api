import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { request } from "./request";

export const requestVote = sqliteTable(
  "vote",
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
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("vote_entry_user_unique").on(table.entryId, table.userId),
    index("vote_entry_id_idx").on(table.entryId),
    index("vote_user_id_idx").on(table.userId),
  ],
);

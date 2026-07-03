import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { game } from "./game";

export const requestTypes = ["game", "game_category", "other"] as const;

export const requestStatuses = ["open", "in_progress", "completed", "rejected"] as const;

export const request = sqliteTable(
  "vote_entry",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    type: text("type", { enum: requestTypes }).notNull(),
    title: text("title").notNull(),
    description: text("description"),
    status: text("status", { enum: requestStatuses }).notNull().default("open"),
    gameId: text("game_id").references(() => game.id, { onDelete: "set null" }), // for game_category type
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    voteCount: integer("vote_count").notNull().default(0), // denormalised for performance
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("vote_entry_type_idx").on(table.type),
    index("vote_entry_status_idx").on(table.status),
    index("vote_entry_created_by_idx").on(table.createdBy),
    index("vote_entry_vote_count_idx").on(table.voteCount),
    index("vote_entry_created_at_idx").on(table.createdAt),
    index("vote_entry_status_vote_count_idx").on(table.status, table.voteCount),
  ],
);

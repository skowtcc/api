import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { game } from "./game";
import { category } from "./category";

export const gameToCategory = sqliteTable(
  "game_to_category",
  {
    gameId: text("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.gameId, table.categoryId] }),
    index("game_to_category_game_idx").on(table.gameId),
    index("game_to_category_category_idx").on(table.categoryId),
  ],
);

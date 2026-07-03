import { sqliteTable, text, integer, index, uniqueIndex } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { asset } from "./asset";

export const savedAsset = sqliteTable(
  "saved_asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    uniqueIndex("saved_asset_user_asset_idx").on(table.userId, table.assetId),
    index("saved_asset_user_idx").on(table.userId),
    index("saved_asset_asset_idx").on(table.assetId),
    index("saved_asset_created_at_idx").on(table.createdAt),
  ],
);

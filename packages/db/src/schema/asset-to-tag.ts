import { sqliteTable, text, primaryKey, index } from "drizzle-orm/sqlite-core";
import { asset } from "./asset";
import { tag } from "./tag";

export const assetToTag = sqliteTable(
  "asset_to_tag",
  {
    assetId: text("asset_id")
      .notNull()
      .references(() => asset.id, { onDelete: "cascade" }),
    tagId: text("tag_id")
      .notNull()
      .references(() => tag.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.assetId, table.tagId] }),
    index("asset_to_tag_asset_idx").on(table.assetId),
    index("asset_to_tag_tag_idx").on(table.tagId),
  ],
);

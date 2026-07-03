import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import { user } from "./auth";
import { game } from "./game";
import { category } from "./category";

/**
 * Per-asset media metadata, discriminated by media kind so new types can be
 * added without another migration. `image` dimensions are captured on upload
 * (commitUpload) and backfilled for older assets; absent until then.
 */
export type AssetMetadata = {
  image?: { width: number; height: number };
};

export const asset = sqliteTable(
  "asset",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    gameId: text("game_id")
      .notNull()
      .references(() => game.id, { onDelete: "cascade" }),
    categoryId: text("category_id")
      .notNull()
      .references(() => category.id, { onDelete: "cascade" }),
    uploadedBy: text("uploaded_by").references(() => user.id),
    status: text("status", { enum: ["pending", "approved", "denied"] })
      .notNull()
      .default("pending"),
    hash: text("hash").notNull(),
    size: integer("size").notNull(),
    extension: text("extension").notNull(),
    downloadCount: integer("download_count").notNull().default(0),
    viewCount: integer("view_count").notNull().default(0),
    isSuggestive: integer("is_suggestive", { mode: "boolean" }).notNull().default(false),
    /* nullable JSON; populated on upload + backfill, reused later when image
       resizing is brought in-house (a decoder yields dimensions for free) */
    metadata: text("metadata", { mode: "json" }).$type<AssetMetadata>(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (table) => [
    index("asset_game_idx").on(table.gameId),
    index("asset_category_idx").on(table.categoryId),
    index("asset_name_idx").on(table.name),
    index("asset_status_idx").on(table.status),
    index("asset_uploaded_by_idx").on(table.uploadedBy),
    index("asset_created_at_idx").on(table.createdAt),
    index("asset_game_status_idx").on(table.gameId, table.status),
    index("asset_category_status_idx").on(table.categoryId, table.status),
    index("asset_game_category_status_idx").on(table.gameId, table.categoryId, table.status),
    index("asset_status_created_idx").on(table.status, table.createdAt),
    /* keyset sort by downloads/views: (status eq-filter, sort col, id tiebreaker).
       id is included because these counts have many ties (lots of low/zero
       values), so the keyset's id boundary must be seekable within a count bucket */
    index("asset_status_download_idx").on(table.status, table.downloadCount, table.id),
    index("asset_status_view_idx").on(table.status, table.viewCount, table.id),
    /* keyset sort by name is case-insensitive (asset.query orders/compares with
       COLLATE NOCASE), which a BINARY name index can't serve; applied to prod
       via hand-authored migration 0013 */
    index("asset_status_name_nocase_idx").on(
      table.status,
      sql`${table.name} COLLATE NOCASE`,
      table.id,
    ),
  ],
);

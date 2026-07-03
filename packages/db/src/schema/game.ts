import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const game = sqliteTable(
  "game",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    lastUpdated: integer("last_updated", { mode: "timestamp" }).notNull(),
    assetCount: integer("asset_count").notNull().default(0),
    /* attribution/distribution slot: the rights holder shown in
       "© {publisher}" credits, a one-line usage summary for the asset page,
       and the publisher's official fan-content/derivative-works policy URL.
       all nullable - games without researched terms fall back to generic copy */
    publisher: text("publisher"),
    usageTerms: text("usage_terms"),
    termsUrl: text("terms_url"),
  },
  (table) => [index("game_slug_idx").on(table.slug), index("game_name_idx").on(table.name)],
);

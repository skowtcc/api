import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const tag = sqliteTable(
  "tag",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
  },
  (table) => [index("tag_slug_idx").on(table.slug), index("tag_name_idx").on(table.name)],
);

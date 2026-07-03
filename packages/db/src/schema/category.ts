import { sqliteTable, text, index } from "drizzle-orm/sqlite-core";
import { v7 as uuidv7 } from "uuid";

export const category = sqliteTable(
  "category",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
  },
  (table) => [index("category_slug_idx").on(table.slug), index("category_name_idx").on(table.name)],
);

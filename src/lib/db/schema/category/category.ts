import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { asset } from '../asset/asset'
import { categoryToGame } from './categoryToGame'

export const category = sqliteTable('category', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
})

export const categorySlugIdx = index('category_slug_idx').on(category.slug)
export const categoryNameIdx = index('category_name_idx').on(category.name)

export const categoryRelations = relations(category, ({ many }) => ({
    assets: many(asset),
    gameLinks: many(categoryToGame),
}))

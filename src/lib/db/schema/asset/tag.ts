import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { assetToTag } from './assetToTag'

export const tag = sqliteTable('tag', {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull().unique(),
    color: text('color'),
})

export const tagSlugIdx = index('tag_slug_idx').on(tag.slug)
export const tagNameIdx = index('tag_name_idx').on(tag.name)

export const tagRelations = relations(tag, ({ many }) => ({
    assetLinks: many(assetToTag),
}))

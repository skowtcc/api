import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { asset } from './asset'
import { tag } from './tag'

export const assetToTag = sqliteTable('asset_to_tag', {
    id: text('id').primaryKey(),
    assetId: text('asset_id').notNull(),
    tagId: text('tag_id').notNull(),
})

export const assetToTagAssetIdx = index('att_asset_idx').on(assetToTag.assetId)
export const assetToTagTagIdx = index('att_tag_idx').on(assetToTag.tagId)

export const assetToTagRelations = relations(assetToTag, ({ one }) => ({
    asset: one(asset, {
        fields: [assetToTag.assetId],
        references: [asset.id],
    }),
    tag: one(tag, {
        fields: [assetToTag.tagId],
        references: [tag.id],
    }),
}))

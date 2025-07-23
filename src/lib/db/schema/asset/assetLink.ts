import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { asset } from './asset'
import { user } from '../user/user'
import { v7 as uuidv7 } from 'uuid'
import { relations } from 'drizzle-orm'

export const assetLink = sqliteTable('asset_link', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    assetId: text('asset_id')
        .notNull()
        .references(() => asset.id),
    toAssetId: text('to_asset_id')
        .notNull()
        .references(() => asset.id),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
})

export const assetLinkRelations = relations(assetLink, ({ one }) => ({
    assetLink: one(asset, {
        fields: [assetLink.assetId],
        references: [asset.id],
        relationName: 'assetLink',
    }),
    toAssetLink: one(asset, {
        fields: [assetLink.toAssetId],
        references: [asset.id],
        relationName: 'toAssetLink',
    }),
}))

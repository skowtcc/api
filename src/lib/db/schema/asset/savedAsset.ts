import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { user } from '../user/user'
import { asset } from './asset'
import { v7 as uuidv7 } from 'uuid'

export const savedAsset = sqliteTable('saved_asset', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    assetId: text('asset_id')
        .notNull()
        .references(() => asset.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const savedAssetUserIdx = index('saved_asset_user_idx').on(savedAsset.userId)
export const savedAssetAssetIdx = index('saved_asset_asset_idx').on(savedAsset.assetId)
export const savedAssetUserAssetIdx = index('saved_asset_user_asset_idx').on(savedAsset.userId, savedAsset.assetId)

export const savedAssetRelations = relations(savedAsset, ({ one }) => ({
    user: one(user, {
        fields: [savedAsset.userId],
        references: [user.id],
    }),
    asset: one(asset, {
        fields: [savedAsset.assetId],
        references: [asset.id],
    }),
}))

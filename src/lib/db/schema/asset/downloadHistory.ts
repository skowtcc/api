import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '../user/user'
import { asset } from './asset'
import { v7 as uuidv7 } from 'uuid'
import { relations } from 'drizzle-orm'

export const downloadHistory = sqliteTable('download_history', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    userId: text('user_id')
        .notNull()
        .references(() => user.id),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const downloadHistoryToAsset = sqliteTable('download_history_to_asset', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    downloadHistoryId: text('download_history_id')
        .notNull()
        .references(() => downloadHistory.id),
    assetId: text('asset_id')
        .notNull()
        .references(() => asset.id),
})

export const downloadHistoryRelations = relations(downloadHistory, ({ one }) => ({
    user: one(user, {
        fields: [downloadHistory.userId],
        references: [user.id],
    }),
}))

export const downloadHistoryToAssetRelations = relations(downloadHistoryToAsset, ({ one }) => ({
    downloadHistory: one(downloadHistory, {
        fields: [downloadHistoryToAsset.downloadHistoryId],
        references: [downloadHistory.id],
    }),
    asset: one(asset, {
        fields: [downloadHistoryToAsset.assetId],
        references: [asset.id],
    }),
}))

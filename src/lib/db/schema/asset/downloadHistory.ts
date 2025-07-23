import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core'
import { user } from '../user/user'
import { asset } from './asset'
import { v7 as uuidv7 } from 'uuid'

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

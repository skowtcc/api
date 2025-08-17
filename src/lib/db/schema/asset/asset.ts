import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { game } from '../game/game'
import { category } from '../category/category'
import { assetToTag } from './assetToTag'
import { savedAsset } from './savedAsset'
import { user } from '../user/user'
import { v7 as uuidv7 } from 'uuid'
import { assetLink } from './assetLink'
import { downloadHistoryToAsset } from './downloadHistory'

export const asset = sqliteTable('asset', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    name: text('name').notNull(),
    gameId: text('game_id')
        .notNull()
        .references(() => game.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
        .notNull()
        .references(() => category.id, { onDelete: 'cascade' }),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    uploadedBy: text('uploaded_by')
        .notNull()
        .references(() => user.id),
    downloadCount: integer('download_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    isSuggestive: integer('is_suggestive', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['pending', 'approved', 'denied'] })
        .notNull()
        .default('pending'),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
    extension: text('extension').notNull(),
})

export const assetGameIdx = index('asset_game_idx').on(asset.gameId)
export const assetCategoryIdx = index('asset_category_idx').on(asset.categoryId)
export const assetNameIdx = index('asset_name_idx').on(asset.name)

export const assetStatusIdx = index('asset_status_idx').on(asset.status)
export const assetGameStatusIdx = index('asset_game_status_idx').on(asset.gameId, asset.status)
export const assetCategoryStatusIdx = index('asset_category_status_idx').on(asset.categoryId, asset.status)
export const assetSuggestiveStatusIdx = index('asset_suggestive_status_idx').on(asset.isSuggestive, asset.status)
export const assetCreatedAtIdx = index('asset_created_at_idx').on(asset.createdAt)
export const assetUploadedByIdx = index('asset_uploaded_by_idx').on(asset.uploadedBy)

export const assetGameCategoryStatusIdx = index('asset_game_category_status_idx').on(
    asset.gameId,
    asset.categoryId,
    asset.status,
)
export const assetStatusCreatedIdx = index('asset_status_created_idx').on(asset.status, asset.createdAt)

export const assetRelations = relations(asset, ({ one, many }) => ({
    game: one(game, {
        fields: [asset.gameId],
        references: [game.id],
    }),
    category: one(category, {
        fields: [asset.categoryId],
        references: [category.id],
    }),
    uploadedByUser: one(user, {
        fields: [asset.uploadedBy],
        references: [user.id],
    }),
    downloadHistoryToAsset: many(downloadHistoryToAsset),
    tagLinks: many(assetToTag),
    savedByUsers: many(savedAsset),
    assetLink: many(assetLink, { relationName: 'assetLink' }),
    toAssetLink: many(assetLink, { relationName: 'toAssetLink' }),
}))

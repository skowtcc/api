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
    gameId: text('game_id').notNull(),
    categoryId: text('category_id').notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
    uploadedBy: text('uploaded_by')
        .notNull()
        .references(() => user.id),
    downloadCount: integer('download_count').notNull().default(0),
    viewCount: integer('view_count').notNull().default(0),
    // like nsfw, ish? may be triggering. better to just say 'suggestive'.
    isSuggestive: integer('is_suggestive', { mode: 'boolean' }).notNull().default(false),
    status: text('status', { enum: ['pending', 'approved', 'denied'] })
        .notNull()
        .default('pending'),
    hash: text('hash').notNull(),
    size: integer('size').notNull(),
    extension: text('extension').notNull(), // i.e .png..
})

export const assetGameIdx = index('asset_game_idx').on(asset.gameId)
export const assetCategoryIdx = index('asset_category_idx').on(asset.categoryId)
export const assetNameIdx = index('asset_name_idx').on(asset.name)

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

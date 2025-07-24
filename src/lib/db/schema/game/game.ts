import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { asset } from '../asset/asset'
import { gameToCategory } from './gameToCategory'
import { v7 as uuidv7 } from 'uuid'

export const game = sqliteTable('game', {
    id: text('id')
        .primaryKey()
        .notNull()
        .$defaultFn(() => uuidv7()),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    lastUpdated: integer('last_updated', { mode: 'timestamp' }).notNull(),
    assetCount: integer('asset_count').notNull().default(0),
})

export const gameSlugIdx = index('game_slug_idx').on(game.slug)
export const gameNameIdx = index('game_name_idx').on(game.name)

export const gameRelations = relations(game, ({ many }) => ({
    assets: many(asset),
    gameToCategories: many(gameToCategory),
}))

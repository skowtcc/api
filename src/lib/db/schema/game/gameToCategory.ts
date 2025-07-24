import { sqliteTable, text, primaryKey, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { game } from './game'
import { category } from '../category/category'

export const gameToCategory = sqliteTable(
    'game_to_category',
    {
        gameId: text('game_id')
            .notNull()
            .references(() => game.id, { onDelete: 'cascade' }),
        categoryId: text('category_id')
            .notNull()
            .references(() => category.id, { onDelete: 'cascade' }),
    },
    table => ({
        pk: primaryKey({ columns: [table.gameId, table.categoryId] }),
    }),
)

export const gameToCategoryGameIdx = index('game_to_category_game_idx').on(gameToCategory.gameId)
export const gameToCategoryCategoryIdx = index('game_to_category_category_idx').on(gameToCategory.categoryId)

export const gameToCategoryRelations = relations(gameToCategory, ({ one }) => ({
    game: one(game, {
        fields: [gameToCategory.gameId],
        references: [game.id],
    }),
    category: one(category, {
        fields: [gameToCategory.categoryId],
        references: [category.id],
    }),
}))

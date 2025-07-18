import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { game } from '../game/game'
import { category } from '../category/category'

export const categoryToGame = sqliteTable('category_to_game', {
    id: text('id').primaryKey(),
    gameId: text('game_id').notNull(),
    categoryId: text('category_id').notNull(),
})

export const categoryToGameGameIdx = index('ctg_game_idx').on(categoryToGame.gameId)
export const categoryToGameCategoryIdx = index('ctg_category_idx').on(categoryToGame.categoryId)

export const categoryToGameRelations = relations(categoryToGame, ({ one }) => ({
    game: one(game, {
        fields: [categoryToGame.gameId],
        references: [game.id],
    }),
    category: one(category, {
        fields: [categoryToGame.categoryId],
        references: [category.id],
    }),
}))

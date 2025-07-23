import { sqliteTable, text, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { game } from '../game/game'
import { category } from '../category/category'
import { v7 as uuidv7 } from 'uuid'

export const categoryToGame = sqliteTable('category_to_game', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    gameId: text('game_id').notNull().references(() => game.id, { onDelete: 'cascade' }),
    categoryId: text('category_id').notNull().references(() => category.id, { onDelete: 'cascade' }),
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

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { game, category, categoryToGame } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

const responseSchema = z.object({
    success: z.boolean(),
    categories: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            games: z.array(
                z.object({
                    id: z.string(),
                    slug: z.string(),
                    name: z.string(),
                    lastUpdated: z.string(),
                    assetCount: z.number(),
                    categoryCount: z.number(),
                }),
            ),
        }),
    ),
})

const openRoute = createRoute({
    path: '/all',
    method: 'get',
    summary: 'Get all categories',
    description: 'Get all categories with their linked games.',
    tags: ['Category'],
    responses: {
        200: {
            description: 'Success',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const CategoryAllRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        try {
            const categories = await drizzle.select().from(category)

            const categoryGames = await drizzle
                .select({
                    categoryId: categoryToGame.categoryId,
                    gameId: game.id,
                    gameSlug: game.slug,
                    gameName: game.name,
                    gameLastUpdated: game.lastUpdated,
                    gameAssetCount: game.assetCount,
                    gameCategoryCount: game.categoryCount,
                })
                .from(categoryToGame)
                .innerJoin(game, eq(categoryToGame.gameId, game.id))

            const gamesByCategory = categoryGames.reduce(
                (acc, link) => {
                    if (!acc[link.categoryId]) {
                        acc[link.categoryId] = []
                    }
                    acc[link.categoryId]!.push({
                        id: link.gameId,
                        slug: link.gameSlug,
                        name: link.gameName,
                        lastUpdated: link.gameLastUpdated.toISOString(),
                        assetCount: link.gameAssetCount,
                        categoryCount: link.gameCategoryCount,
                    })
                    return acc
                },
                {} as Record<string, any[]>,
            )

            const formattedCategories = categories.map(cat => ({
                ...cat,
                games: gamesByCategory[cat.id] || [],
            }))

            return ctx.json(
                {
                    success: true,
                    categories: formattedCategories,
                },
                200,
            )
        } catch (error) {
            console.error('Category list error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch categories',
                },
                500,
            )
        }
    })
}

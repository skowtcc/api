import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { category, categoryToGame, game } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

const responseSchema = z.object({
    success: z.boolean(),
    games: z.array(
        z.object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            lastUpdated: z.string(),
            assetCount: z.number(),
            categoryCount: z.number(),
            categories: z.array(
                z.object({
                    id: z.string(),
                    name: z.string(),
                    slug: z.string(),
                }),
            ),
        }),
    ),
})

const openRoute = createRoute({
    path: '/all',
    method: 'get',
    summary: 'Get all games',
    description: 'Get all games with their linked categories.',
    tags: ['Game'],
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

export const GameAllRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        try {
            const games = await drizzle.select().from(game)

            const gameCategories = await drizzle
                .select({
                    gameId: categoryToGame.gameId,
                    categoryId: category.id,
                    categoryName: category.name,
                    categorySlug: category.slug,
                })
                .from(categoryToGame)
                .innerJoin(category, eq(categoryToGame.categoryId, category.id))

            const categoriesByGame = gameCategories.reduce(
                (acc, link) => {
                    if (!acc[link.gameId]) {
                        acc[link.gameId] = []
                    }
                    acc[link.gameId]!.push({
                        id: link.categoryId,
                        name: link.categoryName,
                        slug: link.categorySlug,
                    })
                    return acc
                },
                {} as Record<string, any[]>,
            )

            const formattedGames = games.map(g => ({
                ...g,
                lastUpdated: g.lastUpdated.toISOString(),
                categories: categoriesByGame[g.id] || [],
            }))

            return ctx.json(
                {
                    success: true,
                    games: formattedGames,
                },
                200,
            )
        } catch (error) {
            console.error('Game list error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch games',
                },
                500,
            )
        }
    })
}

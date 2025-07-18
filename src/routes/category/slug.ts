import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { category, categoryToGame, game } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

const paramsSchema = z.object({
    slug: z.string().openapi({
        param: {
            description: 'The category slug',
            in: 'path',
            name: 'slug',
            required: true,
        },
        example: 'splash-art',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    category: z.object({
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
})

const openRoute = createRoute({
    path: '/{slug}',
    method: 'get',
    summary: 'Get category by slug',
    description: 'Get a specific category by its slug with linked games.',
    tags: ['Category'],
    request: {
        params: paramsSchema,
    },
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

export const CategorySlugRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { slug } = ctx.req.valid('param')
        const { drizzle } = getConnection(ctx.env)

        try {
            const categoryResult = await drizzle.select().from(category).where(eq(category.slug, slug)).limit(1)

            if (categoryResult.length === 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Category not found',
                    },
                    404,
                )
            }

            const categoryData = categoryResult[0]!

            const categoryGames = await drizzle
                .select({
                    gameId: game.id,
                    gameSlug: game.slug,
                    gameName: game.name,
                    gameLastUpdated: game.lastUpdated,
                    gameAssetCount: game.assetCount,
                    gameCategoryCount: game.categoryCount,
                })
                .from(categoryToGame)
                .innerJoin(game, eq(categoryToGame.gameId, game.id))
                .where(eq(categoryToGame.categoryId, categoryData.id))

            const formattedCategory = {
                ...categoryData,
                games: categoryGames.map(gameData => ({
                    id: gameData.gameId,
                    slug: gameData.gameSlug,
                    name: gameData.gameName,
                    lastUpdated: gameData.gameLastUpdated.toISOString(),
                    assetCount: gameData.gameAssetCount,
                    categoryCount: gameData.gameCategoryCount,
                })),
            }

            return ctx.json(
                {
                    success: true,
                    category: formattedCategory,
                },
                200,
            )
        } catch (error) {
            console.error('Category fetch error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch category',
                },
                500,
            )
        }
    })
}

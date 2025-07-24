import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { game } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

const paramsSchema = z.object({
    slug: z.string().openapi({
        param: {
            description: 'The game slug',
            in: 'path',
            name: 'slug',
            required: true,
        },
        example: 'genshin-impact',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    game: z.object({
        id: z.string(),
        slug: z.string(),
        name: z.string(),
        lastUpdated: z.string(),
        assetCount: z.number(),
        categories: z.array(
            z.object({
                id: z.string(),
                slug: z.string(),
                name: z.string(),
            }),
        ),
    }),
})

const openRoute = createRoute({
    path: '/{slug}',
    method: 'get',
    summary: 'Get game by slug',
    description: 'Get a specific game by its slug with linked categories.',
    tags: ['Game'],
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

export const GameSlugRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { slug } = ctx.req.valid('param')
        const { drizzle } = getConnection(ctx.env)

        try {
            const gameData = await drizzle.query.game.findFirst({
                where: eq(game.slug, slug),
                with: {
                    gameToCategories: {
                        with: {
                            category: true,
                        },
                    },
                },
            })

            if (!gameData) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Game not found',
                    },
                    404,
                )
            }

            const formattedGame = {
                id: gameData.id,
                slug: gameData.slug,
                name: gameData.name,
                lastUpdated: gameData.lastUpdated.toISOString(),
                assetCount: gameData.assetCount,
                categories: gameData.gameToCategories.map(gtc => ({
                    id: gtc.category.id,
                    slug: gtc.category.slug,
                    name: gtc.category.name,
                })),
            }

            return ctx.json(
                {
                    success: true,
                    game: formattedGame,
                },
                200,
            )
        } catch (error) {
            console.error('Game fetch error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch game',
                },
                500,
            )
        }
    })
}

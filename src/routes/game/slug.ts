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
            const gameResult = await drizzle.select().from(game).where(eq(game.slug, slug)).limit(1)

            if (gameResult.length === 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Game not found',
                    },
                    404,
                )
            }

            const gameData = gameResult[0]!

            const formattedGame = {
                ...gameData,
                lastUpdated: gameData.lastUpdated.toISOString(),
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

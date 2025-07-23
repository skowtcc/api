import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { category, game } from '~/lib/db/schema'
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

            if (!games) {
                return ctx.json(
                    {
                        success: true,
                        games: [],
                    },
                    200,
                )
            }

            const formattedGames = games.map(g => ({
                ...g,
                lastUpdated: g.lastUpdated.toISOString(),
            }))

            return ctx.json(
                {
                    success: true,
                    games: formattedGames || [],
                },
                200,
            )
        } catch (error) {
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

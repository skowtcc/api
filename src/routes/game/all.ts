import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { category, game } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

const responseSchema = z.object({
    success: z.boolean(),
    games: z.array(
        z.object({
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
    handler.use(
        '/all',
        cache({
            cacheName: 'game-all',
            cacheControl: 'max-age=300, s-maxage=300',
        }),
    )

    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        try {
            const games = await drizzle.query.game.findMany({
                with: {
                    gameToCategories: {
                        with: {
                            category: true,
                        },
                    },
                },
            })

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
                id: g.id,
                slug: g.slug,
                name: g.name,
                lastUpdated: g.lastUpdated.toISOString(),
                assetCount: g.assetCount,
                categories: g.gameToCategories.map(gtc => ({
                    id: gtc.category.id,
                    slug: gtc.category.slug,
                    name: gtc.category.name,
                })),
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

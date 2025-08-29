import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { game, category } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

const responseSchema = z.object({
    success: z.boolean(),
    categories: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
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
    handler.use(
        '/all',
        cache({
            cacheName: 'category-all',
            cacheControl: 'max-age=300, s-maxage=300',
        }),
    )

    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        try {
            const categories = await drizzle.select().from(category)

            return ctx.json(
                {
                    success: true,
                    categories: categories || [],
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

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { tag } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

const responseSchema = z.object({
    success: z.boolean(),
    tags: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
            color: z.string().nullable(),
        }),
    ),
})

const openRoute = createRoute({
    path: '/all',
    method: 'get',
    summary: 'Get all tags',
    description: 'Get all available tags.',
    tags: ['Tag'],
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

export const TagAllRoute = (handler: AppHandler) => {
    handler.use(
        '/all',
        cache({
            cacheName: 'tag-all',
            cacheControl: 'max-age=43200, s-maxage=43200',
        }),
    )

    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        try {
            const tags = await drizzle.select().from(tag)

            return ctx.json(
                {
                    success: true,
                    tags: tags || [],
                },
                200,
            )
        } catch (error) {
            console.error('Tag list error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch tags',
                },
                500,
            )
        }
    })
}

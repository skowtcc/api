import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { category, game } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

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
    handler.use(
        '/{slug}',
        cache({
            cacheName: 'category-slug',
            cacheControl: 'max-age=43200, s-maxage=43200',
        }),
    )

    handler.openapi(openRoute, async ctx => {
        const { slug } = ctx.req.valid('param')
        const { drizzle } = getConnection(ctx.env)

        try {
            const [categoryResult] = await drizzle.select().from(category).where(eq(category.slug, slug)).limit(1)

            if (!categoryResult) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Category not found',
                    },
                    404,
                )
            }

            return ctx.json(
                {
                    success: true,
                    category: categoryResult,
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

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'

const responseSchema = z.object({
    success: z.boolean(),
    user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
        username: z.string().nullable(),
        image: z.string().nullable(),
        emailVerified: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
    }),
})

const openRoute = createRoute({
    path: '/profile',
    method: 'get',
    summary: 'Get user profile',
    description: "Get the current user's profile information.",
    tags: ['Auth'],
    responses: {
        200: {
            description: 'Profile retrieved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthProfileRoute = (handler: AppHandler) => {
    handler.use('/auth/profile', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const user = ctx.get('user')

        try {
            return ctx.json(
                {
                    success: true,
                    user: {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                        username: user.username || null,
                        image: user.image || null,
                        emailVerified: user.emailVerified,
                        createdAt: user.createdAt.toISOString(),
                        updatedAt: user.updatedAt.toISOString(),
                    },
                },
                200,
            )
        } catch (error: any) {
            console.error('Profile error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to get profile',
                },
                500,
            )
        }
    })
}

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { eq } from 'drizzle-orm'
import { getConnection } from '~/lib/db/connection'
import { user } from '~/lib/db/schema'

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
        role: z.enum(['user', 'admin', 'contributor']),
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
    handler.use('/profile', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const authUser = ctx.get('user')

        if (!authUser) {
            return ctx.json(
                {
                    success: false,
                    message: 'Unauthorized',
                },
                401,
            )
        }

        const { drizzle } = getConnection(ctx.env)

        const [userData] = await drizzle
            .select({
                id: user.id,
                email: user.email,
                name: user.name,
                username: user.username,
                image: user.image,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                role: user.role,
            })
            .from(user)
            .where(eq(user.id, authUser.id))
            .limit(1)

        if (!userData) {
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to get full user data',
                },
                500,
            )
        }

        try {
            return ctx.json(
                {
                    success: true,
                    user: {
                        id: userData.id,
                        email: userData.email,
                        name: userData.name,
                        username: userData.username,
                        image: userData.image,
                        emailVerified: userData.emailVerified,
                        createdAt: userData.createdAt.toISOString(),
                        updatedAt: userData.updatedAt.toISOString(),
                        role: userData.role,
                    },
                },
                200,
            )
        } catch (error: any) {
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

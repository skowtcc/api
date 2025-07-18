import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { user } from '~/lib/db/schema'

const bodySchema = z.object({
    name: z.string().min(1).optional().openapi({
        description: "User's display name",
        example: 'John Doe',
    }),
    username: z.string().min(3).optional().openapi({
        description: "User's unique username",
        example: 'johndoe',
    }),
    image: z.string().url().optional().openapi({
        description: "User's profile picture URL",
        example: 'https://example.com/avatar.jpg',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
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
    method: 'put',
    summary: 'Update user profile',
    description: "Update the current user's profile information.",
    tags: ['Auth'],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: bodySchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Profile updated successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthUpdateProfileRoute = (handler: AppHandler) => {
    handler.use('/auth/profile', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const { name, username, image } = ctx.req.valid('json')
        const currentUser = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        try {
            if (username && username !== currentUser.username) {
                const existingUser = await drizzle.select().from(user).where(eq(user.username, username)).limit(1)

                if (existingUser.length > 0) {
                    return ctx.json(
                        {
                            success: false,
                            message: 'Username is already taken',
                        },
                        400,
                    )
                }
            }

            const updateData: any = {
                updatedAt: new Date(),
            }

            if (name !== undefined) updateData.name = name
            if (username !== undefined) updateData.username = username
            if (image !== undefined) updateData.image = image

            const updatedUsers = await drizzle
                .update(user)
                .set(updateData)
                .where(eq(user.id, currentUser.id))
                .returning()

            const updatedUser = updatedUsers[0]!

            return ctx.json(
                {
                    success: true,
                    message: 'Profile updated successfully',
                    user: {
                        id: updatedUser.id,
                        email: updatedUser.email,
                        name: updatedUser.name,
                        username: updatedUser.username,
                        image: updatedUser.image,
                        emailVerified: updatedUser.emailVerified,
                        createdAt: updatedUser.createdAt.toISOString(),
                        updatedAt: updatedUser.updatedAt.toISOString(),
                    },
                },
                200,
            )
        } catch (error: any) {
            console.error('Profile update error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to update profile',
                },
                500,
            )
        }
    })
}

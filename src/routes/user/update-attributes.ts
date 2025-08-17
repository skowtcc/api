import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { eq } from 'drizzle-orm'
import { getConnection } from '~/lib/db/connection'
import { user } from '~/lib/db/schema'

const requestSchema = z.object({
    displayName: z.string().min(1).max(16).optional().transform((val) => val?.trim() || null),
})

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    user: z.object({
        id: z.string(),
        name: z.string(),
        displayName: z.string().nullable(),
        email: z.string(),
        image: z.string().nullable(),
    }).optional(),
})

const updateAttributesRoute = createRoute({
    path: '/update-attributes',
    method: 'patch',
    summary: 'Update user attributes',
    description: 'Update user-customizable attributes like display name.',
    tags: ['User'],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: requestSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'User attributes updated successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserUpdateAttributesRoute = (handler: AppHandler) => {
    handler.use('/update-attributes', requireAuth)

    handler.openapi(updateAttributesRoute, async ctx => {
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

        const body = ctx.req.valid('json')
        const { drizzle } = getConnection(ctx.env)

        try {
            const updateData: any = {
                updatedAt: new Date(),
            }

            if (body.displayName !== undefined) {
                updateData.displayName = body.displayName
            }

            const [updatedUser] = await drizzle
                .update(user)
                .set(updateData)
                .where(eq(user.id, authUser.id))
                .returning({
                    id: user.id,
                    name: user.name,
                    displayName: user.displayName,
                    email: user.email,
                    image: user.image,
                })

            if (!updatedUser) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Failed to update user attributes',
                    },
                    500,
                )
            }

            return ctx.json(
                {
                    success: true,
                    message: 'User attributes updated successfully',
                    user: updatedUser,
                },
                200,
            )
        } catch (error: any) {
            console.error('Update user attributes error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to update user attributes',
                },
                500,
            )
        }
    })
}

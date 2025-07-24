import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { user } from '~/lib/db/schema'

const bodySchema = z
    .object({
        currentPassword: z.string().min(1).openapi({
            description: 'Current password',
            example: 'password',
        }),
        newPassword: z.string().min(6).max(32).openapi({
            description: 'New password (minimum 6 characters, maximum 32 characters)',
            example: 'password',
        }),
        confirmNewPassword: z.string().min(6).max(32).openapi({
            description: 'Confirm new password (minimum 6 characters, maximum 32 characters)',
            example: 'password',
        }),
    })
    .refine(data => data.newPassword === data.confirmNewPassword, {
        message: 'Passwords do not match',
        path: ['confirmNewPassword'],
    })
    .openapi({
        description: 'New password and confirm new password must match',
    })

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
})

const openRoute = createRoute({
    path: '/update-password',
    method: 'put',
    summary: 'Update password',
    description: "Update the current user's password.",
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
            description: 'Password updated successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthUpdatePasswordRoute = (handler: AppHandler) => {
    handler.use('/update-password', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const auth = ctx.get('auth')
        const { currentPassword, newPassword } = ctx.req.valid('json')

        try {
            const changePasswordResult = await auth.api.changePassword({
                body: {
                    currentPassword,
                    newPassword,
                },
                asResponse: true,
            })

            if (!changePasswordResult) {
                return ctx.json({ success: false, message: 'Invalid credentials' }, 401)
            }

            return ctx.json({ success: true, message: 'Password updated successfully' }, 200)
        } catch (error: any) {
            return ctx.json({ success: false, message: error?.message || 'Failed to update password' }, 500)
        }
    })
}

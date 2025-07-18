import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
})

const openRoute = createRoute({
    path: '/auth/logout',
    method: 'post',
    summary: 'Logout user',
    description: 'Logout the current user session.',
    tags: ['Auth'],
    responses: {
        200: {
            description: 'Logout successful',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthLogoutRoute = (handler: AppHandler) => {
    handler.use('/logout', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const auth = ctx.get('auth')

        try {
            const headers = new Headers()
            for (const [key, value] of Object.entries(ctx.req.header())) {
                if (typeof value === 'string') {
                    headers.set(key, value)
                }
            }

            await auth.api.signOut({
                headers,
            })

            return ctx.json(
                {
                    success: true,
                    message: 'Logout successful',
                },
                200,
            )
        } catch (error: any) {
            console.error('Logout error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Logout failed',
                },
                500,
            )
        }
    })
}

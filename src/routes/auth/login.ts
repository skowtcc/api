import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { getConnection } from '~/lib/db/connection'
import { user } from '~/lib/db/schema'
import { eq } from 'drizzle-orm'
import { setCookie } from 'hono/cookie'

const bodySchema = z.object({
    email: z.string().email().openapi({
        description: "User's email address",
        example: 'user@example.com',
    }),
    password: z.string().min(1).openapi({
        description: "User's password",
        example: 'password123',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    user: z
        .object({
            id: z.string(),
            email: z.string(),
            name: z.string(),
            username: z.string().nullable(),
        })
        .optional(),
})

const openRoute = createRoute({
    path: '/login',
    method: 'post',
    summary: 'Login user',
    description: 'Login with email and password.',
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
            description: 'Login successful',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthLoginRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { email, password } = ctx.req.valid('json')
        const auth = ctx.get('auth')
        const { drizzle } = getConnection(ctx.env)

        try {
            const result = await auth.api.signInEmail({
                body: {
                    email,
                    password,
                },
                asResponse: true,
            })

            const authData = (await result.json()) as any

            if (!authData.user) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Invalid credentials',
                    },
                    401,
                )
            }

            const dbUser = await drizzle.select().from(user).where(eq(user.id, authData.user.id)).limit(1)

            const username = dbUser.length > 0 ? dbUser[0]!.username : null

            const cookieHeaders = result.headers.get('set-cookie')
            if (cookieHeaders) {
                const cookieMatches = cookieHeaders.match(/([^=]+)=([^;]+)/)
                if (cookieMatches && cookieMatches[1] && cookieMatches[2]) {
                    const name = cookieMatches[1].trim()
                    const value = cookieMatches[2].trim()
                    setCookie(ctx, name, value, {
                        httpOnly: true,
                        secure: true,
                        sameSite: 'Lax',
                        path: '/',
                        maxAge: 60 * 60 * 24 * 7,
                    })
                }
            }

            return ctx.json(
                {
                    success: true,
                    message: 'Login successful',
                    user: {
                        id: authData.user.id,
                        email: authData.user.email,
                        name: authData.user.name,
                        username: username,
                    },
                },
                200,
            )
        } catch (error: any) {
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Login failed',
                },
                500,
            )
        }
    })
}

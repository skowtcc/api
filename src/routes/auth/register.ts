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
    password: z.string().min(6).openapi({
        description: "User's password (minimum 6 characters)",
        example: 'password123',
    }),
    name: z.string().min(1).openapi({
        description: "User's display name",
        example: 'display name',
    }),
    username: z.string().min(3).openapi({
        description: "User's unique username (required)",
        example: 'username',
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
    path: '/register',
    method: 'post',
    summary: 'Register new user',
    description: 'Register a new user with email and password.',
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
        201: {
            description: 'User registered successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthRegisterRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { email, password, name, username } = ctx.req.valid('json')
        const auth = ctx.get('auth')

        const { drizzle } = getConnection(ctx.env)

        try {
            const [existingUser] = await drizzle
                .select({
                    id: user.id,
                    username: user.username,
                })
                .from(user)
                .where(eq(user.username, username))

            if (existingUser) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Username is already taken',
                    },
                    400,
                )
            }

            const result = await auth.api.signUpEmail({
                body: {
                    email,
                    password,
                    name,
                },
                asResponse: true,
            })

            const authData = (await result.json()) as any

            if (!authData.user) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Registration failed',
                    },
                    400,
                )
            }

            const updatedUsers = await drizzle
                .update(user)
                .set({
                    username,
                    updatedAt: new Date(),
                })
                .where(eq(user.id, authData.user.id))
                .returning()

            const finalUsername = updatedUsers.length > 0 ? updatedUsers[0]!.username : username

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
                        maxAge: 60 * 60 * 24 * 30,
                    })
                }
            }

            return ctx.json(
                {
                    success: true,
                    message: 'User registered successfully',
                    user: {
                        id: authData.user.id,
                        email: authData.user.email,
                        name: authData.user.name,
                        username: finalUsername,
                    },
                },
                201,
            )
        } catch (error: any) {
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Registration failed',
                },
                500,
            )
        }
    })
}

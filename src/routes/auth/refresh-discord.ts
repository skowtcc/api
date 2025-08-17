import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { user, account } from '~/lib/db/schema'
import { eq, and } from 'drizzle-orm'

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    user: z
        .object({
            id: z.string(),
            name: z.string(),
            email: z.string(),
            image: z.string().nullable(),
            username: z.string().nullable(),
        })
        .optional(),
})

const openRoute = createRoute({
    path: '/refresh-discord',
    method: 'post',
    summary: 'Refresh Discord Profile Data',
    description: 'Re-sync user profile data from Discord (name, avatar, etc).',
    tags: ['Auth'],
    responses: {
        200: {
            description: 'Discord data refreshed successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthRefreshDiscordRoute = (handler: AppHandler) => {
    handler.use('/refresh-discord', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)
        const currentUser = ctx.get('user')
        if (!currentUser) {
            return ctx.json({ success: false, message: 'Unauthorized' }, 401)
        }

        try {
            const discordAccount = await drizzle
                .select()
                .from(account)
                .where(and(eq(account.userId, currentUser.id), eq(account.providerId, 'discord')))
                .limit(1)

            if (!discordAccount.length || !discordAccount[0]?.accessToken) {
                return ctx.json(
                    {
                        success: false,
                        message: 'No Discord account linked or access token expired',
                    },
                    400,
                )
            }

            const discordResponse = await fetch('https://discord.com/api/v10/users/@me', {
                headers: {
                    Authorization: `Bearer ${discordAccount[0].accessToken}`,
                },
            })

            if (!discordResponse.ok) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Failed to fetch Discord data - token may be expired',
                    },
                    400,
                )
            }

            const discordUser = await discordResponse.json() as {
                id: string
                username: string
                global_name: string | null
                avatar: string | null
                email: string
            }

            const avatarUrl = discordUser.avatar
                ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png?size=256`
                : null

            const updatedUser = await drizzle
                .update(user)
                .set({
                    name: discordUser.username,
                    email: discordUser.email,
                    image: avatarUrl,
                    updatedAt: new Date(),
                })
                .where(eq(user.id, currentUser.id))
                .returning()

            if (!updatedUser.length) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Failed to update user data',
                    },
                    500,
                )
            }

            const refreshedUser = updatedUser[0]!

            return ctx.json(
                {
                    success: true,
                    message: 'Discord profile data refreshed successfully',
                    user: {
                        id: refreshedUser.id,
                        name: refreshedUser.name,
                        email: refreshedUser.email,
                        image: refreshedUser.image,
                        username: refreshedUser.displayName,
                    },
                },
                200,
            )
        } catch (error: any) {
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to refresh Discord data',
                },
                500,
            )
        }
    })
}

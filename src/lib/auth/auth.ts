import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { name } from 'drizzle-orm'
import { getConnection } from '~/lib/db/connection'
import * as schema from '~/lib/db/schema'
import { Env } from '~/lib/handler'

export function createAuth(env: Env) {
    const { drizzle } = getConnection(env)

    return betterAuth({
        basePath: '/auth',
        database: drizzleAdapter(drizzle, {
            provider: 'sqlite',
            schema: {
                ...schema,
                user: schema.user,
                session: schema.session,
                account: schema.account,
                verification: schema.verification,
            },
        }),
        trustedOrigins: [
            // 'http://localhost:8787',
            // 'http://localhost:3000',
            'https://skowt.cc',
            // 'https://staging.skowt.cc',
        ],
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        socialProviders: {
            discord: {
                overrideUserInfoOnSignIn: true,
                clientId: env.DISCORD_CLIENT_ID as string,
                clientSecret: env.DISCORD_CLIENT_SECRET as string,
                mapProfileToUser: async profile => {
                    return {
                        name: profile.username,
                        displayName: profile.global_name || profile.username,
                    }
                },
            },
        },
        emailAndPassword: {
            enabled: false,
        },
        session: {
            cookieCache: {
                enabled: true,
                maxAge: 5 * 60, // (seconds)
            },
        },
        user: {
            modelName: 'user',
            additionalFields: {
                role: {
                    type: 'string',
                    required: false,
                    input: false,
                    defaultValue: 'user',
                },
                displayName: {
                    type: 'string',
                    required: false,
                },
            },
        },
    })
}

export type Auth = ReturnType<typeof createAuth>

import { betterAuth } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { getConnection } from '~/lib/db/connection'
import * as schema from '~/lib/db/schema'
import { Env } from '~/lib/handler'

export function createAuth(env: Env) {
    const db = getConnection(env)

    return betterAuth({
        database: drizzleAdapter(db, {
            provider: 'sqlite',
            schema: {
                ...schema,
                user: schema.user,
                session: schema.session,
                account: schema.account,
                verification: schema.verification,
            },
        }),
        secret: env.BETTER_AUTH_SECRET,
        baseURL: env.BETTER_AUTH_URL,
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
        },
    })
}

export type Auth = ReturnType<typeof createAuth>

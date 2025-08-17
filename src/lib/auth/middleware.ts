import { createMiddleware } from 'hono/factory'
import { createAuth, type Auth } from '~/lib/auth/auth'
import type { Session, User } from 'better-auth'

export interface Env {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    DISCORD_CLIENT_ID: string
    DISCORD_CLIENT_SECRET: string
    TURSO_DATABASE_URL: string
    TURSO_DATABASE_AUTH_TOKEN?: string
    DISCORD_WEBHOOK?: string
    CDN: R2Bucket
    RATE_LIMITER: DurableObjectNamespace<any>
}

export interface AuthVariables {
    auth: Auth
    user?: User & {
        role: string
        displayName?: string
    }
    session?: Session
}

export const authMiddleware = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (c, next) => {
    const auth = createAuth({
        BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
        DISCORD_CLIENT_ID: c.env.DISCORD_CLIENT_ID,
        DISCORD_CLIENT_SECRET: c.env.DISCORD_CLIENT_SECRET,
        TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
        TURSO_DATABASE_AUTH_TOKEN: c.env.TURSO_DATABASE_AUTH_TOKEN,
        CDN: c.env.CDN,
        RATE_LIMITER: c.env.RATE_LIMITER,
    })

    c.set('auth', auth)
    await next()
})

export const requireAuth = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (c, next) => {
    const auth = c.get('auth')

    try {
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        })

        if (!session || !session.user) {
            return c.json({ success: 'False', error: 'Unauthorized' }, 401)
        }

        c.set('user', session.user as User & { role: string; displayName?: string })
        c.set('session', session.session)

        await next()
    } catch (error) {
        return c.json({ success: false, error: 'Authentication middleware failed' }, 401)
    }
})

export const requireAdminOrContributor = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (ctx, next) => {
    const user = ctx.get('user')
    if (!user || (user.role !== 'admin' && user.role !== 'contributor')) {
        return ctx.json({ success: false, message: 'Forbidden: Only admin or contributor can access this route' }, 403)
    }
    await next()
})

export const requireAdmin = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (ctx, next) => {
    const user = ctx.get('user')
    if (!user || user.role !== 'admin') {
        return ctx.json({ success: false, message: 'Forbidden: Only admin can access this route' }, 403)
    }
    await next()
})

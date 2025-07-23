import { createMiddleware } from 'hono/factory'
import { createAuth, type Auth } from '~/lib/auth/auth'

export interface Env {
    BETTER_AUTH_SECRET: string
    BETTER_AUTH_URL: string
    TURSO_DATABASE_URL: string
    TURSO_DATABASE_AUTH_TOKEN?: string
    DISCORD_WEBHOOK?: string
    CDN: R2Bucket
}

export interface AuthVariables {
    auth: Auth
    user?: any
    session?: any
}

export const authMiddleware = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (c, next) => {
    const auth = createAuth({
        BETTER_AUTH_SECRET: c.env.BETTER_AUTH_SECRET,
        BETTER_AUTH_URL: c.env.BETTER_AUTH_URL,
        TURSO_DATABASE_URL: c.env.TURSO_DATABASE_URL,
        TURSO_DATABASE_AUTH_TOKEN: c.env.TURSO_DATABASE_AUTH_TOKEN,
        CDN: c.env.CDN,
    })

    c.set('auth', auth)
    await next()
})

export const requireAuth = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (c, next) => {
    const auth = c.get('auth')

    const headers = new Headers()
    for (const [key, value] of Object.entries(c.req.header())) {
        if (typeof value === 'string') {
            headers.set(key, value)
        }
    }

    const session = await auth.api.getSession({
        headers,
    })

    if (!session) {
        return c.json({ error: 'Unauthorized' }, 401)
    }

    c.set('user', session.user)
    c.set('session', session.session)

    await next()
})

export const requireAdminOrContributor = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (ctx, next) => {
    const user = ctx.get('user')
    if (!user || (user.role !== 'admin' && user.role !== 'contributor')) {
        throw new Error('Forbidden: Only admin or contributor can access this route')
    }
    await next()
})

export const requireAdmin = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (ctx, next) => {
    const user = ctx.get('user')
    if (!user || user.role !== 'admin') {
        throw new Error('Forbidden: Only admin can access this route')
    }
    await next()
})

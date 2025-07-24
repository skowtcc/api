import { createMiddleware } from 'hono/factory'
import { createAuth, type Auth } from '~/lib/auth/auth'
import { getConnection } from '~/lib/db/connection'
import { user } from '~/lib/db/schema'
import { eq } from 'drizzle-orm'

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
    fullUser?: typeof user.$inferSelect
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

    const { drizzle } = getConnection(c.env)

    try {
        const session = await auth.api.getSession({
            headers: c.req.raw.headers,
        })

        if (!session) {
            return c.json({ error: 'Unauthorized' }, 401)
        }

        const [fullUser] = await drizzle.select().from(user).where(eq(user.id, session.user.id))

        c.set('user', session.user)
        c.set('fullUser', fullUser)
        c.set('session', session.session)

        await next()
    } catch (error) {
        console.error('Auth error:', error)
        return c.json({ success: false, error: 'Authentication middlewarefailed' }, 401)
    }
})

export const requireAdminOrContributor = createMiddleware<{
    Bindings: Env
    Variables: AuthVariables
}>(async (ctx, next) => {
    const user = ctx.get('fullUser')
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

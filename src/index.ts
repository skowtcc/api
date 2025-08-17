import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { swaggerUI } from '@hono/swagger-ui'
import { Env, AuthVariables } from '~/lib/handler'
import { AssetHandler } from './routes/asset'
import { GameHandler } from './routes/game'
import { CategoryHandler } from './routes/category'
import { TagHandler } from './routes/tag'
import { AuthHandler } from './routes/auth'
import { UserHandler } from './routes/user'
import { apiReference } from '@scalar/hono-api-reference'
import { rateLimiter } from 'hono-rate-limiter'
import { DurableObjectStore, DurableObjectRateLimiter } from '@hono-rate-limiter/cloudflare'
import { createAuth } from './lib/auth/auth'

const app = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

app.use(
    '/*',
    cors({
        origin: [
            // 'http://localhost:8787',
            // 'http://localhost:3000',
            'https://skowt.cc',
            'https://staging.skowt.cc',
        ],
        allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
        credentials: true,
    }),
)

app.use((c, next) =>
    rateLimiter<{ Bindings: Env; Variables: AuthVariables }>({
        windowMs: 1 * 60 * 1000, 
        limit: 10000, 
        standardHeaders: 'draft-6',
        keyGenerator: (c) => c.req.header('CF-Connecting-IP') ?? '',
        store: new DurableObjectStore({ namespace: c.env.RATE_LIMITER }),
    })(c, next)
)

app.all("/auth/*", async (c) => {
    const auth = createAuth(c.env);
    return auth.handler(c.req.raw);
});

app.route('/asset', AssetHandler)
app.route('/game', GameHandler)
app.route('/category', CategoryHandler)
app.route('/tag', TagHandler)
app.route('/user', UserHandler)
app.route('/personal', AuthHandler)


app.get('/', c => {
    return c.json({ message: 'api is up!', swagger: "/swagger", reference: "/reference" })
})

app.get('/swagger', swaggerUI({ url: '/doc' }))

app.doc('/doc', {
    openapi: '3.0.0',
    info: {
        version: '1.0.0',
        title: 'skowt.cc API',
        description: 'API for skowt.cc',
    },
    servers: [
        {
            url: 'https://den.skowt.cc',
            description: 'Production server',
        },
        {
            url: 'http://localhost:8787',
            description: 'Development server',
        }
    ],
})

app.get(
    '/reference',
    apiReference({
        spec: {
            url: '/doc',
        },
        theme: 'bluePlanet',
    }),
)

app.onError((err, c) => {
    console.error("[API] Internal server error: ", err);
    return c.json(
        {
            success: false,
            message:
                "Internal server error. Please contact support@originoid.co if this issue persists.",
        },
        500,
    );
});

export { DurableObjectRateLimiter }

export default app

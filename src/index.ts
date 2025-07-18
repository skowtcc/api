import { OpenAPIHono } from '@hono/zod-openapi'
import { cors } from 'hono/cors'
import { swaggerUI } from '@hono/swagger-ui'
import { Env } from '~/lib/handler'
import { AssetHandler } from './routes/asset'
import { GameHandler } from './routes/game'
import { CategoryHandler } from './routes/category'
import { AuthHandler } from './routes/auth'
import { UserHandler } from './routes/user'
import { apiReference } from '@scalar/hono-api-reference'

const app = new OpenAPIHono<{ Bindings: Env }>()

app.use(
    '*',
    cors({
        origin: ['http://localhost:8787', 'https://wanderer.moe', 'https://staging.wanderer.moe'],
        credentials: true,
    }),
)

app.route('/asset', AssetHandler)
app.route('/game', GameHandler)
app.route('/category', CategoryHandler)
app.route('/user', UserHandler)
app.route('/auth', AuthHandler)

app.get('/', c => {
    return c.json({ message: 'Hello Hono!' })
})

app.get('/swagger', swaggerUI({ url: '/doc' }))

app.doc('/doc', {
    openapi: '3.0.0',
    info: {
        version: '1.0.0',
        title: 'wanderer.moe API',
        description: 'API for wanderer.moe',
    },
    servers: [
        {
            url: 'http://localhost:8787',
            description: 'Development server',
        },
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

export default app

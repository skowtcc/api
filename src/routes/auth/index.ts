import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { authMiddleware } from '~/lib/auth/middleware'
import { AuthRefreshDiscordRoute } from './refresh-discord'

export const AuthHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

AuthHandler.use('*', authMiddleware)

AuthRefreshDiscordRoute(AuthHandler)

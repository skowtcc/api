import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { authMiddleware } from '~/lib/auth/middleware'
import { AuthRegisterRoute } from './register'
import { AuthLoginRoute } from './login'
import { AuthLogoutRoute } from './logout'
import { AuthProfileRoute } from './profile'
import { AuthUpdateProfileRoute } from './update-profile'

export const AuthHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

AuthHandler.use('*', authMiddleware)

AuthRegisterRoute(AuthHandler)
AuthLoginRoute(AuthHandler)
AuthLogoutRoute(AuthHandler)
AuthProfileRoute(AuthHandler)
AuthUpdateProfileRoute(AuthHandler)

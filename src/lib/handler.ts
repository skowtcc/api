import type { OpenAPIHono } from '@hono/zod-openapi'
import type { Env, AuthVariables } from './auth/middleware'

export type AppHandler = OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>
export type { Env, AuthVariables }

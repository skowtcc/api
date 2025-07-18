import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { GameAllRoute } from './all'
import { GameSlugRoute } from './slug'

export const GameHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

GameAllRoute(GameHandler)
GameSlugRoute(GameHandler)

import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { TagAllRoute } from './all'

export const TagHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

TagAllRoute(TagHandler)

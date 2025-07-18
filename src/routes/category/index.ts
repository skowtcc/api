import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { CategoryAllRoute } from './all'
import { CategorySlugRoute } from './slug'

export const CategoryHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

CategoryAllRoute(CategoryHandler)
CategorySlugRoute(CategoryHandler)

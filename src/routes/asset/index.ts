import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { AssetSearchRoute } from './search'
import { AssetIdRoute } from './id'

export const AssetHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

AssetSearchRoute(AssetHandler)
AssetIdRoute(AssetHandler)

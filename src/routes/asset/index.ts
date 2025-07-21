import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { AssetSearchRoute } from './search'
import { AssetIdRoute } from './id'
import { AssetDownloadHistoryPostRoute, AssetDownloadHistoryGetRoute } from './history'

export const AssetHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

AssetSearchRoute(AssetHandler)
AssetIdRoute(AssetHandler)
AssetDownloadHistoryPostRoute(AssetHandler)
AssetDownloadHistoryGetRoute(AssetHandler)

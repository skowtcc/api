import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { authMiddleware } from '~/lib/auth/middleware'
import { AssetSearchRoute } from './search'
import { AssetIdRoute } from './id'
import { AssetDownloadHistoryPostRoute, AssetDownloadHistoryGetRoute } from './history'
import { AssetApprovalQueueRoute, AssetApproveRoute, AssetDenyRoute } from './approval-queue'
import { AssetUploadRoute } from './upload'

export const AssetHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

AssetHandler.use('*', authMiddleware)

AssetSearchRoute(AssetHandler)
AssetDownloadHistoryPostRoute(AssetHandler)
AssetDownloadHistoryGetRoute(AssetHandler)
AssetApprovalQueueRoute(AssetHandler)
AssetApproveRoute(AssetHandler)
AssetDenyRoute(AssetHandler)
AssetIdRoute(AssetHandler)
AssetUploadRoute(AssetHandler)

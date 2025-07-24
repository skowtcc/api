import { AuthVariables, Env } from '~/lib/handler'
import { OpenAPIHono } from '@hono/zod-openapi'
import { authMiddleware } from '~/lib/auth/middleware'
import { UserSavedAssetsListRoute } from './saved-assets-list'
import { UserSaveAssetRoute } from './save-asset'
import { UserUnsaveAssetRoute } from './unsave-asset'
import { UserSavedAssetsIdRoute } from './saved-asset-id'

export const UserHandler = new OpenAPIHono<{ Bindings: Env; Variables: AuthVariables }>()

UserHandler.use('*', authMiddleware)

UserSavedAssetsListRoute(UserHandler)
UserSaveAssetRoute(UserHandler)
UserUnsaveAssetRoute(UserHandler)
UserSavedAssetsIdRoute(UserHandler)

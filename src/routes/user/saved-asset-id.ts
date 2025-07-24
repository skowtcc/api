import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, and } from 'drizzle-orm'
import { savedAsset } from '~/lib/db/schema'

const responseSchema = z.object({
    success: z.boolean(),
    savedAsset: z.boolean(),
})

const paramsSchema = z.object({
    id: z.string().openapi({
        param: {
            name: 'id',
            in: 'path',
        },
        description: 'ID of the asset to check',
        example: 'asset_123',
    }),
})

const openRoute = createRoute({
    path: '/check-saved-asset/{id}',
    method: 'get',
    summary: 'Check if a user has saved an asset',
    description: 'Check if a user has saved an asset by the current user and the asset id.',
    tags: ['User'],
    request: {
        params: paramsSchema,
    },
    responses: {
        200: {
            description: 'Saved asset retrieved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserSavedAssetsIdRoute = (handler: AppHandler) => {
    handler.use('/check-saved-asset/*', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const currentUser = ctx.get('user')

        if (!currentUser) {
            return ctx.json(
                {
                    success: false,
                    message: 'Unauthorized',
                },
                401,
            )
        }

        const { drizzle } = getConnection(ctx.env)

        const { id: assetId } = ctx.req.valid('param')

        try {
            const [savedAssetResponse] = await drizzle
                .select()
                .from(savedAsset)
                .where(and(eq(savedAsset.userId, currentUser.id), eq(savedAsset.assetId, assetId)))
                .limit(1)

            return ctx.json(
                {
                    success: true,
                    savedAsset: savedAssetResponse ? true : false,
                },
                200,
            )
        } catch (error: any) {
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to get saved asset',
                },
                500,
            )
        }
    })
}

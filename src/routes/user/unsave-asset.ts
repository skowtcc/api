import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, and } from 'drizzle-orm'
import { savedAsset } from '~/lib/db/schema'

const paramsSchema = z.object({
    assetId: z.string().openapi({
        param: {
            description: 'ID of the asset to unsave',
            in: 'path',
            name: 'assetId',
            required: true,
        },
        example: 'asset_123',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
})

const openRoute = createRoute({
    path: '/saved-assets/{assetId}',
    method: 'delete',
    summary: 'Unsave asset',
    description: "Remove an asset from the current user's saved collection.",
    tags: ['User'],
    request: {
        params: paramsSchema,
    },
    responses: {
        200: {
            description: 'Asset unsaved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserUnsaveAssetRoute = (handler: AppHandler) => {
    handler.use('/user/saved-assets/*', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const { assetId } = ctx.req.valid('param')
        const currentUser = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        try {
            const existingSave = await drizzle
                .select()
                .from(savedAsset)
                .where(and(eq(savedAsset.userId, currentUser.id), eq(savedAsset.assetId, assetId)))
                .limit(1)

            if (existingSave.length === 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Asset not found in saved collection',
                    },
                    404,
                )
            }

            await drizzle
                .delete(savedAsset)
                .where(and(eq(savedAsset.userId, currentUser.id), eq(savedAsset.assetId, assetId)))

            return ctx.json(
                {
                    success: true,
                    message: 'Asset unsaved successfully',
                },
                200,
            )
        } catch (error: any) {
            console.error('Unsave asset error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to unsave asset',
                },
                500,
            )
        }
    })
}

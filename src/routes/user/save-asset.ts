import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, and } from 'drizzle-orm'
import { asset, savedAsset } from '~/lib/db/schema'

const bodySchema = z.object({
    assetId: z.string().openapi({
        description: 'ID of the asset to save',
        example: 'asset_123',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    savedAsset: z
        .object({
            id: z.string(),
            assetId: z.string(),
            savedAt: z.string(),
        })
        .optional(),
})

const openRoute = createRoute({
    path: '/saved-assets',
    method: 'post',
    summary: 'Save asset',
    description: "Save an asset to the current user's collection.",
    tags: ['User'],
    request: {
        body: {
            content: {
                'application/json': {
                    schema: bodySchema,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'Asset saved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserSaveAssetRoute = (handler: AppHandler) => {
    handler.use('/user/saved-assets', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const { assetId } = ctx.req.valid('json')
        const currentUser = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        try {
            const assetExists = await drizzle.select().from(asset).where(eq(asset.id, assetId)).limit(1)

            if (assetExists.length === 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Asset not found',
                    },
                    404,
                )
            }

            const existingSave = await drizzle
                .select()
                .from(savedAsset)
                .where(and(eq(savedAsset.userId, currentUser.id), eq(savedAsset.assetId, assetId)))
                .limit(1)

            if (existingSave.length > 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Asset already saved',
                    },
                    400,
                )
            }

            const newSavedAsset = await drizzle
                .insert(savedAsset)
                .values({
                    id: `saved_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                    userId: currentUser.id,
                    assetId: assetId,
                })
                .returning()

            const saved = newSavedAsset[0]!

            return ctx.json(
                {
                    success: true,
                    message: 'Asset saved successfully',
                    savedAsset: {
                        id: saved.id,
                        assetId: saved.assetId,
                        savedAt: saved.createdAt.toISOString(),
                    },
                },
                201,
            )
        } catch (error: any) {
            console.error('Save asset error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to save asset',
                },
                500,
            )
        }
    })
}

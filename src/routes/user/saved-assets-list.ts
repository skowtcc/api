import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, desc } from 'drizzle-orm'
import { asset, category, game, savedAsset } from '~/lib/db/schema'

const responseSchema = z.object({
    success: z.boolean(),
    savedAssets: z.array(
        z.object({
            id: z.string(),
            savedAt: z.string(),
            asset: z.object({
                id: z.string(),
                name: z.string(),
                gameId: z.string(),
                gameName: z.string(),
                gameSlug: z.string(),
                categoryId: z.string(),
                categoryName: z.string(),
                categorySlug: z.string(),
                downloadCount: z.number(),
                viewCount: z.number(),
                size: z.number(),
                extension: z.string(),
                createdAt: z.string(),
            }),
        }),
    ),
})

const openRoute = createRoute({
    path: '/saved-assets',
    method: 'get',
    summary: 'Get saved assets',
    description: 'Get all assets saved by the current user.',
    tags: ['User'],
    responses: {
        200: {
            description: 'Saved assets retrieved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserSavedAssetsListRoute = (handler: AppHandler) => {
    handler.use('/user/saved-assets', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const currentUser = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        try {
            const savedAssets = await drizzle
                .select({
                    id: savedAsset.id,
                    savedAt: savedAsset.createdAt,
                    assetId: asset.id,
                    assetName: asset.name,
                    assetGameId: asset.gameId,
                    assetCategoryId: asset.categoryId,
                    assetDownloadCount: asset.downloadCount,
                    assetViewCount: asset.viewCount,
                    assetSize: asset.size,
                    assetExtension: asset.extension,
                    assetCreatedAt: asset.createdAt,
                    gameName: game.name,
                    gameSlug: game.slug,
                    categoryName: category.name,
                    categorySlug: category.slug,
                })
                .from(savedAsset)
                .innerJoin(asset, eq(savedAsset.assetId, asset.id))
                .innerJoin(game, eq(asset.gameId, game.id))
                .innerJoin(category, eq(asset.categoryId, category.id))
                .where(eq(savedAsset.userId, currentUser.id))
                .orderBy(desc(savedAsset.createdAt))

            const formattedSavedAssets = savedAssets.map(saved => ({
                id: saved.id,
                savedAt: saved.savedAt.toISOString(),
                asset: {
                    id: saved.assetId,
                    name: saved.assetName,
                    gameId: saved.assetGameId,
                    gameName: saved.gameName,
                    gameSlug: saved.gameSlug,
                    categoryId: saved.assetCategoryId,
                    categoryName: saved.categoryName,
                    categorySlug: saved.categorySlug,
                    downloadCount: saved.assetDownloadCount,
                    viewCount: saved.assetViewCount,
                    size: saved.assetSize,
                    extension: saved.assetExtension,
                    createdAt: saved.assetCreatedAt.toISOString(),
                },
            }))

            return ctx.json(
                {
                    success: true,
                    savedAssets: formattedSavedAssets,
                },
                200,
            )
        } catch (error: any) {
            console.error('Saved assets list error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to get saved assets',
                },
                500,
            )
        }
    })
}

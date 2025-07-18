import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

const paramsSchema = z.object({
    id: z.string().openapi({
        param: {
            description: 'The asset ID',
            in: 'path',
            name: 'id',
            required: true,
        },
        example: 'asset_123',
    }),
})

const responseSchema = z.object({
    success: z.boolean(),
    asset: z.object({
        id: z.string(),
        name: z.string(),
        downloadCount: z.number(),
        viewCount: z.number(),
        size: z.number(),
        extension: z.string(),
        createdAt: z.string(),
        game: z.object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            lastUpdated: z.string(),
            assetCount: z.number(),
            categoryCount: z.number(),
        }),
        category: z.object({
            id: z.string(),
            name: z.string(),
            slug: z.string(),
        }),
        tags: z.array(
            z.object({
                id: z.string(),
                name: z.string(),
                slug: z.string(),
                color: z.string().nullable(),
            }),
        ),
    }),
})

const openRoute = createRoute({
    path: '/{id}',
    method: 'get',
    summary: 'Get asset by ID',
    description: 'Get detailed information about a specific asset by its ID.',
    tags: ['Asset'],
    request: {
        params: paramsSchema,
    },
    responses: {
        200: {
            description: 'Success',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AssetIdRoute = (handler: AppHandler) => {
    handler.openapi(openRoute, async ctx => {
        const { id } = ctx.req.valid('param')
        const { drizzle } = getConnection(ctx.env)

        try {
            const assetResult = await drizzle
                .select({
                    id: asset.id,
                    name: asset.name,
                    downloadCount: asset.downloadCount,
                    viewCount: asset.viewCount,
                    size: asset.size,
                    extension: asset.extension,
                    createdAt: asset.createdAt,
                    gameId: game.id,
                    gameSlug: game.slug,
                    gameName: game.name,
                    gameLastUpdated: game.lastUpdated,
                    gameAssetCount: game.assetCount,
                    gameCategoryCount: game.categoryCount,
                    categoryId: category.id,
                    categoryName: category.name,
                    categorySlug: category.slug,
                })
                .from(asset)
                .innerJoin(game, eq(asset.gameId, game.id))
                .innerJoin(category, eq(asset.categoryId, category.id))
                .where(eq(asset.id, id))
                .limit(1)

            if (assetResult.length === 0) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Asset not found',
                    },
                    404,
                )
            }

            const assetData = assetResult[0]!

            const assetTags = await drizzle
                .select({
                    tagId: tag.id,
                    tagName: tag.name,
                    tagSlug: tag.slug,
                    tagColor: tag.color,
                })
                .from(assetToTag)
                .innerJoin(tag, eq(assetToTag.tagId, tag.id))
                .where(eq(assetToTag.assetId, id))

            const formattedAsset = {
                id: assetData.id,
                name: assetData.name,
                downloadCount: assetData.downloadCount,
                viewCount: assetData.viewCount,
                size: assetData.size,
                extension: assetData.extension,
                createdAt: assetData.createdAt.toISOString(),
                game: {
                    id: assetData.gameId,
                    slug: assetData.gameSlug,
                    name: assetData.gameName,
                    lastUpdated: assetData.gameLastUpdated.toISOString(),
                    assetCount: assetData.gameAssetCount,
                    categoryCount: assetData.gameCategoryCount,
                },
                category: {
                    id: assetData.categoryId,
                    name: assetData.categoryName,
                    slug: assetData.categorySlug,
                },
                tags: assetTags.map(tag => ({
                    id: tag.tagId,
                    name: tag.tagName,
                    slug: tag.tagSlug,
                    color: tag.tagColor,
                })),
            }

            return ctx.json(
                {
                    success: true,
                    asset: formattedAsset,
                },
                200,
            )
        } catch (error) {
            console.error('Asset fetch error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to fetch asset',
                },
                500,
            )
        }
    })
}

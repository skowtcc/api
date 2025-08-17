import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { and, eq } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag, user } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

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
        isSuggestive: z.boolean(),
        uploadedBy: z.object({
            id: z.string(),
            username: z.string().nullable(),
            image: z.string().nullable(),
        }),
        game: z.object({
            id: z.string(),
            slug: z.string(),
            name: z.string(),
            lastUpdated: z.string(),
            assetCount: z.number(),
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
    handler.use(
        '/{id}',
        cache({
            cacheName: 'asset-by-id',
            cacheControl: 'max-age=28800, s-maxage=28800',
        }),
    )

    handler.openapi(openRoute, async ctx => {
        const { id } = ctx.req.valid('param')
        const { drizzle } = getConnection(ctx.env)

        try {
            const [allGames, allCategories, allTags, assetResult] = await Promise.all([
                drizzle.select().from(game),
                drizzle.select().from(category),
                drizzle.select().from(tag),
                drizzle
                    .select({
                        id: asset.id,
                        name: asset.name,
                        downloadCount: asset.downloadCount,
                        viewCount: asset.viewCount,
                        size: asset.size,
                        extension: asset.extension,
                        createdAt: asset.createdAt,
                        gameId: asset.gameId,
                        categoryId: asset.categoryId,
                        isSuggestive: asset.isSuggestive,
                        uploadedBy: asset.uploadedBy,
                    })
                    .from(asset)
                    .where(eq(asset.id, id))
                    .limit(1),
            ])

            const gameMap = Object.fromEntries(allGames.map(g => [g.id, g]))
            const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]))
            const tagMap = Object.fromEntries(allTags.map(t => [t.id, t]))

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
                    tagId: assetToTag.tagId,
                })
                .from(assetToTag)
                .where(eq(assetToTag.assetId, id))

            const uploader = await drizzle
                .select({
                    id: user.id,
                    username: user.name,
                    image: user.image,
                })
                .from(user)
                .where(eq(user.id, assetData.uploadedBy))
                .then(rows => rows[0] || { id: assetData.uploadedBy, username: null, image: null })

            const gameInfo = gameMap[assetData.gameId]
            const categoryInfo = categoryMap[assetData.categoryId]

            const formattedAsset = {
                id: assetData.id,
                name: assetData.name,
                downloadCount: assetData.downloadCount,
                viewCount: assetData.viewCount,
                size: assetData.size,
                extension: assetData.extension,
                createdAt: assetData.createdAt.toISOString(),
                isSuggestive: assetData.isSuggestive,
                uploadedBy: uploader,
                game: {
                    id: assetData.gameId,
                    slug: gameInfo?.slug || 'unknown',
                    name: gameInfo?.name || 'Unknown',
                    lastUpdated: gameInfo?.lastUpdated.toISOString() || new Date().toISOString(),
                    assetCount: gameInfo?.assetCount || 0,
                },
                category: {
                    id: assetData.categoryId,
                    name: categoryInfo?.name || 'Unknown',
                    slug: categoryInfo?.slug || 'unknown',
                },
                tags: assetTags
                    .map(tagLink => {
                        const tag = tagMap[tagLink.tagId]
                        return tag
                            ? {
                                  id: tag.id,
                                  name: tag.name,
                                  slug: tag.slug,
                                  color: tag.color,
                              }
                            : null
                    })
                    .filter((tag): tag is NonNullable<typeof tag> => tag !== null),
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

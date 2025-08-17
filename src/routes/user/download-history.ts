import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, desc, inArray, sql, and } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag, user, downloadHistory, downloadHistoryToAsset } from '~/lib/db/schema'

const querySchema = z.object({
    page: z
        .string()
        .optional()
        .default('1')
        .transform(val => parseInt(val, 10)),
    limit: z
        .string()
        .optional()
        .default('20')
        .transform(val => Math.min(50, Math.max(1, parseInt(val, 10)))),
})

const responseSchema = z.object({
    success: z.boolean(),
    downloadHistory: z.array(
        z.object({
            historyId: z.string(),
            downloadedAt: z.string(),
            assets: z.array(
                z.object({
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
                    isSuggestive: z.boolean(),
                    tags: z.array(
                        z.object({
                            id: z.string(),
                            name: z.string(),
                            slug: z.string(),
                            color: z.string().nullable(),
                        }),
                    ),
                    uploadedBy: z.object({
                        id: z.string(),
                        username: z.string().nullable(),
                        image: z.string().nullable(),
                    }),
                }),
            ),
        }),
    ),
    pagination: z.object({
        page: z.number(),
        limit: z.number(),
        total: z.number(),
        totalPages: z.number(),
        hasNext: z.boolean(),
        hasPrev: z.boolean(),
    }),
})

const openRoute = createRoute({
    path: '/download-history',
    method: 'get',
    summary: 'Get download history',
    description: 'Get the download history for the current user with pagination (max 500 total entries stored).',
    tags: ['User'],
    request: {
        query: querySchema,
    },
    responses: {
        200: {
            description: 'Download history retrieved successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const UserDownloadHistoryRoute = (handler: AppHandler) => {
    handler.use('/download-history', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const currentUser = ctx.get('user')
        if (!currentUser) {
            return ctx.json({ success: false, message: 'Unauthorized' }, 401)
        }
        const { drizzle } = getConnection(ctx.env)
        const { page, limit } = ctx.req.valid('query') // Fixed at 100 per page

        try {
            const [allGames, allCategories, allTags] = await Promise.all([
                drizzle
                    .select({
                        id: game.id,
                        name: game.name,
                        slug: game.slug,
                        lastUpdated: game.lastUpdated,
                        assetCount: game.assetCount,
                    })
                    .from(game),
                drizzle
                    .select({
                        id: category.id,
                        name: category.name,
                        slug: category.slug,
                    })
                    .from(category),
                drizzle
                    .select({
                        id: tag.id,
                        name: tag.name,
                        slug: tag.slug,
                        color: tag.color,
                    })
                    .from(tag),
            ])

            const gameMap = Object.fromEntries(allGames.map(g => [g.id, g]))
            const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]))
            const tagMap = Object.fromEntries(allTags.map(t => [t.id, t]))

            const [countResult] = await drizzle
                .select({ count: sql<number>`count(*)` })
                .from(downloadHistory)
                .where(eq(downloadHistory.userId, currentUser.id))

            const total = countResult?.count || 0
            const totalPages = Math.ceil(total / limit)
            const offset = (page - 1) * limit

            const historyBatches = await drizzle
                .select({
                    historyId: downloadHistory.id,
                    downloadedAt: downloadHistory.createdAt,
                })
                .from(downloadHistory)
                .where(eq(downloadHistory.userId, currentUser.id))
                .orderBy(desc(downloadHistory.createdAt))
                .limit(limit)
                .offset(offset)

            if (historyBatches.length === 0) {
                return ctx.json(
                    {
                        success: true,
                        downloadHistory: [],
                        pagination: {
                            page,
                            limit,
                            total,
                            totalPages,
                            hasNext: page < totalPages,
                            hasPrev: page > 1,
                        },
                    },
                    200,
                )
            }

            const historyIds = historyBatches.map(h => h.historyId)
            const assetLinks = await drizzle
                .select({
                    historyId: downloadHistoryToAsset.downloadHistoryId,
                    assetId: downloadHistoryToAsset.assetId,
                })
                .from(downloadHistoryToAsset)
                .where(inArray(downloadHistoryToAsset.downloadHistoryId, historyIds))

            const assetsByHistory = assetLinks.reduce(
                (acc, link) => {
                    if (!acc[link.historyId]) {
                        acc[link.historyId] = []
                    }
                    acc[link.historyId]!.push(link.assetId)
                    return acc
                },
                {} as Record<string, string[]>,
            )

            const allAssetIds = [...new Set(assetLinks.map(l => l.assetId))]

            if (allAssetIds.length === 0) {
                return ctx.json(
                    {
                        success: true,
                        downloadHistory: historyBatches.map(h => ({
                            historyId: h.historyId,
                            downloadedAt: h.downloadedAt.toISOString(),
                            assets: [],
                        })),
                        pagination: {
                            page,
                            limit,
                            total,
                            totalPages,
                            hasNext: page < totalPages,
                            hasPrev: page > 1,
                        },
                    },
                    200,
                )
            }

            const assets = await drizzle
                .select({
                    id: asset.id,
                    name: asset.name,
                    gameId: asset.gameId,
                    categoryId: asset.categoryId,
                    downloadCount: asset.downloadCount,
                    viewCount: asset.viewCount,
                    size: asset.size,
                    extension: asset.extension,
                    createdAt: asset.createdAt,
                    isSuggestive: asset.isSuggestive,
                    uploadedBy: asset.uploadedBy,
                })
                .from(asset)
                .where(inArray(asset.id, allAssetIds))

            const assetTags = await drizzle
                .select({
                    assetId: assetToTag.assetId,
                    tagId: assetToTag.tagId,
                })
                .from(assetToTag)
                .where(inArray(assetToTag.assetId, allAssetIds))

            const tagsByAsset = assetTags.reduce(
                (acc, link) => {
                    if (!acc[link.assetId]) {
                        acc[link.assetId] = []
                    }
                    const tagData = tagMap[link.tagId]
                    if (tagData) {
                        acc[link.assetId]!.push({
                            id: tagData.id,
                            name: tagData.name,
                            slug: tagData.slug,
                            color: tagData.color,
                        })
                    }
                    return acc
                },
                {} as Record<string, { id: string; name: string; slug: string; color: string | null }[]>,
            )

            const uploaderIds = [...new Set(assets.map(a => a.uploadedBy))]
            const uploaders = await drizzle
                .select({
                    id: user.id,
                    username: user.name,
                    image: user.image,
                })
                .from(user)
                .where(inArray(user.id, uploaderIds))

            const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u]))

            const assetMap = Object.fromEntries(assets.map(a => [a.id, a]))

            const formattedHistory = historyBatches.map(batch => ({
                historyId: batch.historyId,
                downloadedAt: batch.downloadedAt.toISOString(),
                assets: (assetsByHistory[batch.historyId] || [])
                    .map(assetId => {
                        const assetData = assetMap[assetId]
                        if (!assetData) {
                            return null
                        }
                        const gameData = gameMap[assetData.gameId]
                        const categoryData = categoryMap[assetData.categoryId]
                        return {
                            id: assetData.id,
                            name: assetData.name,
                            gameId: assetData.gameId,
                            gameName: gameData?.name || 'Unknown',
                            gameSlug: gameData?.slug || '',
                            categoryId: assetData.categoryId,
                            categoryName: categoryData?.name || 'Unknown',
                            categorySlug: categoryData?.slug || '',
                            downloadCount: assetData.downloadCount,
                            viewCount: assetData.viewCount,
                            size: assetData.size,
                            extension: assetData.extension,
                            createdAt: assetData.createdAt.toISOString(),
                            isSuggestive: assetData.isSuggestive,
                            tags: tagsByAsset[assetData.id] || [],
                            uploadedBy: uploaderMap[assetData.uploadedBy] || {
                                id: assetData.uploadedBy,
                                username: null,
                                image: null,
                            },
                        }
                    })
                    .filter((asset): asset is NonNullable<typeof asset> => asset !== null),
            }))

            return ctx.json(
                {
                    success: true,
                    downloadHistory: formattedHistory,
                    pagination: {
                        page,
                        limit,
                        total,
                        totalPages,
                        hasNext: page < totalPages,
                        hasPrev: page > 1,
                    },
                },
                200,
            )
        } catch (error: any) {
            console.error('Download history error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to get download history',
                },
                500,
            )
        }
    })
}

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, desc, inArray, like, and, sql, asc, type SQL } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag, savedAsset, user } from '~/lib/db/schema'

const querySchema = z.object({
    offset: z
        .string()
        .optional()
        .default('0')
        .transform(val => Math.max(0, parseInt(val, 10))),
    search: z.string().optional(),
    games: z.string().optional().describe('Comma-separated list of game slugs to filter by'),
    categories: z.string().optional().describe('Comma-separated list of category slugs to filter by'),
    tags: z.string().optional().describe('Comma-separated list of tag slugs to filter by'),
    sortBy: z.enum(['savedAt', 'viewCount', 'downloadCount', 'uploadDate', 'name']).optional().default('savedAt'),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
})

const responseSchema = z.object({
    success: z.boolean(),
    savedAssets: z.array(
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
    pagination: z.object({
        offset: z.number(),
        hasNext: z.boolean(),
    }),
})

const openRoute = createRoute({
    path: '/saved-assets',
    method: 'get',
    summary: 'Get saved assets',
    description: 'Get assets saved by the current user with pagination and search.',
    tags: ['User'],
    request: {
        query: querySchema,
    },
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
    handler.use('/saved-assets', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const currentUser = ctx.get('user')
        if (!currentUser) {
            return ctx.json({ success: false, message: 'Unauthorized' }, 401)
        }
        const { drizzle } = getConnection(ctx.env)
        const { offset, search, games, categories, tags, sortBy, sortOrder } = ctx.req.valid('query')

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

            const conditions: SQL[] = [eq(savedAsset.userId, currentUser.id)]

            if (search) {
                conditions.push(like(asset.name, `%${search}%`))
            }

            if (games) {
                const gamesSlugs = games
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                if (gamesSlugs.length > 0) {
                    const gameIds = allGames.filter(g => gamesSlugs.includes(g.slug)).map(g => g.id)
                    if (gameIds.length > 0) {
                        conditions.push(inArray(asset.gameId, gameIds))
                    }
                }
            }

            if (categories) {
                const categorySlugs = categories
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                if (categorySlugs.length > 0) {
                    const categoryIds = allCategories.filter(c => categorySlugs.includes(c.slug)).map(c => c.id)
                    if (categoryIds.length > 0) {
                        conditions.push(inArray(asset.categoryId, categoryIds))
                    }
                }
            }

            let tagFilteredAssetIds: string[] | null = null
            if (tags) {
                const tagSlugs = tags
                    .split(',')
                    .map(s => s.trim())
                    .filter(Boolean)
                if (tagSlugs.length > 0) {
                    const tagIds = await drizzle.select({ id: tag.id }).from(tag).where(inArray(tag.slug, tagSlugs))

                    if (tagIds.length > 0) {
                        const tagIdList = tagIds.map(t => t.id)
                        const taggedAssets = await drizzle
                            .select({ assetId: assetToTag.assetId })
                            .from(assetToTag)
                            .where(inArray(assetToTag.tagId, tagIdList))
                            .groupBy(assetToTag.assetId)
                            .having(sql`count(distinct ${assetToTag.tagId}) = ${tagIdList.length}`)

                        tagFilteredAssetIds = taggedAssets.map(ta => ta.assetId)
                        if (tagFilteredAssetIds.length === 0) {
                            return ctx.json(
                                {
                                    success: true,
                                    savedAssets: [],
                                    pagination: {
                                        offset,
                                        hasNext: false,
                                    },
                                },
                                200,
                            )
                        }
                        conditions.push(inArray(asset.id, tagFilteredAssetIds))
                    }
                }
            }


            let orderByClause
            switch (sortBy) {
                case 'viewCount':
                    orderByClause = sortOrder === 'asc' ? asc(asset.viewCount) : desc(asset.viewCount)
                    break
                case 'downloadCount':
                    orderByClause = sortOrder === 'asc' ? asc(asset.downloadCount) : desc(asset.downloadCount)
                    break
                case 'uploadDate':
                    orderByClause = sortOrder === 'asc' ? asc(asset.createdAt) : desc(asset.createdAt)
                    break
                case 'name':
                    orderByClause = sortOrder === 'asc' ? asc(asset.name) : desc(asset.name)
                    break
                case 'savedAt':
                default:
                    orderByClause = sortOrder === 'asc' ? asc(savedAsset.createdAt) : desc(savedAsset.createdAt)
                    break
            }

            const savedAssets = await drizzle
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
                    savedAt: savedAsset.createdAt,
                })
                .from(asset)
                .innerJoin(savedAsset, eq(asset.id, savedAsset.assetId))
                .where(and(...conditions))
                .orderBy(orderByClause)
                .limit(21)
                .offset(offset)

            const hasNext = savedAssets.length > 20
            const finalAssets = hasNext ? savedAssets.slice(0, 20) : savedAssets

            const assetTags =
                finalAssets.length > 0
                    ? await drizzle
                          .select({
                              assetId: assetToTag.assetId,
                              tagId: assetToTag.tagId,
                          })
                          .from(assetToTag)
                          .where(
                              inArray(
                                  assetToTag.assetId,
                                  finalAssets.map(savedAsset => savedAsset.id),
                              ),
                          )
                    : []

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

            const uploaderIds = finalAssets.map(a => a.uploadedBy)
            const uploaders =
                uploaderIds.length > 0
                    ? await drizzle
                          .select({
                              id: user.id,
                              username: user.name,
                              image: user.image,
                          })
                          .from(user)
                          .where(inArray(user.id, uploaderIds))
                    : []
            const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u]))

            const formattedAssets = finalAssets.map(savedAsset => {
                const gameData = gameMap[savedAsset.gameId]
                const categoryData = categoryMap[savedAsset.categoryId]
                return {
                    ...savedAsset,
                    gameName: gameData?.name || 'Unknown',
                    gameSlug: gameData?.slug || '',
                    categoryName: categoryData?.name || 'Unknown',
                    categorySlug: categoryData?.slug || '',
                    createdAt: savedAsset.createdAt.toISOString(),
                    tags: tagsByAsset[savedAsset.id] || [],
                    uploadedBy: uploaderMap[savedAsset.uploadedBy] || {
                        id: savedAsset.uploadedBy,
                        username: null,
                        image: null,
                    },
                }
            })

            return ctx.json(
                {
                    success: true,
                    savedAssets: formattedAssets,
                    pagination: {
                        offset,
                        hasNext,
                    },
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

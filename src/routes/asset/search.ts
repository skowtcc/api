import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { like, and, eq, inArray, sql, desc, asc, type SQL } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag, user } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { cache } from 'hono/cache'

const querySchema = z.object({
    name: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Search assets by name (partial match).',
                in: 'query',
                name: 'name',
                required: false,
            },
        }),
    tags: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Comma-separated list of tag slugs to filter by.',
                in: 'query',
                name: 'tags',
                required: false,
            },
            example: 'fanmade,official,4k',
        }),
    games: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Comma-separated list of game slugs to filter by.',
                in: 'query',
                name: 'games',
                required: false,
            },
            example: 'genshin-impact,honkai-star-rail',
        }),
    categories: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Comma-separated list of category slugs to filter by.',
                in: 'query',
                name: 'categories',
                required: false,
            },
            example: 'character-sheets,splash-art',
        }),
    page: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Page number for pagination (starts at 1).',
                in: 'query',
                name: 'page',
                required: false,
            },
            example: '1',
        }),
    limit: z
        .string()
        .optional()
        .openapi({
            param: {
                description: 'Number of results per page (max 50).',
                in: 'query',
                name: 'limit',
                required: false,
            },
            example: '20',
        }),
    sortBy: z
        .enum(['viewCount', 'downloadCount', 'uploadDate', 'name'])
        .optional()
        .openapi({
            param: {
                description: 'Field to sort by.',
                in: 'query',
                name: 'sortBy',
                required: false,
            },
            example: 'uploadDate',
        }),
    sortOrder: z
        .enum(['asc', 'desc'])
        .optional()
        .openapi({
            param: {
                description: 'Sort order (ascending or descending).',
                in: 'query',
                name: 'sortOrder',
                required: false,
            },
            example: 'desc',
        }),
})

const responseSchema = z.object({
    success: z.boolean(),
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
    path: '/search',
    method: 'get',
    summary: 'Search assets',
    description: 'Search assets by name, tags, games, and categories.',
    tags: ['Asset'],
    request: {
        query: querySchema,
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

export const AssetSearchRoute = (handler: AppHandler) => {
    handler.use(
        '/search',
        cache({
            cacheName: 'asset-search',
            cacheControl: 'max-age=10, s-maxage=10',
        })
    )
    
    handler.openapi(openRoute, async ctx => {
        const query = ctx.req.valid('query')
        
        const currentUser = ctx.get('user')
        const isAdmin = currentUser?.role === 'admin'
        const isGB = ctx.req.header('cf-ipcountry') === 'GB' && !isAdmin

        const { drizzle } = getConnection(ctx.env)

        const page = query.page ? parseInt(query.page) : 1
        const limit = query.limit ? Math.min(parseInt(query.limit), 50) : 20
        const offset = (page - 1) * limit
        const sortBy = query.sortBy || 'uploadDate'
        const sortOrder = query.sortOrder || 'desc'

        if (page < 1) {
            return ctx.json(
                {
                    success: false,
                    message: 'Page must be 1 or greater',
                },
                400,
            )
        }

        const tagSlugs = query.tags
            ? query.tags
                  .split(',')
                  .map(t => t.trim())
                  .filter(Boolean)
            : []
        const gameSlugs = query.games
            ? query.games
                  .split(',')
                  .map(g => g.trim())
                  .filter(Boolean)
            : []
        const categorySlugs = query.categories
            ? query.categories
                  .split(',')
                  .map(c => c.trim())
                  .filter(Boolean)
            : []

        try {
            // Fetch all games, categories, and tags at once for lookup maps
            const [allGames, allCategories, allTags] = await Promise.all([
                drizzle.select().from(game),
                drizzle.select().from(category),
                drizzle.select().from(tag)
            ])

            // Create lookup maps for O(1) access
            const gameMap = Object.fromEntries(allGames.map(g => [g.id, g]))
            const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]))
            const tagMap = Object.fromEntries(allTags.map(t => [t.id, t]))
            const gameSlugMap = Object.fromEntries(allGames.map(g => [g.slug, g.id]))
            const categorySlugMap = Object.fromEntries(allCategories.map(c => [c.slug, c.id]))
            const tagSlugMap = Object.fromEntries(allTags.map(t => [t.slug, t.id]))

            const conditions: SQL<unknown>[] = []

            if (query.name) {
                conditions.push(like(asset.name, `%${query.name}%`))
            }

            if (gameSlugs.length > 0) {
                const gameIds = gameSlugs
                    .map(slug => gameSlugMap[slug])
                    .filter((id): id is string => id !== undefined)
                if (gameIds.length > 0) {
                    conditions.push(inArray(asset.gameId, gameIds))
                }
            }

            if (categorySlugs.length > 0) {
                const categoryIds = categorySlugs
                    .map(slug => categorySlugMap[slug])
                    .filter((id): id is string => id !== undefined)
                if (categoryIds.length > 0) {
                    conditions.push(inArray(asset.categoryId, categoryIds))
                }
            }

            if (tagSlugs.length > 0) {
                const tagIds = tagSlugs
                    .map(slug => tagSlugMap[slug])
                    .filter((id): id is string => id !== undefined)
                if (tagIds.length > 0) {
                    const tagSubquery = drizzle
                        .select({ assetId: assetToTag.assetId })
                        .from(assetToTag)
                        .where(inArray(assetToTag.tagId, tagIds))
                        .groupBy(assetToTag.assetId)
                        .having(sql`COUNT(DISTINCT ${assetToTag.tagId}) = ${tagIds.length}`)

                    conditions.push(sql`${asset.id} IN (${tagSubquery})`)
                }
            }

            const sortColumn = {
                viewCount: asset.viewCount,
                downloadCount: asset.downloadCount,
                uploadDate: asset.createdAt,
                name: asset.name,
            }[sortBy]!

            const sortDirection = sortOrder === 'asc' ? asc : desc

            let baseQuery = drizzle
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
                .where(
                    and(
                        conditions.length > 0 ? and(...conditions) : undefined,
                        eq(asset.status, 'approved'),
                        isGB ? eq(asset.isSuggestive, false) : undefined,
                    ),
                )
                .orderBy(sortDirection(sortColumn))

            const countQuery = drizzle
                .select({ count: sql<number>`COUNT(*)` })
                .from(asset)
                .where(and(conditions.length > 0 ? and(...conditions) : undefined, eq(asset.status, 'approved')))

            const [assets, countResult] = await Promise.all([baseQuery.limit(limit).offset(offset), countQuery])

            const total = countResult[0]?.count || 0
            const totalPages = Math.ceil(total / limit)

            const assetIds = assets.map(a => a.id)
            const assetTags =
                assetIds.length > 0
                    ? await drizzle
                          .select({
                              assetId: assetToTag.assetId,
                              tagId: assetToTag.tagId,
                          })
                          .from(assetToTag)
                          .where(inArray(assetToTag.assetId, assetIds))
                    : []

            const tagsByAsset = assetTags.reduce(
                (acc, tagLink) => {
                    if (!acc[tagLink.assetId]) {
                        acc[tagLink.assetId] = []
                    }
                    const tag = tagMap[tagLink.tagId]
                    if (tag) {
                        acc[tagLink.assetId]!.push({
                            id: tag.id,
                            name: tag.name,
                            slug: tag.slug,
                            color: tag.color,
                        })
                    }
                    return acc
                },
                {} as Record<string, any[]>,
            )

            const uploaderIds = assets.map(a => a.uploadedBy)
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

            const formattedAssets = assets.map(asset => {
                const gameInfo = gameMap[asset.gameId]
                const categoryInfo = categoryMap[asset.categoryId]
                
                return {
                    ...asset,
                    gameName: gameInfo?.name || 'Unknown',
                    gameSlug: gameInfo?.slug || 'unknown',
                    categoryName: categoryInfo?.name || 'Unknown',
                    categorySlug: categoryInfo?.slug || 'unknown',
                    createdAt: asset.createdAt.toISOString(),
                    tags: tagsByAsset[asset.id] || [],
                    uploadedBy: uploaderMap[asset.uploadedBy] || { id: asset.uploadedBy, username: null, image: null },
                }
            })

            return ctx.json(
                {
                    success: true,
                    assets: formattedAssets,
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
        } catch (error) {
            console.error('Asset search error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Failed to search assets',
                },
                500,
            )
        }
    })
}

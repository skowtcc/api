import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { like, and, eq, inArray, sql, type SQL } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag } from '~/lib/db/schema'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'

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
            tags: z.array(
                z.object({
                    id: z.string(),
                    name: z.string(),
                    slug: z.string(),
                    color: z.string().nullable(),
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
    handler.openapi(openRoute, async ctx => {
        const query = ctx.req.valid('query')

        const { drizzle } = getConnection(ctx.env)

        const page = query.page ? parseInt(query.page) : 1
        const limit = query.limit ? Math.min(parseInt(query.limit), 50) : 20
        const offset = (page - 1) * limit

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
            const conditions: SQL<unknown>[] = []

            if (query.name) {
                conditions.push(like(asset.name, `%${query.name}%`))
            }

            if (gameSlugs.length > 0) {
                conditions.push(inArray(game.slug, gameSlugs))
            }

            if (categorySlugs.length > 0) {
                conditions.push(inArray(category.slug, categorySlugs))
            }

            if (tagSlugs.length > 0) {
                const tagSubquery = drizzle
                    .select({ assetId: assetToTag.assetId })
                    .from(assetToTag)
                    .innerJoin(tag, eq(assetToTag.tagId, tag.id))
                    .where(inArray(tag.slug, tagSlugs))
                    .groupBy(assetToTag.assetId)
                    .having(sql`COUNT(DISTINCT ${tag.slug}) = ${tagSlugs.length}`)

                conditions.push(sql`${asset.id} IN (${tagSubquery})`)
            }

            let baseQuery = drizzle
                .select({
                    id: asset.id,
                    name: asset.name,
                    gameId: asset.gameId,
                    gameName: game.name,
                    gameSlug: game.slug,
                    categoryId: asset.categoryId,
                    categoryName: category.name,
                    categorySlug: category.slug,
                    downloadCount: asset.downloadCount,
                    viewCount: asset.viewCount,
                    size: asset.size,
                    extension: asset.extension,
                    createdAt: asset.createdAt,
                })
                .from(asset)
                .innerJoin(game, eq(asset.gameId, game.id))
                .innerJoin(category, eq(asset.categoryId, category.id))
                .where(conditions.length > 0 ? and(...conditions) : undefined)

            const countQuery = drizzle
                .select({ count: sql<number>`COUNT(*)` })
                .from(asset)
                .innerJoin(game, eq(asset.gameId, game.id))
                .innerJoin(category, eq(asset.categoryId, category.id))

            if (conditions.length > 0) {
                countQuery.where(and(...conditions))
            }

            const [assets, countResult] = await Promise.all([baseQuery.limit(limit).offset(offset), countQuery])

            const total = countResult[0]?.count || 0
            const totalPages = Math.ceil(total / limit)

            const assetIds = assets.map(a => a.id)
            const assetTags =
                assetIds.length > 0
                    ? await drizzle
                          .select({
                              assetId: assetToTag.assetId,
                              tagId: tag.id,
                              tagName: tag.name,
                              tagSlug: tag.slug,
                              tagColor: tag.color,
                          })
                          .from(assetToTag)
                          .innerJoin(tag, eq(assetToTag.tagId, tag.id))
                          .where(inArray(assetToTag.assetId, assetIds))
                    : []

            const tagsByAsset = assetTags.reduce(
                (acc, tagLink) => {
                    if (!acc[tagLink.assetId]) {
                        acc[tagLink.assetId] = []
                    }
                    acc[tagLink.assetId]!.push({
                        id: tagLink.tagId,
                        name: tagLink.tagName,
                        slug: tagLink.tagSlug,
                        color: tagLink.tagColor,
                    })
                    return acc
                },
                {} as Record<string, any[]>,
            )

            const formattedAssets = assets.map(asset => ({
                ...asset,
                createdAt: asset.createdAt.toISOString(),
                tags: tagsByAsset[asset.id] || [],
            }))

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

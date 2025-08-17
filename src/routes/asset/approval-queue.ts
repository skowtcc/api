import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { asset, user, game, category, tag, assetToTag } from '~/lib/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'
import { requireAuth } from '~/lib/auth/middleware'

const responseSchema = z.object({
    success: z.boolean(),
    assets: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            gameId: z.string(),
            categoryId: z.string(),
            extension: z.string(),
            status: z.string(),
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
    ),
})

const approvalQueueRoute = createRoute({
    path: '/approval-queue',
    method: 'get',
    summary: 'List all assets pending approval',
    description: 'List all assets with status pending. Admin only.',
    tags: ['Asset'],
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

const approveRoute = createRoute({
    path: '/{id}/approve',
    method: 'post',
    summary: 'Approve asset',
    request: {
        params: paramsSchema,
    },
    description: 'Approve an asset. Admin only.',
    tags: ['Asset'],
    responses: {
        200: {
            description: 'Success',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
        },
        ...GenericResponses,
    },
})

const denyRoute = createRoute({
    path: '/{id}/deny',
    method: 'post',
    summary: 'Deny asset',
    request: {
        params: paramsSchema,
    },
    description: 'Deny an asset. Admin only.',
    tags: ['Asset'],
    responses: {
        200: {
            description: 'Success',
            content: { 'application/json': { schema: z.object({ success: z.boolean() }) } },
        },
        ...GenericResponses,
    },
})

export const AssetApprovalQueueRoute = (handler: AppHandler) => {
    handler.use('/approval-queue', requireAuth)
    handler.openapi(approvalQueueRoute, async ctx => {
        const currentUser = ctx.get('user')
        if (!currentUser || currentUser.role !== 'admin') {
            return ctx.json({ success: false, message: 'Admin access required' }, 403)
        }
        
        const { drizzle } = getConnection(ctx.env)
        
        // Fetch all games, categories, tags, and pending assets at once
        const [allGames, allCategories, allTags, pendingAssets] = await Promise.all([
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
                    status: asset.status,
                    createdAt: asset.createdAt,
                    gameId: asset.gameId,
                    categoryId: asset.categoryId,
                    isSuggestive: asset.isSuggestive,
                    uploadedBy: asset.uploadedBy,
                })
                .from(asset)
                .innerJoin(user, eq(asset.uploadedBy, user.id))
                .where(eq(asset.status, 'pending'))
                .orderBy(desc(asset.createdAt))
        ])

        // Create lookup maps for O(1) access
        const gameMap = Object.fromEntries(allGames.map(g => [g.id, g]))
        const categoryMap = Object.fromEntries(allCategories.map(c => [c.id, c]))
        const tagMap = Object.fromEntries(allTags.map(t => [t.id, t]))

        const assetIds = pendingAssets.map(a => a.id)
        const assetTags = assetIds.length > 0 ? await drizzle
            .select({
                assetId: assetToTag.assetId,
                tagId: assetToTag.tagId,
            })
            .from(assetToTag)
            .where(inArray(assetToTag.assetId, assetIds)) : []

        const uploaderIds = pendingAssets.map(a => a.uploadedBy)
        const uploaders = await drizzle
            .select({
                id: user.id,
                username: user.name,
                image: user.image,
            })
            .from(user)
            .where(inArray(user.id, uploaderIds))

        const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u]))

        // Group tags by asset and map using tagMap
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

        const formattedAssets = pendingAssets.map(a => {
            const gameInfo = gameMap[a.gameId]
            const categoryInfo = categoryMap[a.categoryId]
            
            return {
                id: a.id,
                name: a.name,
                status: a.status,
                gameId: a.gameId,
                categoryId: a.categoryId,
                extension: a.extension,
                uploadedBy: uploaderMap[a.uploadedBy]!,
                game: {
                    id: a.gameId,
                    slug: gameInfo?.slug || 'unknown',
                    name: gameInfo?.name || 'Unknown',
                    lastUpdated: gameInfo?.lastUpdated || new Date(),
                    assetCount: gameInfo?.assetCount || 0,
                },
                category: {
                    id: a.categoryId,
                    name: categoryInfo?.name || 'Unknown',
                    slug: categoryInfo?.slug || 'unknown',
                },
                tags: tagsByAsset[a.id] || [],
            }
        })

        return ctx.json({ success: true, assets: formattedAssets }, 200)
    })
}

export const AssetApproveRoute = (handler: AppHandler) => {
    handler.use('/:id/approve', requireAuth)
    handler.openapi(approveRoute, async ctx => {
        const currentUser = ctx.get('user')
        if (!currentUser || currentUser.role !== 'admin') {
            return ctx.json({ success: false, message: 'Admin access required' }, 403)
        }

        const id = ctx.req.param('id')
        const { drizzle } = getConnection(ctx.env)

        const [foundAsset] = await drizzle.select().from(asset).where(eq(asset.id, id))

        if (!foundAsset) {
            return ctx.json({ success: false, message: 'Asset not found' }, 404)
        }

        await drizzle.update(asset).set({ status: 'approved' }).where(eq(asset.id, id))

        const file = await ctx.env.CDN.get(`limbo/${foundAsset.id}.${foundAsset.extension}`)

        if (!file) {
            return ctx.json({ success: false, message: 'Asset file not found' }, 404)
        }

        await ctx.env.CDN.put(`asset/${foundAsset.id}.${foundAsset.extension}`, file.body)
        await ctx.env.CDN.delete(`limbo/${foundAsset.id}.${foundAsset.extension}`)

        return ctx.json({ success: true }, 200)
    })
}

export const AssetDenyRoute = (handler: AppHandler) => {
    handler.use('/:id/deny', requireAuth)
    handler.openapi(denyRoute, async ctx => {
        const currentUser = ctx.get('user')
        if (!currentUser || currentUser.role !== 'admin') {
            return ctx.json({ success: false, message: 'Admin access required' }, 403)
        }

        const { drizzle } = getConnection(ctx.env)
        const id = ctx.req.param('id')

        const [foundAsset] = await drizzle.select().from(asset).where(eq(asset.id, id))

        if (!foundAsset) {
            return ctx.json({ success: false, message: 'Asset not found' }, 404)
        }

        await drizzle.delete(asset).where(eq(asset.id, id))

        await ctx.env.CDN.delete(`limbo/${foundAsset.id}.${foundAsset.extension}`)

        return ctx.json({ success: true }, 200)
    })
}

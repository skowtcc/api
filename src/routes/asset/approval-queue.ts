import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { asset, user, game, category, tag, assetToTag } from '~/lib/db/schema'
import { eq, inArray, desc } from 'drizzle-orm'
import { requireAuth, requireAdmin } from '~/lib/auth/middleware'

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
    handler.use('/approval-queue', requireAuth, requireAdmin)
    handler.openapi(approvalQueueRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)
        const pendingAssets = await drizzle
            .select({
                id: asset.id,
                name: asset.name,
                downloadCount: asset.downloadCount,
                viewCount: asset.viewCount,
                size: asset.size,
                extension: asset.extension,
                status: asset.status,
                createdAt: asset.createdAt,
                gameId: game.id,
                gameSlug: game.slug,
                gameName: game.name,
                gameLastUpdated: game.lastUpdated,
                gameAssetCount: game.assetCount,
                categoryId: category.id,
                categoryName: category.name,
                categorySlug: category.slug,
                isSuggestive: asset.isSuggestive,
                uploadedBy: asset.uploadedBy,
            })
            .from(asset)
            .innerJoin(game, eq(asset.gameId, game.id))
            .innerJoin(category, eq(asset.categoryId, category.id))
            .innerJoin(user, eq(asset.uploadedBy, user.id))
            .where(eq(asset.status, 'pending'))
            .orderBy(desc(asset.createdAt))

        const assetTags = await drizzle
            .select({
                tagId: tag.id,
                tagName: tag.name,
                tagSlug: tag.slug,
                tagColor: tag.color,
            })
            .from(assetToTag)
            .innerJoin(tag, eq(assetToTag.tagId, tag.id))
            .where(
                inArray(
                    assetToTag.assetId,
                    pendingAssets.map(a => a.id),
                ),
            )

        const uploaderIds = pendingAssets.map(a => a.uploadedBy)
        const uploaders = await drizzle
            .select({
                id: user.id,
                username: user.username,
                image: user.image,
            })
            .from(user)
            .where(inArray(user.id, uploaderIds))

        const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u]))

        const formattedAssets = pendingAssets.map(a => ({
            id: a.id,
            name: a.name,
            status: a.status,
            gameId: a.gameId,
            categoryId: a.categoryId,
            extension: a.extension,
            uploadedBy: uploaderMap[a.uploadedBy]!,
            game: {
                id: a.gameId,
                slug: a.gameSlug,
                name: a.gameName,
                lastUpdated: a.gameLastUpdated,
                assetCount: a.gameAssetCount,
            },
            category: {
                id: a.categoryId,
                name: a.categoryName,
                slug: a.categorySlug,
            },
            tags: assetTags.map(t => ({
                id: t.tagId,
                name: t.tagName,
                slug: t.tagSlug,
                color: t.tagColor,
            })),
        }))

        return ctx.json({ success: true, assets: formattedAssets }, 200)
    })
}

export const AssetApproveRoute = (handler: AppHandler) => {
    handler.use('/{id}/approve', requireAuth, requireAdmin)
    handler.openapi(approveRoute, async ctx => {
        const user = ctx.get('user')

        if (!user) {
            return ctx.json({ success: false, message: 'User context failed' }, 401)
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

        if (ctx.env.DISCORD_WEBHOOK) {
            try {
                await fetch(ctx.env.DISCORD_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: null,
                        embeds: [
                            {
                                description: `Approved [${foundAsset.name}](https://wanderer.moe/asset/${foundAsset.id}) [.${foundAsset.extension.toUpperCase()}]`,
                                color: 3669788,
                                author: {
                                    name: user.username,
                                    icon_url: user.image || undefined,
                                },
                                footer: {
                                    text: `${foundAsset.gameId} - ${foundAsset.categoryId}`,
                                },
                                timestamp: new Date().toISOString(),
                            },
                        ],
                        attachments: [],
                    }),
                })
            } catch (err) {
                console.error('Failed to send webhook', err)
            }
        }

        return ctx.json({ success: true }, 200)
    })
}

export const AssetDenyRoute = (handler: AppHandler) => {
    handler.use('/{id}/deny', requireAuth, requireAdmin)
    handler.openapi(denyRoute, async ctx => {
        const user = ctx.get('user')

        if (!user) {
            return ctx.json({ success: false, message: 'User context failed' }, 401)
        }

        const { drizzle } = getConnection(ctx.env)
        const id = ctx.req.param('id')

        const [foundAsset] = await drizzle.select().from(asset).where(eq(asset.id, id))

        if (!foundAsset) {
            return ctx.json({ success: false, message: 'Asset not found' }, 404)
        }

        await drizzle.delete(asset).where(eq(asset.id, id))

        await ctx.env.CDN.delete(`limbo/${foundAsset.id}.${foundAsset.extension}`)

        if (ctx.env.DISCORD_WEBHOOK) {
            try {
                await fetch(ctx.env.DISCORD_WEBHOOK, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        content: null,
                        embeds: [
                            {
                                description: `Denied ${foundAsset.name} [.${foundAsset.extension.toUpperCase()}]`,
                                color: 16734039,
                                author: {
                                    name: user.username,
                                    icon_url: user.image || undefined,
                                },
                                footer: {
                                    text: `${foundAsset.gameId} - ${foundAsset.categoryId}`,
                                },
                                timestamp: new Date().toISOString(),
                            },
                        ],
                        attachments: [],
                    }),
                })
            } catch (err) {
                console.error('Failed to send webhook', err)
            }
        }

        return ctx.json({ success: true }, 200)
    })
}

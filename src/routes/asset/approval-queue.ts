import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { asset, user } from '~/lib/db/schema'
import { eq, inArray } from 'drizzle-orm'
import { requireAuth, requireAdmin } from '~/lib/auth/middleware'

const responseSchema = z.object({
    success: z.boolean(),
    assets: z.array(
        z.object({
            id: z.string(),
            name: z.string(),
            status: z.string(),
            uploadedBy: z.object({
                id: z.string(),
                username: z.string().nullable(),
                image: z.string().nullable(),
            }),
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

const approveRoute = createRoute({
    path: '/:id/approve',
    method: 'post',
    summary: 'Approve asset',
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
    path: '/:id/deny',
    method: 'post',
    summary: 'Deny asset',
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
        const pendingAssets = await drizzle.select().from(asset).where(eq(asset.status, 'pending'))
        const uploaderIds = pendingAssets.map(a => a.uploadedBy)
        const uploaders =
            uploaderIds.length > 0
                ? await drizzle
                      .select({
                          id: user.id,
                          username: user.username,
                          image: user.image,
                      })
                      .from(user)
                      .where(inArray(user.id, uploaderIds))
                : []
        const uploaderMap = Object.fromEntries(uploaders.map(u => [u.id, u]))
        const assets = pendingAssets.map(a => ({
            id: a.id,
            name: a.name,
            status: a.status,
            uploadedBy: uploaderMap[a.uploadedBy] || { id: a.uploadedBy, username: null, image: null },
        }))
        return ctx.json({ success: true, assets }, 200)
    })
}

export const AssetApproveRoute = (handler: AppHandler) => {
    handler.use('/:id/approve', requireAuth, requireAdmin)
    handler.openapi(approveRoute, async ctx => {
        const user = ctx.get('user')

        const id = ctx.req.param('id')

        const { drizzle } = getConnection(ctx.env)

        const [foundAsset] = await drizzle.select().from(asset).where(eq(asset.id, id))

        if (!foundAsset) {
            return ctx.json({ success: false, message: 'Asset not found' }, 404)
        }

        await drizzle.update(asset).set({ status: 'approved' }).where(eq(asset.id, id))

        if (ctx.env.DISCORD_WEBHOOK) {
            try {
                await fetch(ctx.env.DISCORD_WEBHOOK, {
                    method: 'POST',
                    body: JSON.stringify({
                        content: null,
                        embeds: [
                            {
                                description: `Approved ${foundAsset.name} [${foundAsset.extension}]`,
                                color: 3669788,
                                author: {
                                    name: user.username,
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
    handler.use('/:id/deny', requireAuth, requireAdmin)
    handler.openapi(denyRoute, async ctx => {
        const user = ctx.get('user')

        const { drizzle } = getConnection(ctx.env)
        const id = ctx.req.param('id')

        const [foundAsset] = await drizzle.select().from(asset).where(eq(asset.id, id))

        if (!foundAsset) {
            return ctx.json({ success: false, message: 'Asset not found' }, 404)
        }

        await drizzle.update(asset).set({ status: 'denied' }).where(eq(asset.id, id))

        if (ctx.env.DISCORD_WEBHOOK) {
            try {
                await fetch(ctx.env.DISCORD_WEBHOOK, {
                    method: 'POST',
                    body: JSON.stringify({
                        content: null,
                        embeds: [
                            {
                                description: `Denied ${foundAsset.name} [${foundAsset.extension}]`,
                                color: 16734039,
                                author: {
                                    name: user.username,
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

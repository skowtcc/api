import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { downloadHistory, downloadHistoryToAsset } from '~/lib/db/schema/asset/downloadHistory'
import { asset } from '~/lib/db/schema/asset/asset'
import { desc, eq, inArray } from 'drizzle-orm'
import { requireAuth } from '~/lib/auth/middleware'

const postBodySchema = z.object({
    assetIds: z
        .array(z.string().min(1))
        .min(1)
        .openapi({
            description: 'Array of asset IDs to add to download history',
            example: ['asset1', 'asset2'],
        }),
})

const postResponseSchema = z.object({
    success: z.boolean(),
    historyId: z.string(),
})

const getResponseSchema = z.object({
    success: z.boolean(),
    histories: z.array(
        z.object({
            id: z.string(),
            assetIds: z.array(z.string()),
            createdAt: z.string(),
        }),
    ),
})

const postRoute = createRoute({
    path: '/history',
    method: 'post',
    summary: 'Create a new download history batch',
    description: 'Save a batch of downloaded asset IDs for the authenticated user.',
    tags: ['Asset'],
    request: { body: { content: { 'application/json': { schema: postBodySchema } } } },
    responses: {
        200: { description: 'Success', content: { 'application/json': { schema: postResponseSchema } } },
        ...GenericResponses,
    },
})

const getRoute = createRoute({
    path: '/history',
    method: 'get',
    summary: 'Get all download history batches for the user',
    description: 'Fetch all download history batches for the authenticated user.',
    tags: ['Asset'],
    responses: {
        200: { description: 'Success', content: { 'application/json': { schema: getResponseSchema } } },
        ...GenericResponses,
    },
})

export const AssetDownloadHistoryPostRoute = (handler: AppHandler) => {
    handler.use('/history', requireAuth)
    handler.openapi(postRoute, async ctx => {
        const { assetIds } = ctx.req.valid('json')
        const user = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        const assets = await drizzle.select().from(asset).where(inArray(asset.id, assetIds))

        if (assets.length !== assetIds.length) {
            return ctx.json({ success: false, message: 'Invalid asset IDs' }, 400)
        }

        let historyId: string | undefined
        await drizzle.transaction(async tx => {
            const [history] = await tx
                .insert(downloadHistory)
                .values({ userId: user.id })
                .returning({ historyId: downloadHistory.id })

            historyId = history?.historyId

            if (!historyId) {
                throw new Error('Failed to create download history')
            }

            await tx.insert(downloadHistoryToAsset).values(
                assetIds.map(assetId => ({
                    downloadHistoryId: historyId!,
                    assetId,
                })),
            )
        })

        return ctx.json({ success: true, historyId: historyId! }, 200)
    })
}

export const AssetDownloadHistoryGetRoute = (handler: AppHandler) => {
    handler.use('/history', requireAuth)
    handler.openapi(getRoute, async ctx => {
        const user = ctx.get('user')
        const { drizzle } = getConnection(ctx.env)

        const histories = await drizzle
            .select()
            .from(downloadHistory)
            .where(eq(downloadHistory.userId, user.id))
            .orderBy(desc(downloadHistory.createdAt))

        if (!histories) {
            return ctx.json({ success: true, histories: [] }, 200)
        }

        const result: { id: string; createdAt: string; assetIds: string[] }[] = []

        for (const h of histories) {
            const links = await drizzle
                .select()
                .from(downloadHistoryToAsset)
                .where(eq(downloadHistoryToAsset.downloadHistoryId, h.id))

            result.push({
                id: h.id,
                createdAt: h.createdAt.toISOString(),
                assetIds: links.map(l => l.assetId),
            })
        }

        return ctx.json({ success: true, histories: result }, 200)
    })
}

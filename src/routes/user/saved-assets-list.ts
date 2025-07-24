import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq, desc, inArray } from 'drizzle-orm'
import { asset, assetToTag, category, game, tag, savedAsset, user } from '~/lib/db/schema'

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
})

const openRoute = createRoute({
    path: '/saved-assets',
    method: 'get',
    summary: 'Get saved assets',
    description: 'Get all assets saved by the current user.',
    tags: ['User'],
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
        const { drizzle } = getConnection(ctx.env)

        try {
            const savedAssets = await drizzle
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
                    isSuggestive: asset.isSuggestive,
                    uploadedBy: asset.uploadedBy,
                })
                .from(asset)
                .innerJoin(game, eq(asset.gameId, game.id))
                .innerJoin(category, eq(asset.categoryId, category.id))
                .innerJoin(savedAsset, eq(asset.id, savedAsset.assetId))
                .orderBy(desc(savedAsset.createdAt))

            const assetTags =
                savedAssets.length > 0
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
                          .where(
                              inArray(
                                  assetToTag.assetId,
                                  savedAssets.map(savedAsset => savedAsset.id),
                              ),
                          )
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
                {} as Record<string, { id: string; name: string; slug: string; color: string | null }[]>,
            )

            const uploaderIds = savedAssets.map(a => a.uploadedBy)
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

            const formattedAssets = savedAssets.map(savedAsset => ({
                ...savedAsset,
                createdAt: savedAsset.createdAt.toISOString(),
                tags: tagsByAsset[savedAsset.id] || [],
                uploadedBy: uploaderMap[savedAsset.uploadedBy] || {
                    id: savedAsset.uploadedBy,
                    username: null,
                    image: null,
                },
            }))

            return ctx.json(
                {
                    success: true,
                    savedAssets: formattedAssets,
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

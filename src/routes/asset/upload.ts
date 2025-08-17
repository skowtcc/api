import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { asset } from '~/lib/db/schema/asset/asset'
import { assetToTag } from '~/lib/db/schema/asset/assetToTag'
import { tag } from '~/lib/db/schema/asset/tag'
import { game } from '~/lib/db/schema/game/game'
import { category } from '~/lib/db/schema'
import { gameToCategory } from '~/lib/db/schema/game/gameToCategory'
import { and, eq, inArray } from 'drizzle-orm'
import { requireAuth } from '~/lib/auth/middleware'
import { v7 as uuidv7 } from 'uuid'
import type { Context } from 'hono'

const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/jpg'] as const
const ALLOWED_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const
const MAX_FILE_SIZE = 10 * 1024 * 1024

type FileValidationResult = { valid: true; extension: string } | { valid: false; message: string }

type User = {
    id: string
    name: string
    image: string | null
    role: 'admin' | 'contributor' | 'user'
    displayName?: string | null
}

type UploadedAsset = {
    id: string
    name: string
    status: 'approved' | 'pending'
    uploadedBy: {
        id: string
        username: string | null
        image: string | null
    }
}

const formSchema = z.object({
    name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
    gameId: z.string().uuid('Invalid game ID'),
    categoryId: z.string().uuid('Invalid category ID'),
    isSuggestive: z.string().optional().default('false'),
    tags: z.string().optional(),
    file: z.any(),
})

const responseSchema = z.object({
    success: z.boolean(),
    asset: z.object({
        id: z.string(),
        name: z.string(),
        status: z.string(),
        uploadedBy: z.object({
            id: z.string(),
            username: z.string().nullable(),
            image: z.string().nullable(),
        }),
    }),
})

function parseTags(tagsRaw?: string): string[] {
    if (!tagsRaw?.trim()) return []

    return tagsRaw
        .split(',')
        .map(tag => tag.trim())
        .filter(Boolean)
        .slice(0, 20)
}

function validateFile(file: unknown): FileValidationResult {
    if (!file || typeof file !== 'object' || !file) {
        return { valid: false, message: 'File is required' }
    }

    const fileObj = file as any

    if (!fileObj.type || !fileObj.name || typeof fileObj.size !== 'number') {
        return { valid: false, message: 'Invalid file object' }
    }

    if (!ALLOWED_MIME_TYPES.includes(fileObj.type)) {
        return {
            valid: false,
            message: `Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
        }
    }

    if (fileObj.size > MAX_FILE_SIZE) {
        return { valid: false, message: 'File size exceeds 10MB limit' }
    }

    const fileName = String(fileObj.name)
    const extension = fileName.split('.').pop()?.toLowerCase()

    if (!extension) {
        return {
            valid: false,
            message: 'File must have an extension',
        }
    }

    if (!ALLOWED_EXTENSIONS.includes(extension as any)) {
        return {
            valid: false,
            message: `Invalid file extension. Allowed extensions: ${ALLOWED_EXTENSIONS.join(', ')}`,
        }
    }

    return { valid: true, extension }
}

function determineAssetStatus(userRole: string): 'approved' | 'pending' {
    return userRole === 'admin' ? 'approved' : 'pending'
}

function getStoragePath(assetId: string, extension: string, isAdmin: boolean): string {
    const folder = isAdmin ? 'asset' : 'limbo'
    return `${folder}/${assetId}.${extension}`
}

class AssetUploadService {
    constructor(
        private drizzle: any,
        private env: any,
    ) {}

    async validateCategoryGameLink(gameId: string, categoryId: string, userRole: string): Promise<boolean> {
        const [existingLink] = await this.drizzle
            .select()
            .from(gameToCategory)
            .where(and(eq(gameToCategory.gameId, gameId), eq(gameToCategory.categoryId, categoryId)))
            .limit(1)

        if (existingLink) return true

        if (userRole === 'admin') {
            await this.drizzle.insert(gameToCategory).values({
                gameId,
                categoryId,
            })
            return true
        }

        return false
    }

    async uploadFileToStorage(file: File, path: string): Promise<boolean | null> {
        try {
            const arrayBuffer = await file.arrayBuffer()
            const uploadedFile = await this.env.CDN.put(path, arrayBuffer, {
                httpMetadata: {
                    contentType: file.type || 'application/octet-stream',
                }
            })
            
            if (!uploadedFile) {
                console.error('Upload failed - no result returned from CDN.put')
                return false
            }

            return true
        } catch (error) {
            console.error('Failed to upload file to storage:', error)
            return null
        }
    }

    async createAsset(data: {
        id: string
        name: string
        gameId: string
        categoryId: string
        uploadedBy: string
        isSuggestive: boolean
        size: number
        extension: string
        status: 'approved' | 'pending'
    }) {
        const [createdAsset] = await this.drizzle
            .insert(asset)
            .values({
                ...data,
                createdAt: new Date(),
                downloadCount: 0,
                viewCount: 0,
                hash: 'placeholder',
            })
            .returning()

        return createdAsset
    }

    async attachTags(assetId: string, tagIds: string[]): Promise<void> {
        if (tagIds.length === 0) return

        const validTags = await this.drizzle.select({ id: tag.id }).from(tag).where(inArray(tag.id, tagIds))

        const validTagIds = validTags.map(t => t.id)

        if (validTagIds.length > 0) {
            await this.drizzle.insert(assetToTag).values(
                validTagIds.map(tagId => ({
                    assetId,
                    tagId,
                })),
            )
        }
    }

}

const uploadRoute = createRoute({
    path: '/upload',
    method: 'post',
    summary: 'Upload a new asset',
    description: 'Upload a new asset (PNG or JPEG). Admins auto-approve, contributors go to approval queue.',
    tags: ['Asset'],
    request: {
        body: {
            content: {
                'multipart/form-data': {
                    schema: formSchema,
                },
            },
        },
    },
    responses: {
        200: {
            description: 'Asset uploaded successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AssetUploadRoute = (handler: AppHandler) => {
    handler.use('/upload', requireAuth)

    handler.openapi(uploadRoute, async (ctx: Context) => {
        try {
            const { drizzle } = getConnection(ctx.env)
            const user = ctx.get('user') as User | undefined
            
            if (!user) {
                return ctx.json({ success: false, message: 'Unauthorized' }, 401)
            }

            if (!['admin', 'contributor'].includes(user.role)) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Insufficient permissions. Admin or contributor role required.',
                    },
                    403,
                )
            }

            const form = await ctx.req.formData()
            const formData = Object.fromEntries(form.entries())

            const parseResult = formSchema.safeParse(formData)
            if (!parseResult.success) {
                return ctx.json(
                    {
                        success: false,
                        message:
                            'Invalid form data: ' +
                            Object.entries(parseResult.error.flatten().fieldErrors)
                                .map(([key, value]) => `${key}: ${value?.join(', ')}`)
                                .join(', '),
                    },
                    400,
                )
            }

            const { name, gameId, categoryId, isSuggestive, tags: tagsRaw, file } = parseResult.data

            const fileValidation = validateFile(file)
            if (!fileValidation.valid) {
                return ctx.json(
                    {
                        success: false,
                        message: fileValidation.message,
                    },
                    400,
                )
            }

            const uploadService = new AssetUploadService(drizzle, ctx.env)

            const isValidCategoryGame = await uploadService.validateCategoryGameLink(gameId, categoryId, user.role)

            if (!isValidCategoryGame) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Invalid category-game combination',
                    },
                    400,
                )
            }

            const assetId = uuidv7()
            const status = determineAssetStatus(user.role)
            const storagePath = getStoragePath(assetId, fileValidation.extension, user.role === 'admin')

            const fileUploaded = await uploadService.uploadFileToStorage(file as File, storagePath)

            if (!fileUploaded) {
                return ctx.json(
                    {
                        success: false,
                        message: 'Failed to upload file to storage',
                    },
                    500,
                )
            }

            await uploadService.createAsset({
                id: assetId,
                name,
                gameId,
                categoryId,
                uploadedBy: user.id,
                isSuggestive: isSuggestive === 'true',
                size: (file as any).size || 0,
                extension: fileValidation.extension,
                status,
            })

            const tagIds = parseTags(tagsRaw)
            await uploadService.attachTags(assetId, tagIds)

            const response: UploadedAsset = {
                id: assetId,
                name,
                status,
                uploadedBy: {
                    id: user.id,
                    username: user.name,
                    image: user.image,
                },
            }

            return ctx.json({ success: true, asset: response }, 200)
        } catch (error) {
            console.error('Asset upload error:', error)
            return ctx.json(
                {
                    success: false,
                    message: 'Internal server error occurred during upload',
                },
                500,
            )
        }
    })
}

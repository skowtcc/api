import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { getConnection } from '~/lib/db/connection'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { asset } from '~/lib/db/schema/asset/asset'
import { assetToTag } from '~/lib/db/schema/asset/assetToTag'
import { tag } from '~/lib/db/schema/asset/tag'
import { inArray } from 'drizzle-orm'
import { requireAuth, requireAdminOrContributor } from '~/lib/auth/middleware'
import { v7 as uuidv7 } from 'uuid'

const allowedMimeTypes = ['image/png', 'image/jpeg']
const allowedExtensions = ['.png', '.jpg', '.jpeg']

function parseTags(tagsRaw: string | undefined): string[] {
    return tagsRaw
        ? tagsRaw
              .split(',')
              .map(t => t.trim())
              .filter(Boolean)
        : []
}

function validateFile(file: any) {
    if (!file || typeof file !== 'object' || !('type' in file) || !('name' in file) || !('size' in file)) {
        return { valid: false, message: 'File is required' }
    }
    if (!allowedMimeTypes.includes(file.type)) {
        return { valid: false, message: 'Only PNG and JPEG files are allowed' }
    }
    const ext = file.name?.split('.').pop()?.toLowerCase() || ''
    if (!allowedExtensions.includes('.' + ext)) {
        return { valid: false, message: 'Invalid file extension' }
    }
    return { valid: true, ext }
}

const formSchema = z.object({
    name: z.string().min(1),
    gameId: z.string(),
    categoryId: z.string(),
    isSuggestive: z.union([z.string(), z.boolean()]).optional().default('false'),
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

const uploadRoute = createRoute({
    path: '/upload',
    method: 'post',
    summary: 'Upload a new asset',
    description: 'Upload a new asset (PNG or JPEG only). Admins auto-approve, contributors go to approval queue.',
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

export const AssetUploadRoute = (handler: AppHandler) => {
    handler.use('/upload', requireAuth, requireAdminOrContributor)
    handler.openapi(uploadRoute, async ctx => {
        const { drizzle } = getConnection(ctx.env)

        const userObj = ctx.get('user')
        const form = await ctx.req.formData()
        const formObj: Record<string, any> = {}

        for (const [key, value] of form.entries()) {
            formObj[key] = value
        }

        const parseResult = formSchema.safeParse(formObj)
        if (!parseResult.success) {
            return ctx.json({ success: false, message: 'Invalid form data', errors: parseResult.error.flatten() }, 400)
        }

        const { name, gameId, categoryId, isSuggestive, tags: tagsRaw, file } = parseResult.data
        const tags = parseTags(tagsRaw)

        const fileValidation = validateFile(file)

        if (!fileValidation.valid) {
            return ctx.json({ success: false, message: fileValidation.message || 'Invalid file' }, 400)
        }

        const ext = fileValidation.ext
        const status = userObj.role === 'admin' ? 'approved' : 'pending'
        const assetId = uuidv7()
        const now = new Date()
        const size = file.size || 0
        const extension = '.' + ext

        await drizzle.insert(asset).values({
            id: assetId,
            name,
            gameId,
            categoryId,
            createdAt: now,
            uploadedBy: userObj.id,
            isSuggestive: isSuggestive === true || isSuggestive === 'true',
            size,
            extension,
            status,
            hash: uuidv7(),
            downloadCount: 0,
            viewCount: 0,
        })

        if (tags.length > 0) {
            const validTags = await drizzle.select({ id: tag.id }).from(tag).where(inArray(tag.id, tags))
            const validTagIds = validTags.map(t => t.id)
            await drizzle.insert(assetToTag).values(
                validTagIds.map(tagId => ({
                    id: uuidv7(),
                    assetId,
                    tagId,
                })),
            )
        }

        const uploader = {
            id: userObj.id,
            username: userObj.username || null,
            image: userObj.image || null,
        }

        return ctx.json(
            {
                success: true,
                asset: {
                    id: assetId,
                    name,
                    status,
                    uploadedBy: uploader,
                },
            },
            200,
        )
    })
}

import { z } from '@hono/zod-openapi'
import { AppHandler } from '~/lib/handler'
import { createRoute } from '@hono/zod-openapi'
import { GenericResponses } from '~/lib/response-schemas'
import { requireAuth } from '~/lib/auth/middleware'
import { getConnection } from '~/lib/db/connection'
import { eq } from 'drizzle-orm'
import { user } from '~/lib/db/schema'

const formSchema = z.object({
    name: z.string().min(1).optional().openapi({
        description: "User's display name",
        example: 'Display Name',
    }),
    username: z.string().min(3).optional().openapi({
        description: "User's username",
        example: 'username',
    }),
    image: z.any().optional().openapi({
        description: 'Profile picture (PNG. 8MB max - ONLY available to contributors)',
    }),
})

const ALLOWED_MIME_TYPES = ['image/png'] as const
const ALLOWED_EXTENSIONS = ['png'] as const
const MAX_FILE_SIZE = 8 * 1024 * 1024

type FileValidationResult = { valid: true; extension: string } | { valid: false; message: string }

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

const responseSchema = z.object({
    success: z.boolean(),
    message: z.string(),
    user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string(),
        username: z.string().nullable(),
        image: z.string().nullable(),
        emailVerified: z.boolean(),
        createdAt: z.string(),
        updatedAt: z.string(),
    }),
})

const openRoute = createRoute({
    path: '/profile',
    method: 'put',
    summary: 'Update user profile',
    description: "Update the current user's profile information.",
    tags: ['Auth'],
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
            description: 'Profile updated successfully',
            content: {
                'application/json': {
                    schema: responseSchema,
                },
            },
        },
        ...GenericResponses,
    },
})

export const AuthUpdateProfileRoute = (handler: AppHandler) => {
    handler.use('/profile', requireAuth)

    handler.openapi(openRoute, async ctx => {
        const currentUser = ctx.get('fullUser')
        const { drizzle } = getConnection(ctx.env)

        if (!currentUser) {
            return ctx.json({ success: false, message: 'Context user is null' }, 500)
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

        const { username, name, image } = parseResult.data

        try {
            if (username && username !== currentUser.username) {
                const [existingUser] = await drizzle
                    .select({ id: user.id })
                    .from(user)
                    .where(eq(user.username, username))
                    .limit(1)

                if (existingUser) {
                    return ctx.json(
                        {
                            success: false,
                            message: 'Username is already taken',
                        },
                        400,
                    )
                }
            }

            const updateData: any = {
                updatedAt: new Date(),
            }

            if (name) updateData.name = name
            if (username) updateData.username = username

            if (image) {
                const fileValidation = validateFile(image)

                if (!fileValidation.valid) {
                    return ctx.json({ success: false, message: 'Invalid profile picture' }, 400)
                }

                const storagePath = `profile/${currentUser.id}.${fileValidation.extension}`
                const fileUploaded = await ctx.env.CDN.put(storagePath, image)

                if (!fileUploaded) {
                    return ctx.json({ success: false, message: 'Failed to upload profile picture' }, 500)
                }

                updateData.image = `https://images.wanderer.moe/${storagePath}`
            }

            const [updatedUser] = await drizzle
                .update(user)
                .set(updateData)
                .where(eq(user.id, currentUser.id))
                .returning()

            if (!updatedUser) {
                return ctx.json({ success: false, message: 'Failed to update profile' }, 500)
            }

            return ctx.json(
                {
                    success: true,
                    message: 'Profile updated successfully',
                    user: {
                        id: updatedUser.id,
                        email: updatedUser.email,
                        name: updatedUser.name,
                        username: updatedUser.username,
                        image: updatedUser.image,
                        emailVerified: updatedUser.emailVerified,
                        createdAt: updatedUser.createdAt.toISOString(),
                        updatedAt: updatedUser.updatedAt.toISOString(),
                    },
                },
                200,
            )
        } catch (error: any) {
            console.error('Profile update error:', error)
            return ctx.json(
                {
                    success: false,
                    message: error?.message || 'Failed to update profile',
                },
                500,
            )
        }
    })
}

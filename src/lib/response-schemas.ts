import { z } from '@hono/zod-openapi'

export const GenericResponses = {
    400: {
        description: 'Bad Request',
        content: {
            'application/json': {
                schema: z.object({
                    success: z.boolean(),
                    message: z.string(),
                }),
            },
        },
    },
    401: {
        description: 'Unauthorized',
        content: {
            'application/json': {
                schema: z.object({
                    success: z.boolean(),
                    message: z.string(),
                }),
            },
        },
    },
    403: {
        description: 'Forbidden',
        content: {
            'application/json': {
                schema: z.object({
                    success: z.boolean(),
                    message: z.string(),
                }),
            },
        },
    },
    404: {
        description: 'Not Found',
        content: {
            'application/json': {
                schema: z.object({
                    success: z.boolean(),
                    message: z.string(),
                }),
            },
        },
    },
    500: {
        description: 'Internal Server Error',
        content: {
            'application/json': {
                schema: z.object({
                    success: z.boolean(),
                    message: z.string(),
                }),
            },
        },
    },
}

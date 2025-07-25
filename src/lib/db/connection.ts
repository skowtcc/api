import { drizzle as drizzleORM } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client/web'
import { Logger } from 'drizzle-orm/logger'
import type { Env } from '~/lib/handler'
import * as schema from '~/lib/db/schema'

class LoggerWrapper implements Logger {
    logQuery(query: string, params: unknown[]): void {
        // console.log(`[DRIZZLE]: Query: ${query}, Parameters: ${params ?? 'none'}`)
    }
}

export function getConnection(env: Env) {
    if (!env.TURSO_DATABASE_URL || !env.TURSO_DATABASE_AUTH_TOKEN) {
        const missingVars = [
            !env.TURSO_DATABASE_URL && 'TURSO_DATABASE_URL',
            !env.TURSO_DATABASE_AUTH_TOKEN && 'TURSO_DATABASE_AUTH_TOKEN',
        ].filter(Boolean)

        if (missingVars.length > 0) {
            throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`)
        }
    }

    const turso = createClient({
        url: env.TURSO_DATABASE_URL,
        authToken: env.TURSO_DATABASE_AUTH_TOKEN,
    })

    const drizzle = drizzleORM(turso, {
        schema: {
            ...schema,
        },
        logger: new LoggerWrapper(),
    })

    return {
        drizzle,
        turso,
    }
}

export type DrizzleInstance = ReturnType<typeof getConnection>['drizzle']
export type TursoInstance = ReturnType<typeof getConnection>['turso']

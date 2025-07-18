import { drizzle as drizzleORM } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { createClient } from '@libsql/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.dev.vars' })

const {
    TURSO_DATABASE_AUTH_TOKEN,
    TURSO_DATABASE_URL,
    ENVIRONMENT,
    TURSO_DEV_DATABASE_URL = 'http://127.0.0.1:8080',
} = process.env

const isDev = ENVIRONMENT === 'DEV'
const DATABASE_URL = isDev ? TURSO_DEV_DATABASE_URL : TURSO_DATABASE_URL
const AUTH_TOKEN = isDev ? undefined : TURSO_DATABASE_AUTH_TOKEN

async function main() {
    logMigrationDetails()

    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL is not defined!')
    } else if (!AUTH_TOKEN && !isDev) {
        throw new Error('AUTH_TOKEN is not defined!')
    }

    await delayBeforeMigration(isDev ? 1000 : 10000)

    const client = createDatabaseClient(DATABASE_URL, AUTH_TOKEN)
    const db = drizzleORM(client)

    console.log('[MIGRATION] Migrating database...')
    await migrate(db, { migrationsFolder: './src/lib/db/migrations' })
    console.log('[MIGRATION] Migrations complete!')

    client.close()
}

function logMigrationDetails() {
    console.log('[MIGRATION] DEV:', isDev)
    console.log(`[MIGRATION] URL: ${DATABASE_URL}`)
}

function delayBeforeMigration(waitTime: number) {
    console.log(`[MIGRATION] Waiting ${waitTime}ms until migration...`)
    return new Promise(resolve => setTimeout(resolve, waitTime))
}

function createDatabaseClient(url: string, authToken: string | undefined) {
    console.log('[MIGRATION] Connecting to the database client...')
    const client = createClient({ url, authToken })
    console.log('[MIGRATION] Connected to the database client & initialized drizzle-orm instance')
    return client
}

main().catch(err => {
    console.error(`[MIGRATION] Error: ${err}`)
    process.exit(1)
})

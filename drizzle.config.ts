import { defineConfig } from 'drizzle-kit'

export default defineConfig({
    dialect: 'turso',
    dbCredentials: {
        url: 'http://127.0.0.1:8080',
    },
    schema: './src/lib/db/schema',
    out: './src/lib/db/migrations',
    strict: true,
    verbose: true,
})

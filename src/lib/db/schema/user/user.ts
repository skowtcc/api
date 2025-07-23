import { sqliteTable, text, integer, index } from 'drizzle-orm/sqlite-core'
import { relations } from 'drizzle-orm'
import { savedAsset } from '../asset/savedAsset'
import { v7 as uuidv7 } from 'uuid'
import { downloadHistory } from '../asset/downloadHistory'

export const user = sqliteTable('user', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    name: text('name').notNull(),
    username: text('username').unique(),
    email: text('email').notNull().unique(),
    emailVerified: integer('email_verified', { mode: 'boolean' }).notNull().default(false),
    image: text('image'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    role: text('role', { enum: ['user', 'admin', 'contributor'] })
        .notNull()
        .default('user'),
})

export const session = sqliteTable('session', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    token: text('token').notNull().unique(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const account = sqliteTable('account', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
        .notNull()
        .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: integer('access_token_expires_at', { mode: 'timestamp' }),
    refreshTokenExpiresAt: integer('refresh_token_expires_at', { mode: 'timestamp' }),
    scope: text('scope'),
    password: text('password'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const verification = sqliteTable('verification', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => uuidv7()),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .$defaultFn(() => new Date()),
})

export const userEmailIdx = index('user_email_idx').on(user.email)
export const userUsernameIdx = index('user_username_idx').on(user.username)
export const sessionTokenIdx = index('session_token_idx').on(session.token)
export const sessionUserIdx = index('session_user_idx').on(session.userId)
export const accountUserIdx = index('account_user_idx').on(account.userId)
export const verificationIdentifierIdx = index('verification_identifier_idx').on(verification.identifier)

export const userRelations = relations(user, ({ many }) => ({
    sessions: many(session),
    accounts: many(account),
    savedAssets: many(savedAsset),
    downloadHistory: many(downloadHistory),
}))

export const sessionRelations = relations(session, ({ one }) => ({
    user: one(user, {
        fields: [session.userId],
        references: [user.id],
    }),
}))

export const accountRelations = relations(account, ({ one }) => ({
    user: one(user, {
        fields: [account.userId],
        references: [user.id],
    }),
}))

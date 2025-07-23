import dotenv from 'dotenv'
import { drizzle as drizzleORM } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import { user, game, category, asset, tag, assetToTag, savedAsset } from '~/lib/db/schema'

type UserInsert = InferInsertModel<typeof user>
type GameInsert = InferInsertModel<typeof game>
type CategoryInsert = InferInsertModel<typeof category>
type AssetInsert = InferInsertModel<typeof asset>
type TagInsert = InferInsertModel<typeof tag>
type AssetToTagInsert = InferInsertModel<typeof assetToTag>
type SavedAssetInsert = InferInsertModel<typeof savedAsset>

dotenv.config({ path: '.dev.vars' })

if (process.env.ENVIRONMENT !== 'DEV') {
    console.error('This script can only be run in development mode')
    process.exit(1)
}

const client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_DATABASE_AUTH_TOKEN!,
})

const db = drizzleORM(client)

const pickRandom = <T>(arr: T[], count: number = 1): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, count)
}

async function seed() {
    console.log('Starting database seeding...')

    try {
        console.log('Creating users...')
        const usersToInsert: UserInsert[] = Array.from({ length: 10 }, () => ({
            name: faker.person.fullName(),
            username: faker.internet.userName().toLowerCase(),
            email: faker.internet.email().toLowerCase(),
            emailVerified: faker.datatype.boolean(),
            image: faker.image.avatar(),
            createdAt: faker.date.past({ years: 2 }),
            updatedAt: new Date(),
        }))
        const users = await db.insert(user).values(usersToInsert).returning()
        console.log(`Created ${users.length} users`)

        console.log('Creating games...')
        const gamesToInsert: GameInsert[] = [
            {
                slug: 'genshin-impact',
                name: 'Genshin Impact',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
            },
            {
                slug: 'honkai-impact-3rd',
                name: 'Honkai Impact: 3rd',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
            },
            {
                slug: 'honkai-star-rail',
                name: 'Honkai Star Rail',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
            },
        ]
        const games = await db.insert(game).values(gamesToInsert).returning()
        console.log(`Created ${games.length} games`)

        console.log('Creating categories...')
        const categoriesToInsert: CategoryInsert[] = [
            {
                name: 'Character Sheets',
                slug: 'character-sheets',
            },
            {
                name: 'Splash Art',
                slug: 'splash-art',
            },
            {
                name: 'Emotes',
                slug: 'emotes',
            },
        ]
        const categories = await db.insert(category).values(categoriesToInsert).returning()
        console.log(`Created ${categories.length} categories`)

        console.log('Creating tags...')
        const tagNames = ['fanmade', 'official', 'high-quality', 'unedited']
        const tagsToInsert: TagInsert[] = tagNames.map(name => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            color: faker.color.rgb(),
        }))
        const tags = await db.insert(tag).values(tagsToInsert).returning()
        console.log(`Created ${tags.length} tags`)

        console.log('Creating assets...')
        const fileExtensions = ['.png', '.jpg', '.jpeg']
        const assetsToInsert: AssetInsert[] = []

        for (let i = 0; i < 50; i++) {
            const randomGame = pickRandom(games, 1)[0]
            const randomCategory = pickRandom(categories, 1)[0]
            const randomUser = pickRandom(users, 1)[0]
            const randomExtension = pickRandom(fileExtensions, 1)[0]

            if (!randomGame || !randomCategory || !randomUser || !randomExtension) continue

            assetsToInsert.push({
                name: faker.lorem.words({ min: 2, max: 5 }),
                gameId: randomGame.id,
                categoryId: randomCategory.id,
                createdAt: faker.date.past({ years: 1 }),
                uploadedBy: randomUser.id,
                downloadCount: faker.number.int({ min: 0, max: 10000 }),
                viewCount: faker.number.int({ min: 0, max: 50000 }),
                hash: faker.string.alphanumeric(32),
                status: 'approved',
                isSuggestive: faker.datatype.boolean(),
                size: faker.number.int({ min: 100000, max: 10000000 }),
                extension: randomExtension,
            })
        }
        const assets = await db.insert(asset).values(assetsToInsert).returning()
        console.log(`Created ${assets.length} assets`)

        console.log('Linking assets to tags...')
        const assetToTagLinks: AssetToTagInsert[] = []
        for (const assetItem of assets) {
            const randomTags = pickRandom(tags, faker.number.int({ min: 1, max: 5 }))
            for (const tagItem of randomTags) {
                assetToTagLinks.push({
                    assetId: assetItem.id,
                    tagId: tagItem.id,
                })
            }
        }
        if (assetToTagLinks.length > 0) {
            await db.insert(assetToTag).values(assetToTagLinks)
        }
        console.log(`Created ${assetToTagLinks.length} asset-tag links`)

        console.log('Creating saved assets...')
        const savedAssetsToInsert: SavedAssetInsert[] = []
        for (const userItem of users) {
            const randomAssets = pickRandom(assets, faker.number.int({ min: 0, max: 10 }))
            for (const assetItem of randomAssets) {
                savedAssetsToInsert.push({
                    userId: userItem.id,
                    assetId: assetItem.id,
                    createdAt: faker.date.recent({ days: 30 }),
                })
            }
        }
        if (savedAssetsToInsert.length > 0) {
            await db.insert(savedAsset).values(savedAssetsToInsert)
        }
        console.log(`Created ${savedAssetsToInsert.length} saved assets`)

        console.log('Updating game statistics...')
        for (const gameItem of games) {
            const gameAssets = assets.filter(a => a.gameId === gameItem.id)
            await db
                .update(game)
                .set({
                    assetCount: gameAssets.length,
                    lastUpdated: new Date(),
                })
                .where(eq(game.id, gameItem.id))
        }
        console.log('Updated game statistics')

        console.log('\nDatabase seeding completed successfully!')
        console.log('\nSummary:')
        console.log(`   Users: ${users.length}`)
        console.log(`   Games: ${games.length}`)
        console.log(`   Categories: ${categories.length}`)
        console.log(`   Tags: ${tags.length}`)
        console.log(`   Assets: ${assets.length}`)
        console.log(`   Asset-Tag Links: ${assetToTagLinks.length}`)
        console.log(`   Saved Assets: ${savedAssetsToInsert.length}`)
    } catch (error) {
        console.error('Error during seeding:', error)
        process.exit(1)
    } finally {
        client.close()
    }
}

seed()

import dotenv from 'dotenv'
import { drizzle as drizzleORM } from 'drizzle-orm/libsql'
import { createClient } from '@libsql/client'
import { faker } from '@faker-js/faker'
import { eq } from 'drizzle-orm'
import type { InferInsertModel } from 'drizzle-orm'
import { user, game, category, asset, tag, assetToTag, categoryToGame, savedAsset } from '~/lib/db/schema'

type UserInsert = InferInsertModel<typeof user>
type GameInsert = InferInsertModel<typeof game>
type CategoryInsert = InferInsertModel<typeof category>
type AssetInsert = InferInsertModel<typeof asset>
type TagInsert = InferInsertModel<typeof tag>
type AssetToTagInsert = InferInsertModel<typeof assetToTag>
type CategoryToGameInsert = InferInsertModel<typeof categoryToGame>
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

const generateId = () => faker.string.alphanumeric(12)

const pickRandom = <T>(arr: T[], count: number = 1): T[] => {
    const shuffled = [...arr].sort(() => 0.5 - Math.random())
    return shuffled.slice(0, count)
}

async function seed() {
    console.log('Starting database seeding...')

    try {
        console.log('Creating users...')
        const users: UserInsert[] = []
        for (let i = 0; i < 10; i++) {
            const userData: UserInsert = {
                id: generateId(),
                name: faker.person.fullName(),
                username: faker.internet.userName().toLowerCase(),
                email: faker.internet.email().toLowerCase(),
                emailVerified: faker.datatype.boolean(),
                image: faker.image.avatar(),
                createdAt: faker.date.past({ years: 2 }),
                updatedAt: new Date(),
            }
            users.push(userData)
        }
        await db.insert(user).values(users)
        console.log(`Created ${users.length} users`)

        console.log('Creating games...')
        const games: GameInsert[] = [
            {
                id: generateId(),
                slug: 'genshin-impact',
                name: 'Genshin Impact',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
                categoryCount: 0,
            },
            {
                id: generateId(),
                slug: 'honkai-impact-3rd',
                name: 'Honkai Impact: 3rd',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
                categoryCount: 0,
            },
            {
                id: generateId(),
                slug: 'honkai-star-rail',
                name: 'Honkai Star Rail',
                lastUpdated: faker.date.recent({ days: 30 }),
                assetCount: 0,
                categoryCount: 0,
            },
        ]
        await db.insert(game).values(games)
        console.log(`Created ${games.length} games`)

        console.log('Creating categories...')
        const categories: CategoryInsert[] = [
            {
                id: generateId(),
                name: 'Character Sheets',
                slug: 'character-sheets',
            },
            {
                id: generateId(),
                name: 'Splash Art',
                slug: 'splash-art',
            },
            {
                id: generateId(),
                name: 'Emotes',
                slug: 'emotes',
            },
        ]
        await db.insert(category).values(categories)
        console.log(`Created ${categories.length} categories`)

        console.log('Linking categories to games...')
        const categoryToGameLinks: CategoryToGameInsert[] = []
        for (const gameItem of games) {
            const randomCategories = pickRandom(categories, faker.number.int({ min: 1, max: 3 }))
            for (const categoryItem of randomCategories) {
                categoryToGameLinks.push({
                    id: generateId(),
                    gameId: gameItem.id,
                    categoryId: categoryItem.id,
                })
            }
        }
        await db.insert(categoryToGame).values(categoryToGameLinks)
        console.log(`Created ${categoryToGameLinks.length} category-game links`)

        console.log('Creating tags...')
        const tagNames = ['fanmade', 'official', 'high-quality', 'unedited']
        const tags: TagInsert[] = tagNames.map(name => ({
            id: generateId(),
            name: name.charAt(0).toUpperCase() + name.slice(1),
            slug: name.toLowerCase().replace(/\s+/g, '-'),
            color: faker.color.rgb(),
        }))
        await db.insert(tag).values(tags)
        console.log(`Created ${tags.length} tags`)

        console.log('Creating assets...')
        const assets: AssetInsert[] = []
        const fileExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp']

        for (let i = 0; i < 50; i++) {
            const randomGame = pickRandom(games, 1)[0]
            if (!randomGame) continue

            const gameCategories = categoryToGameLinks
                .filter(ctg => ctg.gameId === randomGame.id)
                .map(ctg => categories.find(c => c.id === ctg.categoryId)!)
                .filter(Boolean)

            if (gameCategories.length === 0) continue

            const randomCategory = pickRandom(gameCategories, 1)[0]
            const randomUser = pickRandom(users, 1)[0]
            if (!randomCategory || !randomUser) continue

            const randomExtension = pickRandom(fileExtensions, 1)[0]
            if (!randomExtension) continue

            const assetData: AssetInsert = {
                id: generateId(),
                name: faker.lorem.words({ min: 2, max: 5 }),
                gameId: randomGame.id,
                categoryId: randomCategory.id,
                createdAt: faker.date.past({ years: 1 }),
                uploadedBy: randomUser.id,
                downloadCount: faker.number.int({ min: 0, max: 10000 }),
                viewCount: faker.number.int({ min: 0, max: 50000 }),
                hash: faker.string.alphanumeric(32),
                size: faker.number.int({ min: 100000, max: 10000000 }),
                extension: randomExtension,
            }
            assets.push(assetData)
        }
        await db.insert(asset).values(assets)
        console.log(`Created ${assets.length} assets`)

        console.log('Linking assets to tags...')
        const assetToTagLinks: AssetToTagInsert[] = []
        for (const assetItem of assets) {
            const randomTags = pickRandom(tags, faker.number.int({ min: 1, max: 5 }))
            for (const tagItem of randomTags) {
                assetToTagLinks.push({
                    id: generateId(),
                    assetId: assetItem.id,
                    tagId: tagItem.id,
                })
            }
        }
        await db.insert(assetToTag).values(assetToTagLinks)
        console.log(`Created ${assetToTagLinks.length} asset-tag links`)

        console.log('Creating saved assets...')
        const savedAssets: SavedAssetInsert[] = []
        for (const userItem of users) {
            const randomAssets = pickRandom(assets, faker.number.int({ min: 0, max: 10 }))
            for (const assetItem of randomAssets) {
                savedAssets.push({
                    id: generateId(),
                    userId: userItem.id,
                    assetId: assetItem.id,
                    createdAt: faker.date.recent({ days: 30 }),
                })
            }
        }
        await db.insert(savedAsset).values(savedAssets)
        console.log(`Created ${savedAssets.length} saved assets`)

        console.log('Updating game statistics...')
        for (const gameItem of games) {
            const gameAssets = assets.filter(a => a.gameId === gameItem.id)
            const gameCategories = categoryToGameLinks.filter(ctg => ctg.gameId === gameItem.id)

            await db
                .update(game)
                .set({
                    assetCount: gameAssets.length,
                    categoryCount: gameCategories.length,
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
        console.log(`   Category-Game Links: ${categoryToGameLinks.length}`)
        console.log(`   Tags: ${tags.length}`)
        console.log(`   Assets: ${assets.length}`)
        console.log(`   Asset-Tag Links: ${assetToTagLinks.length}`)
        console.log(`   Saved Assets: ${savedAssets.length}`)
    } catch (error) {
        console.error('Error during seeding:', error)
        process.exit(1)
    } finally {
        client.close()
    }
}

seed()

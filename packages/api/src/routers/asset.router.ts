import { z } from "zod";
import { createLogger } from "@skowt-monorepo/observability/server";
import { publicProcedure, serverMemberProcedure, router } from "../index";
import {
  db,
  asset,
  assetToTag,
  tag,
  game,
  category,
  eq,
  ne,
  and,
  desc,
  lt,
  gt,
  gte,
  inArray,
  asc,
  sql,
  or,
} from "@skowt-monorepo/db";
import * as cache from "../lib/cache";
import { withRateLimit, RATE_LIMITS } from "../lib/rate-limit";
import { paginationSchema, formatAssetResponse, type AssetRow } from "../lib/schemas";
import { keysetPage } from "../lib/pagination";
import { encodeCursor, decodeCursor } from "../lib/cursor";
import { assetNameCondition } from "../lib/fts";
import { enqueueLazyProfileRefresh, toPublicUser } from "../lib/discord-profile";

const log = createLogger("asset");

const TEN_MINUTES_MS = 10 * 60 * 1000;
const FIVE_MINUTES_MS = 5 * 60 * 1000;
const TWO_MINUTES_MS = 2 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// getRecentDrops payload: one entry per game with recent approved uploads
type RecentDrop = {
  game: { id: string; slug: string; name: string };
  count: number;
  latest: string;
  isNewGame: boolean;
  samples: Array<{ id: string; extension: string; isSuggestive: boolean }>;
};

/* getGameLanding payload: everything the SEO landing routes (/games/$slug and
   /games/$slug/$category) need for their SSR'd head + header - categories carry
   per-category approved counts so titles/descriptions can cite real numbers */
type GameLandingResult = {
  game: { id: string; slug: string; name: string };
  totalAssets: number;
  latestAssetAt: string | null;
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
};

// asset.sitemap page payload: lean rows for the web app's sitemap XML routes
type SitemapResult = {
  total: number;
  pageSize: number;
  items: Array<{
    id: string;
    name: string;
    extension: string;
    lastmod: string;
    gameSlug: string;
    gameName: string;
    categorySlug: string;
    categoryName: string;
  }>;
};

const SITEMAP_PAGE_SIZE = 10_000;

type FiltersResult = {
  games: Array<{
    id: string;
    slug: string;
    name: string;
    categories: Array<{ id: string; slug: string; name: string }>;
  }>;
  categories: Array<{ id: string; slug: string; name: string }>;
  tags: Array<{ id: string; slug: string; name: string }>;
};

/* getRelated payloads: a lean asset shape (only what the "Similar Assets" card
   needs) plus the keyset-paginated envelope. AssetRelatedRow is the subset of the
   relational row this procedure reads */
type RelatedItem = {
  id: string;
  name: string;
  hash: string;
  extension: string;
  /* dimensions ride along so similar-asset cards keep their real aspect
     ratios instead of falling back to the square placeholder box */
  metadata: { image?: { width: number; height: number } } | null;
  game: { id: string; slug: string; name: string };
  category: { id: string; slug: string; name: string };
};
type RelatedResult = { items: RelatedItem[]; nextCursor: string | null };
type AssetRelatedRow = RelatedItem & { createdAt: Date };

function formatQueryResult(items: AssetRow[], nextCursor: string | null | undefined) {
  return { items: items.map(formatAssetResponse), nextCursor };
}

const MUTUALLY_EXCLUSIVE_TAGS = ["official", "fanmade"];

const sortBySchema = z.enum(["date", "name", "downloads", "views"]).default("downloads");
const sortOrderSchema = z.enum(["asc", "desc"]).default("desc");
type AssetSortBy = z.infer<typeof sortBySchema>;

/* the cursor carries only the boundary asset's id (+ the sort it belongs to for
   validation). the sort value (incl. download/view counts) is re-derived
   server-side from the row, so it never goes on the wire. old cursors that still
   embed a `value` field stay compatible - we simply ignore it and read the id */
function parseAssetCursor(cursor: string, sortBy: AssetSortBy): { id: string } | null {
  return decodeCursor(cursor, (raw) =>
    raw.sortBy === sortBy && typeof raw.id === "string" ? { id: raw.id } : null,
  );
}

function encodeAssetCursor(sortBy: AssetSortBy, id: string): string {
  return encodeCursor({ sortBy, id });
}

const querySchema = z
  .object({
    name: z.string().trim().min(2).max(255).optional(),
    games: z.array(z.string().max(100)).max(20).optional(),
    categories: z.array(z.string().max(100)).max(20).optional(),
    tags: z.array(z.string().max(100)).max(20).optional(),
    sortBy: sortBySchema,
    sortOrder: sortOrderSchema,
    cursor: z.string().max(2048).optional(),
    limit: z.number().min(1).max(100).default(20),
  })
  .refine(
    (data) => {
      if (!data.tags) return true;
      const lowerTags = data.tags.map((t) => t.toLowerCase());
      const hasExclusiveTags = MUTUALLY_EXCLUSIVE_TAGS.filter((t) => lowerTags.includes(t));
      return hasExclusiveTags.length <= 1;
    },
    {
      message: "Cannot filter by both 'official' and 'fanmade' tags simultaneously",
      path: ["tags"],
    },
  );

export const assetRouter = router({
  query: publicProcedure
    .use(withRateLimit(RATE_LIMITS.search, { useIp: true }))
    .input(querySchema)
    .query(async ({ input }) => {
      const { name, games, categories, tags, sortBy, sortOrder, cursor, limit } = input;

      const cacheKey = cache.keys.assetQuery({
        query: name,
        games,
        categories,
        tags,
        sortBy,
        sortOrder,
        cursor,
        limit: String(limit),
      });

      const cached = await cache.get<ReturnType<typeof formatQueryResult>>(cacheKey);
      if (cached) return cached;

      const conditions = [eq(asset.status, "approved")];
      if (name) conditions.push(assetNameCondition(name));
      if (games && games.length > 0) conditions.push(inArray(asset.gameId, games));
      if (categories && categories.length > 0)
        conditions.push(inArray(asset.categoryId, categories));

      if (tags && tags.length > 0) {
        const lowerTags = tags.map((t) => t.toLowerCase());
        const tagRows = await db.query.tag.findMany({
          where: inArray(tag.slug, lowerTags),
          columns: { id: true },
        });
        if (tagRows.length === 0) return formatQueryResult([], null);

        const tagIds = tagRows.map((t) => t.id);
        const taggedAssetIds = db
          .select({ id: assetToTag.assetId })
          .from(assetToTag)
          .where(inArray(assetToTag.tagId, tagIds))
          .groupBy(assetToTag.assetId)
          .having(sql`COUNT(DISTINCT ${assetToTag.tagId}) = ${tagIds.length}`);
        conditions.push(inArray(asset.id, taggedAssetIds));
      }

      let cursorValue: string | number | Date | null = null;
      let cursorId: string | null = null;
      if (cursor) {
        const parsedCursor = parseAssetCursor(cursor, sortBy);
        if (parsedCursor) {
          /* re-derive the boundary asset's sort value from its id, so the cursor
             never has to embed it. if the asset is gone, cursorValue stays null and
             pagination falls back to the first page (rare, graceful) */
          const boundary = await db.query.asset.findFirst({
            /* status-filter the boundary lookup too, so a crafted cursor pointing
               at a pending/denied asset can't use its row as a paging anchor */
            where: and(eq(asset.id, parsedCursor.id), eq(asset.status, "approved")),
            columns: { name: true, createdAt: true, downloadCount: true, viewCount: true },
          });
          if (boundary) {
            cursorId = parsedCursor.id;
            switch (sortBy) {
              case "name":
                cursorValue = boundary.name;
                break;
              case "downloads":
                cursorValue = boundary.downloadCount;
                break;
              case "views":
                cursorValue = boundary.viewCount;
                break;
              default:
                cursorValue = boundary.createdAt;
                break;
            }
          }
        }
      }

      if (cursorValue !== null && cursorId) {
        const isDesc = sortOrder === "desc";
        const compareOp = isDesc ? lt : gt;

        switch (sortBy) {
          case "name": {
            /* name comparisons are NOCASE to match the ORDER BY below - with
               BINARY collation the lowercase legacy names (wanderer.moe-era
               slugs) sort after the entire uppercase alphabet, so "name" order
               visually splits the library into old/new eras */
            const nameCursor = cursorValue as string;
            conditions.push(
              or(
                isDesc
                  ? sql`${asset.name} COLLATE NOCASE < ${nameCursor}`
                  : sql`${asset.name} COLLATE NOCASE > ${nameCursor}`,
                and(
                  sql`${asset.name} COLLATE NOCASE = ${nameCursor}`,
                  compareOp(asset.id, cursorId),
                ),
              )!,
            );
            break;
          }
          case "downloads":
            conditions.push(
              or(
                compareOp(asset.downloadCount, cursorValue as number),
                and(eq(asset.downloadCount, cursorValue as number), compareOp(asset.id, cursorId)),
              )!,
            );
            break;
          case "views":
            conditions.push(
              or(
                compareOp(asset.viewCount, cursorValue as number),
                and(eq(asset.viewCount, cursorValue as number), compareOp(asset.id, cursorId)),
              )!,
            );
            break;
          default:
            conditions.push(
              or(
                compareOp(asset.createdAt, cursorValue as Date),
                and(eq(asset.createdAt, cursorValue as Date), compareOp(asset.id, cursorId)),
              )!,
            );
        }
      }

      const getSortColumn = () => {
        switch (sortBy) {
          case "name":
            return sql`${asset.name} COLLATE NOCASE`;
          case "downloads":
            return asset.downloadCount;
          case "views":
            return asset.viewCount;
          default:
            return asset.createdAt;
        }
      };

      const sortColumn = getSortColumn();
      const orderFn = sortOrder === "asc" ? asc : desc;
      const orderByClause = [orderFn(sortColumn), orderFn(asset.id)];

      const results = await db.query.asset.findMany({
        where: and(...conditions),
        orderBy: orderByClause,
        limit: limit + 1,
        with: { game: true, category: true, assetToTags: { with: { tag: true } } },
      });

      /* next cursor carries only the asset id; the sort value is re-derived
         server-side on the next request (keeps counts off the wire) */
      const { items, nextCursor } = keysetPage(results, limit, (last) =>
        encodeAssetCursor(sortBy, last.id),
      );

      const result = formatQueryResult(items, nextCursor);
      await cache.set(cacheKey, result, TWO_MINUTES_MS);
      return result;
    }),

  getById: publicProcedure
    .use(withRateLimit(RATE_LIMITS.query, { useIp: true }))
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const result = await db.query.asset.findFirst({
        where: and(eq(asset.id, input.id), eq(asset.status, "approved")),
        with: {
          game: true,
          category: true,
          uploader: {
            columns: {
              id: true,
              name: true,
              image: true,
              role: true,
              profileUpdatedAt: true,
            },
          },
          assetToTags: { with: { tag: true } },
        },
      });

      if (!result) return null;

      enqueueLazyProfileRefresh([result.uploader]);

      void db
        .update(asset)
        .set({ viewCount: sql`${asset.viewCount} + 1` })
        .where(eq(asset.id, input.id))
        .catch((error) => {
          log.warn("Failed to increment view count", { error });
        });

      return {
        id: result.id,
        name: result.name,
        hash: result.hash,
        extension: result.extension,
        size: result.size,
        isSuggestive: result.isSuggestive,
        metadata: result.metadata,
        createdAt: result.createdAt,
        game: {
          id: result.game.id,
          slug: result.game.slug,
          name: result.game.name,
          // attribution slot: rights holder + usage summary + official policy
          // url, all nullable (generic fallback copy renders when absent)
          publisher: result.game.publisher,
          usageTerms: result.game.usageTerms,
          termsUrl: result.game.termsUrl,
        },
        category: {
          id: result.category.id,
          slug: result.category.slug,
          name: result.category.name,
        },
        uploader: toPublicUser(result.uploader),
        tags: result.assetToTags.map((att) => ({
          id: att.tag.id,
          slug: att.tag.slug,
          name: att.tag.name,
        })),
      };
    }),

  /* no current FE caller; the home page uses asset.query with the default sort.
     tests retained as a behavioural contract for any future "recent uploads"
     surface (homepage carousel, etc.) */
  getRecent: publicProcedure
    .use(withRateLimit(RATE_LIMITS.query, { useIp: true }))
    .input(paginationSchema)
    .query(async ({ input }) => {
      const { cursor, limit } = input;

      const cacheKey = cache.keys.recentQuery({
        cursor,
        limit: String(limit),
      });

      const cached = await cache.get<ReturnType<typeof formatQueryResult>>(cacheKey);
      if (cached) return cached;

      const conditions = [eq(asset.status, "approved")];
      if (cursor) conditions.push(lt(asset.createdAt, new Date(cursor)));

      const results = await db.query.asset.findMany({
        where: and(...conditions),
        orderBy: [desc(asset.createdAt)],
        limit: limit + 1,
        with: { game: true, category: true, assetToTags: { with: { tag: true } } },
      });

      const { items, nextCursor } = keysetPage(
        results,
        limit,
        (last) => last.createdAt?.toISOString() ?? null,
      );

      const result = formatQueryResult(items as AssetRow[], nextCursor);
      await cache.set(cacheKey, result, TWO_MINUTES_MS);
      return result;
    }),

  getRelated: publicProcedure
    .use(withRateLimit(RATE_LIMITS.query, { useIp: true }))
    .input(
      z.object({
        assetId: z.string(),
        limit: z.number().min(1).max(20).default(12),
        cursor: z.string().optional(),
      }),
    )
    .query(async ({ input }) => {
      const { assetId, limit, cursor } = input;

      /* paginated + cached: the detail page infinite-scrolls this, so identical
         (assetId, limit, cursor) pages are served from cache -- keeps the tiered
         fan-out off the DB on repeat views. TTL is short so new same-game assets
         surface within a couple minutes */
      const cacheKey = cache.keys.related({ assetId, limit: String(limit), cursor });
      const cached = await cache.get<RelatedResult>(cacheKey);
      if (cached) return cached;

      const sourceAsset = await db.query.asset.findFirst({
        where: eq(asset.id, assetId),
        columns: { gameId: true, categoryId: true },
      });

      if (!sourceAsset) return { items: [], nextCursor: null };

      /* tiered relatedness, most-related first - the tiers are disjoint, so an
         asset lands in exactly one:
           0. same game + same category   (the strongest match)
           1. same game, other categories (still the same game)
           2. same category, other games  (the only "drift", and it stays on-type)
         pagination walks the tiers in order and keyset-continues within one, so
         the relevance ordering holds across pages without offset drift */
      const tiers = [
        and(eq(asset.gameId, sourceAsset.gameId), eq(asset.categoryId, sourceAsset.categoryId)),
        and(eq(asset.gameId, sourceAsset.gameId), ne(asset.categoryId, sourceAsset.categoryId)),
        and(ne(asset.gameId, sourceAsset.gameId), eq(asset.categoryId, sourceAsset.categoryId)),
      ];

      // cursor = { t: tier index, c: createdAt ms, i: id } of the last item served
      const parsed = cursor
        ? decodeCursor(cursor, (raw) =>
            typeof raw.t === "number" &&
            Number.isInteger(raw.t) &&
            raw.t >= 0 &&
            typeof raw.c === "number" &&
            typeof raw.i === "string"
              ? { t: raw.t, c: raw.c, i: raw.i }
              : null,
          )
        : null;
      const startTier = parsed?.t ?? 0;

      /* over-fetch one across the tier walk to detect "has more" and derive the
         next cursor. only the starting tier applies the keyset; later tiers begin
         fresh (prior pages never touched them) */
      const collected: Array<{ tier: number; createdAt: Date; row: AssetRelatedRow }> = [];
      for (let t = startTier; t < tiers.length && collected.length < limit + 1; t++) {
        const keyset =
          t === startTier && parsed
            ? or(
                lt(asset.createdAt, new Date(parsed.c)),
                and(eq(asset.createdAt, new Date(parsed.c)), lt(asset.id, parsed.i)),
              )
            : undefined;

        const rows = await db.query.asset.findMany({
          where: and(eq(asset.status, "approved"), ne(asset.id, assetId), tiers[t], keyset),
          orderBy: [desc(asset.createdAt), desc(asset.id)],
          limit: limit + 1 - collected.length,
          with: { game: true, category: true },
        });
        for (const a of rows) collected.push({ tier: t, createdAt: a.createdAt, row: a });
      }

      const hasMore = collected.length > limit;
      const page = hasMore ? collected.slice(0, limit) : collected;
      const last = page[page.length - 1];
      const nextCursor =
        hasMore && last
          ? encodeCursor({ t: last.tier, c: last.createdAt.getTime(), i: last.row.id })
          : null;

      const result: RelatedResult = {
        items: page.map(({ row }) => ({
          id: row.id,
          name: row.name,
          hash: row.hash,
          extension: row.extension,
          metadata: row.metadata,
          game: { id: row.game.id, slug: row.game.slug, name: row.game.name },
          category: { id: row.category.id, slug: row.category.slug, name: row.category.name },
        })),
        nextCursor,
      };

      await cache.set(cacheKey, result, TWO_MINUTES_MS);
      return result;
    }),

  getFilters: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .query(async () => {
      const cacheKey = cache.keys.filters;

      const cached = await cache.get<FiltersResult>(cacheKey);
      if (cached) return cached;

      const [games, categories, tags] = await Promise.all([
        db.query.game.findMany({
          orderBy: (game) => [asc(game.name)],
          with: {
            gameToCategories: {
              with: { category: true },
            },
          },
        }),
        db.query.category.findMany({
          orderBy: (category) => [asc(category.name)],
        }),
        db.query.tag.findMany({
          orderBy: (tag) => [asc(tag.name)],
        }),
      ]);

      const result: FiltersResult = {
        games: games.map((g) => ({
          id: g.id,
          slug: g.slug,
          name: g.name,
          categories: g.gameToCategories.map((gtc) => ({
            id: gtc.category.id,
            slug: gtc.category.slug,
            name: gtc.category.name,
          })),
        })),
        categories: categories.map((c) => ({
          id: c.id,
          slug: c.slug,
          name: c.name,
        })),
        tags: tags.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
        })),
      };

      await cache.set(cacheKey, result, TEN_MINUTES_MS);
      return result;
    }),

  /* "recently added" homepage band: latest drop per game, newest 8 games -
     windowless selection so the row stays full on wide screens even in quiet
     months (timestamps keep it honest). the 30-day window survives only as
     the new test: a game whose first asset landed inside it is a new game.
     count = the latest drop's burst (assets within 7 days of the game's
     newest asset), not the all-time total - a group-wide count(*) once
     rendered "+4,201 assets" for a catalog game that got 2 new sheets */
  getRecentDrops: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .query(async (): Promise<{ drops: RecentDrop[] }> => {
      const cacheKey = cache.keys.drops;
      const cached = await cache.get<{ drops: RecentDrop[] }>(cacheKey);
      if (cached) return cached;

      const since = new Date(Date.now() - THIRTY_DAYS_MS);
      const groups = await db
        .select({
          gameId: asset.gameId,
          count: sql<number>`count(*)`,
          latest: sql<number>`max(${asset.createdAt})`,
          first: sql<number>`min(${asset.createdAt})`,
        })
        .from(asset)
        .where(eq(asset.status, "approved"))
        .groupBy(asset.gameId)
        .orderBy(sql`max(${asset.createdAt}) desc`)
        .limit(8);

      if (groups.length === 0) {
        const empty = { drops: [] as RecentDrop[] };
        await cache.set(cacheKey, empty, FIVE_MINUTES_MS);
        return empty;
      }

      const BURST_WINDOW_S = 7 * 24 * 60 * 60;
      const gameIds = groups.map((g) => g.gameId);

      /* one game lookup + one grouped burst count + concurrent per-game sample
         reads, instead of three sequential round-trips per game (getGameLanding
         below uses the same inArray idiom). each game's burst window is off its
         own latest drop, so the counts go in a single query whose predicate ORs
         the per-game (game, since-its-window) conditions */
      const [gameRows, burstRows, sampleGroups] = await Promise.all([
        db.query.game.findMany({ where: inArray(game.id, gameIds) }),
        db
          .select({ gameId: asset.gameId, n: sql<number>`count(*)` })
          .from(asset)
          .where(
            and(
              eq(asset.status, "approved"),
              or(
                ...groups.map((g) =>
                  and(
                    eq(asset.gameId, g.gameId),
                    gte(asset.createdAt, new Date((g.latest - BURST_WINDOW_S) * 1000)),
                  ),
                ),
              ),
            ),
          )
          .groupBy(asset.gameId),
        Promise.all(
          groups.map((g) =>
            db.query.asset
              .findMany({
                where: and(eq(asset.gameId, g.gameId), eq(asset.status, "approved")),
                orderBy: [desc(asset.createdAt)],
                limit: 3,
                columns: { id: true, extension: true, isSuggestive: true },
              })
              .then((samples) => [g.gameId, samples] as const),
          ),
        ),
      ]);

      const gameById = new Map(gameRows.map((g) => [g.id, g]));
      const burstByGame = new Map(burstRows.map((b) => [b.gameId, b.n]));
      const samplesByGame = new Map(sampleGroups);

      const drops: RecentDrop[] = groups.flatMap((g) => {
        const gameRow = gameById.get(g.gameId);
        if (!gameRow) return [];
        return [
          {
            game: { id: gameRow.id, slug: gameRow.slug, name: gameRow.name },
            count: burstByGame.get(g.gameId) ?? 0,
            latest: new Date(g.latest * 1000).toISOString(),
            isNewGame: new Date(g.first * 1000) > since,
            samples: samplesByGame.get(g.gameId) ?? [],
          },
        ];
      });

      const result = { drops };
      await cache.set(cacheKey, result, FIVE_MINUTES_MS);
      return result;
    }),

  /* SEO landing data for /games/$slug (and its category child): the game row
     plus per-category approved-asset counts. null for an unknown slug (the
     route turns that into a 404); misses are deliberately not cached so a
     freshly added game appears immediately */
  getGameLanding: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .input(z.object({ slug: z.string().max(100) }))
    .query(async ({ input }): Promise<GameLandingResult | null> => {
      const cacheKey = cache.keys.landing(input.slug);
      const cached = await cache.get<GameLandingResult>(cacheKey);
      if (cached) return cached;

      const gameRow = await db.query.game.findFirst({ where: eq(game.slug, input.slug) });
      if (!gameRow) return null;

      const groups = await db
        .select({
          categoryId: asset.categoryId,
          count: sql<number>`count(*)`,
          latest: sql<number>`max(${asset.createdAt})`,
        })
        .from(asset)
        .where(and(eq(asset.gameId, gameRow.id), eq(asset.status, "approved")))
        .groupBy(asset.categoryId);

      const categoryRows = groups.length
        ? await db.query.category.findMany({
            where: inArray(
              category.id,
              groups.map((g) => g.categoryId),
            ),
          })
        : [];
      const categoryById = new Map(categoryRows.map((c) => [c.id, c]));

      const categories = groups
        .flatMap((g) => {
          const c = categoryById.get(g.categoryId);
          return c ? [{ id: c.id, slug: c.slug, name: c.name, count: g.count }] : [];
        })
        .sort((a, b) => b.count - a.count);

      const latest = groups.reduce<number>((max, g) => Math.max(max, g.latest ?? 0), 0);
      const result: GameLandingResult = {
        game: { id: gameRow.id, slug: gameRow.slug, name: gameRow.name },
        totalAssets: groups.reduce((sum, g) => sum + g.count, 0),
        latestAssetAt: latest ? new Date(latest * 1000).toISOString() : null,
        categories,
      };

      await cache.set(cacheKey, result, TEN_MINUTES_MS);
      return result;
    }),

  /* sitemap feed for the web app's /sitemap-assets.xml route: approved assets
     in stable createdAt order, 10k per page. heavily cached - Googlebot fetches
     every page in one crawl pass, and the data only moves on new approvals */
  sitemap: publicProcedure
    .use(withRateLimit(RATE_LIMITS.public, { useIp: true }))
    .input(z.object({ page: z.number().int().min(1).max(1000) }))
    .query(async ({ input }): Promise<SitemapResult> => {
      const cacheKey = cache.keys.sitemap(String(input.page));
      const cached = await cache.get<SitemapResult>(cacheKey);
      if (cached) return cached;

      const [[totalRow], rows] = await Promise.all([
        db
          .select({ n: sql<number>`count(*)` })
          .from(asset)
          .where(eq(asset.status, "approved")),
        db
          .select({
            id: asset.id,
            name: asset.name,
            extension: asset.extension,
            createdAt: asset.createdAt,
            gameSlug: game.slug,
            gameName: game.name,
            categorySlug: category.slug,
            categoryName: category.name,
          })
          .from(asset)
          .innerJoin(game, eq(asset.gameId, game.id))
          .innerJoin(category, eq(asset.categoryId, category.id))
          .where(eq(asset.status, "approved"))
          .orderBy(asc(asset.createdAt), asc(asset.id))
          .limit(SITEMAP_PAGE_SIZE)
          .offset((input.page - 1) * SITEMAP_PAGE_SIZE),
      ]);

      const result: SitemapResult = {
        total: totalRow?.n ?? 0,
        pageSize: SITEMAP_PAGE_SIZE,
        items: rows.map((r) => ({
          id: r.id,
          name: r.name,
          extension: r.extension,
          lastmod: r.createdAt.toISOString(),
          gameSlug: r.gameSlug,
          gameName: r.gameName,
          categorySlug: r.categorySlug,
          categoryName: r.categoryName,
        })),
      };

      await cache.set(cacheKey, result, ONE_HOUR_MS);
      return result;
    }),

  recordDownload: serverMemberProcedure
    .use(withRateLimit({ limit: 20, windowSeconds: 60 }))
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      await db
        .update(asset)
        .set({ downloadCount: sql`${asset.downloadCount} + 1` })
        .where(and(eq(asset.id, input.id), eq(asset.status, "approved")));
      return { success: true };
    }),
});

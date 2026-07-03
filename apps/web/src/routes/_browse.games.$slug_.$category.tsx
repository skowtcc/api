import { createFileRoute, notFound } from "@tanstack/react-router";
import { GameLandingHero } from "@/components/games/game-landing-header";
import { validateAssetSearch } from "@/lib/asset-search";
import { buildAssetQueryInput } from "@/hooks/use-server-assets";
import { SITE_URL, GAME_ALIASES, JsonLd, formatCount } from "@/lib/seo";

/* SEO landing page for a game+category pair (the head terms: "genshin impact
   emotes", "project sekai stamps"). The `$slug_` filename segment opts out of
   nesting under the game route - this is a sibling under the _browse layout.
   Both the game and the category are pinned by the path; changing the
   category set navigates back to /games/$slug?categories=... (see commit()),
   and the shared layout keeps the browser mounted through it */
export const Route = createFileRoute("/_browse/games/$slug_/$category")({
  component: GameCategoryPage,
  validateSearch: validateAssetSearch,
  loader: async ({ params, context }) => {
    const landing = await context.queryClient.ensureQueryData(
      context.trpc.asset.getGameLanding.queryOptions({ slug: params.slug }),
    );
    const category = landing?.categories.find((c) => c.slug === params.category);
    if (!landing || !category) throw notFound();

    const input = buildAssetQueryInput(
      {
        search: "",
        games: [landing.game.id],
        categories: [category.id],
        tags: [],
        sortBy: "date",
        sortOrder: "desc",
      },
      "",
    );
    await context.queryClient.ensureInfiniteQueryData(
      context.trpc.asset.query.infiniteQueryOptions(input, {
        getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
      }),
    );

    return {
      landing,
      category,
      pinned: {
        gameId: landing.game.id,
        gameSlug: landing.game.slug,
        categoryId: category.id,
        categorySlug: category.slug,
      },
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "skowt.cc" }] };
    const { landing, category } = loaderData;
    const { game } = landing;
    const aliases = GAME_ALIASES[game.slug];
    const aliasSuffix = aliases?.length ? ` (${aliases.join(", ")})` : "";
    const title = `${game.name} ${category.name} - skowt.cc`;
    const description = `Download ${formatCount(category.count)} free ${game.name}${aliasSuffix} ${category.name.toLowerCase()}. Community-driven game asset database, previously wanderer.moe.`;
    const url = `${SITE_URL}/games/${game.slug}/${category.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "skowt.cc" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

// the layout owns the AssetBrowser; this route contributes only the hero
function GameCategoryPage() {
  const { landing, category } = Route.useLoaderData();
  const { game } = landing;
  const gameUrl = `${SITE_URL}/games/${game.slug}`;
  const url = `${gameUrl}/${category.slug}`;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${game.name} ${category.name}`,
          url,
          description: `${formatCount(category.count)} free ${game.name} ${category.name.toLowerCase()} on skowt.cc`,
          isPartOf: { "@type": "WebSite", name: "skowt.cc", url: SITE_URL },
          about: { "@type": "VideoGame", name: game.name },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Games", item: SITE_URL },
            { "@type": "ListItem", position: 2, name: game.name, item: gameUrl },
            { "@type": "ListItem", position: 3, name: category.name, item: url },
          ],
        }}
      />
      <GameLandingHero landing={landing} activeCategory={category} />
    </>
  );
}

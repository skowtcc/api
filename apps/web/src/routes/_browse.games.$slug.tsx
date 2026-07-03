import { createFileRoute, notFound } from "@tanstack/react-router";
import { GameLandingHero } from "@/components/games/game-landing-header";
import { validateAssetSearch } from "@/lib/asset-search";
import { buildAssetQueryInput } from "@/hooks/use-server-assets";
import { SITE_URL, GAME_ALIASES, JsonLd, formatCount } from "@/lib/seo";

/* SEO landing page for a game: the shared _browse AssetBrowser with the game
   filter pinned by the path, giving every game a crawlable URL with an SSR'd
   unique head + first page of assets. In-page filters (categories, tags,
   search, sort) stay here as query params; toggling another game navigates
   to "/?games=..." (see commit() in use-server-assets) - the layout keeps the
   browser mounted through that, so open popovers survive */
export const Route = createFileRoute("/_browse/games/$slug")({
  component: GamePage,
  validateSearch: validateAssetSearch,
  loader: async ({ params, context }) => {
    const landing = await context.queryClient.ensureQueryData(
      context.trpc.asset.getGameLanding.queryOptions({ slug: params.slug }),
    );
    if (!landing) throw notFound();

    /* warm the clean-state first page so the SSR HTML carries the asset grid
       (the SEO entry case); filtered variants fetch client-side as on "/" */
    const input = buildAssetQueryInput(
      {
        search: "",
        games: [landing.game.id],
        categories: [],
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
      ...landing,
      pinned: { gameId: landing.game.id, gameSlug: landing.game.slug },
    };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return { meta: [{ title: "skowt.cc" }] };
    const { game, totalAssets, categories } = loaderData;
    const aliases = GAME_ALIASES[game.slug];
    const aliasSuffix = aliases?.length ? ` (${aliases.join(", ")})` : "";
    const topCategories = categories
      .slice(0, 4)
      .map((c) => c.name.toLowerCase())
      .join(", ");
    const title = `${game.name} Assets - skowt.cc`;
    const description = `Browse and download ${formatCount(totalAssets)} free ${game.name}${aliasSuffix} assets${topCategories ? ` - ${topCategories}` : ""}. Community-driven game asset database, previously wanderer.moe.`;
    const url = `${SITE_URL}/games/${game.slug}`;
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
function GamePage() {
  const landing = Route.useLoaderData();
  const { game, totalAssets } = landing;

  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "CollectionPage",
          name: `${game.name} Assets`,
          url: `${SITE_URL}/games/${game.slug}`,
          description: `${formatCount(totalAssets)} free ${game.name} assets on skowt.cc`,
          isPartOf: { "@type": "WebSite", name: "skowt.cc", url: SITE_URL },
          about: { "@type": "VideoGame", name: game.name },
        }}
      />
      <GameLandingHero landing={landing} />
    </>
  );
}

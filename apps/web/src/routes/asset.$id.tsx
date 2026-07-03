import type { CSSProperties } from "react";
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useInfiniteQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { AssetCard } from "@/components/assets/asset-card";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LoadMore } from "@/components/assets/load-more";
import { AssetActions } from "@/components/assets/asset-actions";
import { AssetDetailSkeleton } from "@/components/assets/asset-detail-skeleton";
import { GoBack } from "@/components/ui/go-back";
import { EmptyState } from "@/components/ui/empty-state";
import { UserHandle } from "@/components/ui/user-handle";
import { FormatChip } from "@/components/ui/format-chip";
import { Chip } from "@/components/ui/chip";
import { IconTagFilled, IconDatabase, IconClock } from "nucleo-micro-bold";
import { timeAgoLong } from "@/lib/time";
import { useGameName } from "@/hooks/use-game-name";
import { useAuth } from "@/hooks/use-auth";
import { useRefreshDiscordProfile } from "@/hooks/use-refresh-discord-profile";

import { useTRPC } from "@/utils/trpc";
import {
  transformAssetDetail,
  transformRelatedAssets,
  buildRawAssetUrl,
  cdnAssetUrl,
} from "@/lib/api-transforms";
import { SITE_URL, JsonLd } from "@/lib/seo";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const Route = createFileRoute("/asset/$id")({
  component: AssetDetailComponent,
  pendingComponent: AssetDetailPendingComponent,
  loader: async ({ params, context }) => {
    await context.queryClient.ensureQueryData(
      context.trpc.asset.getById.queryOptions({ id: params.id }),
    );
    const cached = context.queryClient.getQueryData<{
      name: string;
      extension: string;
      game: { name: string };
      category: { name: string };
    }>(context.trpc.asset.getById.queryKey({ id: params.id }));
    return {
      id: params.id,
      name: cached?.name ?? null,
      extension: cached?.extension ?? null,
      gameName: cached?.game?.name ?? null,
      categoryName: cached?.category?.name ?? null,
    };
  },
  head: ({ loaderData }) => {
    const { id, name, extension, gameName, categoryName } = loaderData ?? {};
    if (!name || !id) {
      return {
        meta: [
          { title: "Asset - skowt.cc" },
          {
            name: "description",
            content: "View and download asset on skowt.cc",
          },
        ],
      };
    }

    const title = `${name} - ${gameName} ${categoryName} - skowt.cc`;
    const description = `View ${name} (${extension?.toUpperCase()}) from ${gameName} / ${categoryName} on skowt.cc`;
    const url = `${SITE_URL}/asset/${id}`;
    const image = cdnAssetUrl(id);

    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { property: "og:site_name", content: "skowt.cc" },
        { property: "og:image", content: image },
        /* 300px thumb suits the small summary card; the old
           summary_large_image declared no image at all */
        { name: "twitter:card", content: "summary" },
        { name: "twitter:image", content: image },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
});

function AssetDetailPendingComponent() {
  return (
    <div className="page-container">
      <GoBack className="mb-6" />
      <AssetDetailSkeleton />
    </div>
  );
}

function AssetDetailComponent() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const trpc = useTRPC();
  const { isAuthenticated } = useAuth();
  const refreshDiscordProfile = useRefreshDiscordProfile();

  const { data: assetData } = useSuspenseQuery(trpc.asset.getById.queryOptions({ id }));

  /* Similar Assets infinite-scrolls the tiered getRelated feed, same cursor
     pattern as useServerAssets; non-suspense so the detail page paints without
     waiting on it (getById is the suspense boundary via the route loader) */
  const {
    data: relatedData,
    fetchNextPage: fetchMoreRelated,
    hasNextPage: hasMoreRelated,
    isFetchingNextPage: isFetchingMoreRelated,
  } = useInfiniteQuery({
    ...trpc.asset.getRelated.infiniteQueryOptions(
      { assetId: id, limit: 12 },
      { getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined },
    ),
  });

  if (!assetData) {
    return (
      <div className="page-container">
        <GoBack className="mb-6" />
        <EmptyState
          message="Asset not found"
          action={{
            label: "Browse assets",
            onClick: () => navigate({ to: "/" }),
          }}
        />
      </div>
    );
  }

  const asset = transformAssetDetail(assetData);
  const relatedAssets = transformRelatedAssets(
    relatedData?.pages.flatMap((page) => page.items) ?? [],
  );
  const displayGameName = useGameName(asset.gameName);

  const rawAssetUrl = buildRawAssetUrl(asset.id, asset.extension);

  return (
    <div className="page-container">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "ImageObject",
          name: asset.name,
          contentUrl: rawAssetUrl,
          thumbnailUrl: cdnAssetUrl(asset.id),
          description: `${asset.name} - free ${asset.gameName} ${asset.categoryName} asset`,
          ...(asset.dimensions
            ? { width: asset.dimensions.width, height: asset.dimensions.height }
            : {}),
          isPartOf: {
            "@type": "CollectionPage",
            name: `${asset.gameName} Assets`,
            url: `${SITE_URL}/games/${asset.gameSlug}`,
          },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Games", item: SITE_URL },
            {
              "@type": "ListItem",
              position: 2,
              name: asset.gameName,
              item: `${SITE_URL}/games/${asset.gameSlug}`,
            },
            {
              "@type": "ListItem",
              position: 3,
              name: asset.categoryName,
              item: `${SITE_URL}/games/${asset.gameSlug}/${asset.categorySlug}`,
            },
            { "@type": "ListItem", position: 4, name: asset.name },
          ],
        }}
      />
      <GoBack className="mb-8" />

      <div className="flex flex-col lg:flex-row gap-10">
        <div className="w-full lg:w-1/2 shrink-0">
          <div
            className={cn(
              "relative rounded-2xl overflow-hidden bg-card shadow-md flex items-center justify-center lg:min-h-0 lg:aspect-square",
              /* known ratio -> reserve the box on mobile (no jump on load); the
                 desktop square frame is preserved by lg:aspect-square overriding it */
              asset.dimensions ? "[aspect-ratio:var(--ar)]" : "min-h-[280px]",
            )}
            style={
              asset.dimensions
                ? ({
                    "--ar": `${asset.dimensions.width} / ${asset.dimensions.height}`,
                  } as CSSProperties)
                : undefined
            }
          >
            <div
              className="absolute inset-0 opacity-[0.008] pointer-events-none z-10"
              style={{
                backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
              }}
            />
            <img
              src={rawAssetUrl}
              alt={`${asset.name} from ${asset.gameName}`}
              className={cn(
                "max-w-full max-h-[70vh] lg:max-h-full object-contain relative z-0",
                !isAuthenticated && "select-none pointer-events-none",
              )}
              draggable={isAuthenticated}
              onContextMenu={isAuthenticated ? undefined : (e) => e.preventDefault()}
            />
          </div>
        </div>

        <div className="w-full lg:w-1/2 min-w-0 space-y-6">
          <div className="space-y-5">
            <div className="space-y-2">
              <h1 className="text-display text-3xl lg:text-4xl text-foreground leading-tight break-words">
                {asset.name}
              </h1>
              {/* breadcrumb links to the game/category landing pages - the
                  internal-link path crawlers walk from 39k asset pages up */}
              <p className="text-sm text-muted-foreground">
                <Link
                  to="/games/$slug"
                  params={{ slug: asset.gameSlug }}
                  className="hover:text-foreground transition-colors"
                >
                  {displayGameName}
                </Link>
                <span className="opacity-60">
                  {" / "}
                  <Link
                    to="/games/$slug/$category"
                    params={{ slug: asset.gameSlug, category: asset.categorySlug }}
                    className="hover:text-foreground transition-colors"
                  >
                    {asset.categoryName}
                  </Link>
                </span>
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <FormatChip extension={asset.extension} />
              {asset.tags.map((tag) => (
                <Chip
                  key={tag}
                  fill="flat"
                  flatPct={14}
                  icon={<IconTagFilled className="size-3" />}
                >
                  {tag}
                </Chip>
              ))}
              {asset.size != null && asset.size > 0 && (
                <Chip
                  fill="flat"
                  flatPct={20}
                  tone="var(--chip-neutral-bg)"
                  textTone="var(--chip-neutral-fg)"
                  className="tabular-nums"
                  icon={<IconDatabase className="size-3" />}
                >
                  {formatSize(asset.size)}
                </Chip>
              )}
            </div>
            {asset.uploader && (
              <div className="flex items-center gap-3">
                {asset.uploader.avatar ? (
                  <img
                    src={asset.uploader.avatar}
                    alt={asset.uploader.username}
                    className="size-9 rounded-full object-cover shrink-0"
                    onError={() => refreshDiscordProfile(asset.uploader!.id)}
                  />
                ) : (
                  <div className="size-9 rounded-full bg-muted flex items-center justify-center text-xs font-medium text-muted-foreground shrink-0">
                    {asset.uploader.username.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 leading-tight">
                  <UserHandle
                    username={asset.uploader.username}
                    role={asset.uploader.role}
                    className="text-sm"
                  />
                  {asset.uploadDate && (
                    <p className="flex items-center gap-1 text-xs text-muted-foreground/55 mt-1">
                      <IconClock className="size-3 shrink-0" />
                      Uploaded {timeAgoLong(asset.uploadDate)}
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>

          <AssetActions
            assetId={asset.id}
            assetUrl={asset.url}
            assetName={asset.name}
            gameName={asset.gameName}
            categoryName={asset.categoryName}
            extension={asset.extension}
            tags={asset.tags}
            attribution={asset.attribution}
          />
        </div>
      </div>

      {relatedAssets.length > 0 && (
        <div className="mt-16">
          <h2 className="text-display text-2xl lg:text-3xl text-foreground mb-8">Similar Assets</h2>
          <AssetGrid>
            {relatedAssets.map((similarAsset) => (
              <AssetCard
                key={similarAsset.id}
                id={similarAsset.id}
                name={similarAsset.name}
                gameName={similarAsset.gameName}
                categoryName={similarAsset.categoryName}
                url={similarAsset.url}
                extension={similarAsset.extension}
                dimensions={similarAsset.dimensions}
              />
            ))}
          </AssetGrid>
          <LoadMore
            hasNextPage={hasMoreRelated}
            isFetchingNextPage={isFetchingMoreRelated}
            fetchNextPage={fetchMoreRelated}
          />
        </div>
      )}
    </div>
  );
}

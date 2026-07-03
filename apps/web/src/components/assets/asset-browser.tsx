import type { JSX } from "react";
import { AssetCard } from "@/components/assets/asset-card";
import { AssetListItem } from "@/components/assets/asset-list-item";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LoadMore } from "@/components/assets/load-more";
import { AssetFilterBar, type AssetFilterState } from "@/components/assets/asset-filters";

import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useFilters } from "@/hooks/use-filters";
import { useSettings } from "@/hooks/use-settings";
import { buildAssetUrl, cdnAssetUrl } from "@/lib/api-transforms";
import { useServerAssets, useServerBookmarks, type PinnedBrowse } from "@/hooks/use-server-assets";

// shown when filters match nothing (the raccoon-in-a-bin)
const NO_MATCH_IMAGE = cdnAssetUrl("0198390e-691c-7198-99e5-9ffaccd166d2");

interface AssetBrowserProps {
  mode: "assets" | "bookmarks";
  header?: JSX.Element;
  /** path-pinned game/category on the /games/$slug landing routes */
  pinned?: PinnedBrowse;
  emptyMessage?: string;
  /** illustration for the plain (unfiltered) empty state */
  emptyImage?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
}

export function AssetBrowser({
  mode,
  header,
  pinned,
  emptyMessage = "No assets found",
  emptyImage,
  emptyAction,
}: AssetBrowserProps) {
  const { games, tags } = useFilters();
  const { settings } = useSettings();
  const isListView = settings.viewMode === "list";

  const assetsHook = useServerAssets(games, mode === "assets", pinned);
  const bookmarksHook = useServerBookmarks(games, mode === "bookmarks", pinned);

  const hook = mode === "bookmarks" ? bookmarksHook : assetsHook;

  const {
    items,
    filters,
    setSearch,
    toggleGame,
    toggleCategory,
    toggleTag,
    setSortBy,
    setSortOrder,
    clearFilters,
    activeFilterCount,
    availableCategories,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = hook;

  return (
    <div className="page-container">
      {header}

      <AssetFilterBar
        games={games}
        tags={tags}
        filters={filters as AssetFilterState}
        availableCategories={availableCategories}
        setSearch={setSearch}
        toggleGame={toggleGame}
        toggleCategory={toggleCategory}
        toggleTag={toggleTag}
        setSortBy={setSortBy}
        setSortOrder={setSortOrder}
        clearFilters={clearFilters}
        activeFilterCount={activeFilterCount}
      />

      <div className="mt-4">
        {isLoading ? (
          isListView ? (
            <AssetListSkeleton />
          ) : (
            <AssetGridSkeleton />
          )
        ) : items.length > 0 ? (
          <>
            {isListView ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {items.map((item) => (
                  <AssetListItem
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    gameName={item.game.name}
                    categoryName={item.category.name}
                    url={buildAssetUrl(item.id, item.extension)}
                    extension={item.extension}
                    size={item.size}
                    isSuggestive={item.isSuggestive}
                  />
                ))}
              </div>
            ) : (
              <AssetGrid>
                {items.map((item) => (
                  <AssetCard
                    key={item.id}
                    id={item.id}
                    name={item.name}
                    gameName={item.game.name}
                    categoryName={item.category.name}
                    url={buildAssetUrl(item.id, item.extension)}
                    extension={item.extension}
                    isSuggestive={item.isSuggestive}
                    dimensions={item.metadata?.image}
                  />
                ))}
              </AssetGrid>
            )}

            <LoadMore
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
            {/* runway: while more pages exist, ghost cards extend the
                document so fast scrolling never hits the floor - the next
                page replaces them under the user's momentum */}
            {hasNextPage && (isListView ? <AssetListSkeleton /> : <AssetGridSkeleton />)}
          </>
        ) : (
          <EmptyState
            message={activeFilterCount > 0 ? "No assets match your filters" : emptyMessage}
            image={activeFilterCount > 0 ? NO_MATCH_IMAGE : emptyImage}
            action={
              activeFilterCount > 0
                ? { label: "Clear filters", onClick: clearFilters }
                : emptyAction
            }
          />
        )}
      </div>
    </div>
  );
}

const SKELETON_RATIOS = [
  1, 1.3, 0.8, 1.1, 0.9, 1.4, 1, 0.75, 1.2, 1, 0.85, 1.3, 1.1, 0.9, 1, 1.25, 0.8, 1.15, 1, 0.95,
];

function AssetListSkeleton() {
  return (
    <div className="divide-y divide-border/20">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-2.5">
          <Skeleton className="size-12 rounded-lg shrink-0" />
          <div className="flex-1 space-y-1.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function AssetGridSkeleton() {
  return (
    <AssetGrid>
      {SKELETON_RATIOS.map((ratio, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ aspectRatio: `1 / ${ratio}` }} />
      ))}
    </AssetGrid>
  );
}

export function AssetBrowserSkeleton({ header }: { header?: JSX.Element }) {
  return (
    <div className="page-container">
      {header}
      <div className="space-y-4 py-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-64" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
          <Skeleton className="h-8 w-20 rounded-full" />
        </div>
      </div>
      <AssetGridSkeleton />
    </div>
  );
}

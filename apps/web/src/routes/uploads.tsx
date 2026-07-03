import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { GoBack } from "@/components/ui/go-back";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { UploadForm } from "@/components/upload";
import { useAuth } from "@/hooks/use-auth";
import { useTRPC } from "@/utils/trpc";
import { getUser } from "@/functions/get-user";
import { buildAssetUrl, buildLimboAssetUrl, cdnAssetUrl } from "@/lib/api-transforms";
import { AssetCard } from "@/components/assets/asset-card";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LoadMore } from "@/components/assets/load-more";
import { AssetFilterBar, type AssetFilterState } from "@/components/assets/asset-filters";
import { useFilters } from "@/hooks/use-filters";
import { useServerUploads } from "@/hooks/use-server-assets";
import { validateAssetSearch } from "@/lib/asset-search";
import { canSkipApproval, canUploadAssets, type UserRole } from "@/constants/roles";
import { flatChipStyle } from "@/lib/chip";
import { cn } from "@/lib/utils";

type UploadTab = "upload" | "history";

export const Route = createFileRoute("/uploads")({
  component: UploadsComponent,
  pendingComponent: UploadsPendingComponent,
  /* accept the browse filter params so the uploads history can share the same
     URL-synced filter state as the main browser */
  validateSearch: validateAssetSearch,
  beforeLoad: async () => {
    const session = await getUser();
    const role = session?.user?.role as UserRole | undefined;
    if (!session || !canUploadAssets(role)) {
      throw redirect({ to: "/" });
    }
    return { session };
  },
  head: () => ({
    meta: [
      { title: "Uploads - skowt.cc" },
      { name: "description", content: "Upload game assets to skowt.cc." },
    ],
  }),
});

function UploadsPendingComponent() {
  return (
    <div className="page-container">
      <div className="h-6 w-24 rounded bg-muted animate-pulse" />
      <div className="mt-6">
        <Skeleton className="h-9 w-32" />
        <Skeleton className="h-5 w-64 mt-2" />
      </div>
      <div className="grid md:grid-cols-[2fr_3fr] gap-6 md:gap-8 max-w-3xl mt-8">
        <Skeleton className="h-56 rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
          <Skeleton className="h-9 rounded-md" />
        </div>
      </div>
    </div>
  );
}

/* review-state colours from the site vocabulary: amber = waiting, green =
   live, red = rejected (same ramp as request statuses) */
const STATUS_CHIP: Record<string, { label: string; color: string }> = {
  pending: { label: "Pending", color: "oklch(0.84 0.10 80)" },
  approved: { label: "Approved", color: "oklch(0.82 0.10 162)" },
  denied: { label: "Denied", color: "oklch(0.74 0.10 25)" },
};

function StatusOverlay({ status }: { status: string }) {
  const chip = STATUS_CHIP[status] ?? STATUS_CHIP.pending;
  return (
    <div className="absolute top-2 left-2 z-10">
      <span
        className="text-[0.625rem] font-medium px-2 py-0.5 rounded-full"
        style={flatChipStyle(chip.color, 28)}
      >
        {chip.label}
      </span>
    </div>
  );
}

const SKELETON_RATIOS = [1, 1.3, 0.85, 1.1, 0.95, 1.35, 0.8, 1.2, 1, 0.9, 1.25, 1.05];

function UploadGridSkeleton() {
  return (
    <AssetGrid>
      {SKELETON_RATIOS.map((ratio, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ aspectRatio: `1 / ${ratio}` }} />
      ))}
    </AssetGrid>
  );
}

/* the caller's own uploads as an infinite-scroll masonry with the full filter
   bar - same machinery and speed as the main browse, plus a status overlay per
   card and no batch-selection (these are your own, some still pending) */
function UploadHistory({ onUploadClick }: { onUploadClick: () => void }) {
  const { games, tags } = useFilters();
  const {
    items,
    filters,
    availableCategories,
    setSearch,
    toggleGame,
    toggleCategory,
    toggleTag,
    setSortBy,
    setSortOrder,
    clearFilters,
    activeFilterCount,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
  } = useServerUploads(games);

  return (
    <div>
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
          <UploadGridSkeleton />
        ) : items.length > 0 ? (
          <>
            <AssetGrid>
              {items.map((item) => (
                <AssetCard
                  key={item.id}
                  id={item.id}
                  name={item.name}
                  gameName={item.game.name}
                  categoryName={item.category.name}
                  url={
                    item.status === "pending"
                      ? buildLimboAssetUrl(item.id, item.extension)
                      : buildAssetUrl(item.id, item.extension)
                  }
                  extension={item.extension}
                  isSuggestive={item.isSuggestive}
                  dimensions={item.metadata?.image}
                  disableSelection
                  overlay={<StatusOverlay status={item.status} />}
                />
              ))}
            </AssetGrid>
            <LoadMore
              hasNextPage={hasNextPage}
              isFetchingNextPage={isFetchingNextPage}
              fetchNextPage={fetchNextPage}
            />
            {hasNextPage && <UploadGridSkeleton />}
          </>
        ) : activeFilterCount > 0 ? (
          <EmptyState
            message="No uploads match your filters"
            action={{ label: "Clear filters", onClick: clearFilters }}
            className="py-16"
          />
        ) : (
          <EmptyState
            message="No uploads yet"
            image={cdnAssetUrl("01983921-9996-70e9-ab0d-1aa80422906f")}
            action={{ label: "Upload an asset", onClick: onUploadClick }}
            className="py-16"
          />
        )}
      </div>
    </div>
  );
}

function UploadsComponent() {
  const { user } = useAuth();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const skipAllowed = canSkipApproval(user?.role as UserRole | undefined);
  const [activeTab, setActiveTab] = useState<UploadTab>("upload");

  const { data: stats } = useQuery(trpc.uploads.getStats.queryOptions());
  const pendingCount = stats?.pending ?? 0;

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries({ queryKey: trpc.uploads.list.queryKey() });
    queryClient.invalidateQueries({ queryKey: trpc.uploads.getStats.queryKey() });
    setActiveTab("history");
  };

  return (
    <div className="page-container">
      <GoBack className="mb-6" />

      <div className="mb-6">
        <h1 className="text-display text-3xl md:text-4xl text-foreground">Upload</h1>
        <p className="text-sm text-muted-foreground mt-1">Add new assets to skowt.</p>
      </div>

      <div className="flex gap-1 border-b border-border/40 mb-8">
        <button
          type="button"
          onClick={() => setActiveTab("upload")}
          className={cn(
            "px-3 pb-2.5 text-sm transition-colors duration-150 border-b-2 -mb-px",
            activeTab === "upload"
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground/70",
          )}
        >
          Upload
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("history")}
          className={cn(
            "px-3 pb-2.5 text-sm transition-colors duration-150 border-b-2 -mb-px flex items-center gap-2",
            activeTab === "history"
              ? "text-foreground border-foreground"
              : "text-muted-foreground border-transparent hover:text-foreground/70",
          )}
        >
          Your uploads
          {pendingCount > 0 && (
            <span
              className="text-[0.6875rem] tabular-nums px-2 py-0.5 rounded-full"
              style={flatChipStyle(STATUS_CHIP.pending.color, 20)}
            >
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {activeTab === "upload" && (
        <div className="max-w-3xl">
          <UploadForm canSkipApproval={skipAllowed} onSuccess={handleUploadSuccess} />
        </div>
      )}

      {activeTab === "history" && <UploadHistory onUploadClick={() => setActiveTab("upload")} />}
    </div>
  );
}

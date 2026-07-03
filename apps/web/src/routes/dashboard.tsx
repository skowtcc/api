import { createFileRoute, redirect } from "@tanstack/react-router";
import { useMemo } from "react";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { flatChipStyle, softChipStyle } from "@/lib/chip";
import { getUser } from "@/functions/get-user";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { ModerationCard } from "@/components/moderation/moderation-card";
import { AssetGrid } from "@/components/assets/asset-grid";
import { LoadMore } from "@/components/assets/load-more";
import { IconCheck } from "nucleo-micro-bold";

// same green as the per-card approve action
const APPROVE_COLOR = "oklch(0.82 0.10 162)";
const PENDING_COLOR = "oklch(0.84 0.10 80)";

export const Route = createFileRoute("/dashboard")({
  component: DashboardComponent,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session || session.user?.role !== "developer") {
      throw redirect({ to: "/" });
    }
    return { session };
  },
  head: () => ({
    meta: [
      { title: "Dashboard - skowt.cc" },
      {
        name: "description",
        content: "Review pending uploads and moderate assets.",
      },
      { name: "og:title", content: "Dashboard - skowt.cc" },
      {
        name: "og:description",
        content: "Review pending uploads and moderate assets.",
      },
    ],
  }),
});

const SKELETON_RATIOS = [1, 1.3, 0.85, 1.1, 0.95, 1.35, 0.8, 1.2];

function DashboardSkeleton() {
  return (
    <AssetGrid>
      {SKELETON_RATIOS.map((ratio, i) => (
        <Skeleton key={i} className="w-full rounded-xl" style={{ aspectRatio: `1 / ${ratio}` }} />
      ))}
    </AssetGrid>
  );
}

function DashboardComponent() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(
    trpc.moderation.getPending.infiniteQueryOptions(
      { limit: 20 },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    ),
  );

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data]);

  const approveAllMutation = useMutation(
    trpc.moderation.approveAll.mutationOptions({
      onSuccess: () => {
        /* pathFilter (not queryKey) so it matches the infinite getPending query -
           queryKey() carries type:'query' and won't match a type:'infinite' key */
        queryClient.invalidateQueries(trpc.moderation.getPending.pathFilter());
      },
    }),
  );

  const hasPending = !isLoading && items.length > 0;
  // loaded count, with a "+" while more pages exist so it never overstates
  const pendingLabel = `${items.length}${hasNextPage ? "+" : ""} pending`;

  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title={
          <>
            Dashboard
            {hasPending && (
              <span
                className="ml-3 align-middle inline-flex items-center text-sm tabular-nums font-normal px-2.5 py-1 rounded-full"
                style={flatChipStyle(PENDING_COLOR, 20)}
              >
                {pendingLabel}
              </span>
            )}
          </>
        }
        description="Review pending uploads and moderate assets"
      >
        {hasPending && (
          <button
            onClick={() => approveAllMutation.mutate()}
            disabled={approveAllMutation.isPending}
            style={softChipStyle(APPROVE_COLOR)}
            className="inline-flex items-center gap-2 px-4 h-9 rounded-lg text-sm font-medium transition-[filter] hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <IconCheck className="size-4" />
            {approveAllMutation.isPending ? "Approving..." : "Approve all"}
          </button>
        )}
      </PageHeader>

      {isLoading ? (
        <DashboardSkeleton />
      ) : items.length > 0 ? (
        <>
          <AssetGrid>
            {items.map((asset) => (
              <ModerationCard key={asset.id} asset={asset} dimensions={asset.metadata?.image} />
            ))}
          </AssetGrid>
          <LoadMore
            hasNextPage={hasNextPage}
            isFetchingNextPage={isFetchingNextPage}
            fetchNextPage={fetchNextPage}
          />
          {hasNextPage && <DashboardSkeleton />}
        </>
      ) : (
        <EmptyState message="No pending uploads. You're all caught up." className="py-24" />
      )}
    </div>
  );
}

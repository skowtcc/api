import { createFileRoute } from "@tanstack/react-router";
import { ScrollFadeRow } from "@/components/ui/scroll-fade-row";
import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useAuth } from "@/hooks/use-auth";
import { RequestCard } from "@/components/requests/request-card";
import { SubmitRequestDialog } from "@/components/requests/submit-request-dialog";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { IconMagnifier, IconArrowTrendUp, IconClock, IconChevronDown } from "nucleo-micro-bold";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerGroup,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/dropdrawer";
import type { AssetRequest, RequestStatus } from "@/types/requests";
import { requestStatusConfig } from "@/constants/request-status";
import { softChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { cn, mutedControl } from "@/lib/utils";

export const Route = createFileRoute("/requests")({
  component: RequestsComponent,
  head: () => ({
    meta: [
      { title: "Requests - skowt.cc" },
      {
        name: "description",
        content:
          "Have your say on what gets prioritised next. Vote on new assets, games, features and quality of life improvements.",
      },
      { name: "og:title", content: "Requests - skowt.cc" },
      {
        name: "og:description",
        content:
          "Have your say on what gets prioritised next. Vote on new assets, games, features and quality of life improvements.",
      },
    ],
  }),
});

type SortOption = "upvotes" | "recent";
type StatusFilter = "all" | RequestStatus;

const TYPE_LABELS: Record<string, string> = {
  game: "New Game",
  game_category: "Game Category",
  other: "Other",
};

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
  { value: "rejected", label: "Closed" },
];

function RequestListSkeleton() {
  return (
    <div className="divide-y divide-border/30">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="py-3 flex items-start gap-3">
          <Skeleton className="size-[18px] rounded-full shrink-0 mt-0.5" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/3" />
          </div>
          <Skeleton className="h-6 w-12 rounded-md shrink-0" />
        </div>
      ))}
    </div>
  );
}

const SUBMIT_ROLES = ["contributor", "staff", "developer"];

function RequestsComponent() {
  const trpc = useTRPC();
  const { user } = useAuth();
  const [sortBy, setSortBy] = useState<SortOption>("upvotes");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const canSubmit = user?.role && SUBMIT_ROLES.includes(user.role);

  const queryTerm = debouncedSearch.trim() || undefined;

  const { data: allData } = useQuery(trpc.request.list.queryOptions({ limit: 100 }));

  const { data, isLoading, error } = useQuery(
    trpc.request.list.queryOptions({
      status: statusFilter === "all" ? undefined : statusFilter,
      query: queryTerm,
      limit: 50,
    }),
  );

  const requests = useMemo(() => {
    if (!data?.items) return [];

    const mapped: AssetRequest[] = data.items.map((entry) => {
      const createdAtStr =
        typeof entry.createdAt === "string"
          ? entry.createdAt
          : (entry.createdAt as Date).toISOString();

      return {
        id: entry.id,
        title: entry.title,
        description: entry.description ?? "",
        gameId: entry.gameId ?? "",
        gameName: entry.game?.name ?? TYPE_LABELS[entry.type] ?? entry.type,
        categoryName: entry.game ? TYPE_LABELS[entry.type] : undefined,
        status: entry.status as RequestStatus,
        priority: "medium" as const,
        upvotes: entry.voteCount,
        hasUpvoted: entry.hasVoted ?? false,
        submittedBy: {
          id: entry.creator.id,
          username: entry.creator.name ?? "Unknown",
          avatar: entry.creator.image ?? undefined,
          role: entry.creator.role as "contributor" | "staff" | "developer",
        },
        submittedAt: createdAtStr,
        updatedAt: createdAtStr,
        commentCount: 0,
      };
    });

    if (sortBy === "recent") {
      return [...mapped].sort(
        (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
      );
    }

    return mapped;
  }, [data?.items, sortBy]);

  const statusCounts = useMemo(() => {
    const items = allData?.items ?? [];
    const counts = { all: items.length, open: 0, in_progress: 0, completed: 0, rejected: 0 };
    for (const item of items) {
      const s = item.status as RequestStatus;
      if (s in counts) counts[s]++;
    }
    return counts;
  }, [allData?.items]);

  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title="Vote"
        description="Have your say on what gets prioritised next."
        className="mb-3"
      />
      <div className="py-6 space-y-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <IconMagnifier className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search votes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 pl-9 text-sm"
            />
          </div>

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            <DropDrawer>
              <DropDrawerTrigger
                className={cn(
                  mutedControl,
                  "flex items-center gap-1.5 px-3 h-8 text-sm rounded-md",
                )}
              >
                {sortBy === "upvotes" ? (
                  <>
                    <IconArrowTrendUp className="size-4" />
                    Top
                  </>
                ) : (
                  <>
                    <IconClock className="size-4" />
                    New
                  </>
                )}
                <IconChevronDown className="size-3.5 opacity-40" />
              </DropDrawerTrigger>
              <DropDrawerContent>
                <DropDrawerGroup>
                  <DropDrawerItem onClick={() => setSortBy("upvotes")}>
                    <IconArrowTrendUp className="size-4" />
                    Top voted
                  </DropDrawerItem>
                  <DropDrawerItem onClick={() => setSortBy("recent")}>
                    <IconClock className="size-4" />
                    Newest
                  </DropDrawerItem>
                </DropDrawerGroup>
              </DropDrawerContent>
            </DropDrawer>

            {canSubmit && <SubmitRequestDialog />}
          </div>
        </div>

        <ScrollFadeRow innerClassName="gap-2">
          {STATUS_FILTERS.map((filter) => {
            const isActive = statusFilter === filter.value;
            const config = filter.value !== "all" ? requestStatusConfig[filter.value] : null;
            const StatusIcon = config?.icon;
            /* active: translucent chip glowing in this status's own colour
            ("All" has none → the violet accent); inactive: calm raised pill */
            const activeColor = config?.color ?? ACCENT_CHIP_COLOR;

            return (
              <button
                key={filter.value}
                onClick={() => setStatusFilter(filter.value)}
                style={isActive ? softChipStyle(activeColor) : undefined}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-sm font-medium whitespace-nowrap shrink-0 transition-[filter]",
                  isActive ? "hover:brightness-110" : "surface-raised-pressable",
                )}
              >
                {StatusIcon && (
                  <StatusIcon className={cn("size-3.5 shrink-0", !isActive && config.className)} />
                )}
                <span className="leading-none">{filter.label}</span>
                <span className="text-xs leading-none opacity-60 tabular-nums">
                  {statusCounts[filter.value]}
                </span>
              </button>
            );
          })}
        </ScrollFadeRow>
      </div>

      {isLoading ? (
        <RequestListSkeleton />
      ) : error ? (
        <EmptyState
          message="Failed to load votes"
          action={{
            label: "Try again",
            onClick: () => window.location.reload(),
          }}
          className="py-24"
        />
      ) : requests.length > 0 ? (
        <div className="space-y-3">
          {requests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      ) : (
        <EmptyState
          message={search ? "No votes match your search" : "No requests found"}
          action={{
            label: search ? "Clear search" : "Clear filters",
            onClick: () => {
              setSearch("");
              setStatusFilter("all");
            },
          }}
          className="py-24"
        />
      )}
    </div>
  );
}

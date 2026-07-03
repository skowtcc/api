import { useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient, useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useAuth } from "@/hooks/use-auth";
import { cn, mutedControl } from "@/lib/utils";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { GoBack } from "@/components/ui/go-back";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useGameName } from "@/hooks/use-game-name";
import { LoginDialog } from "@/components/auth/login-dialog";
import { IconChevronUp, IconTrash } from "nucleo-micro-bold";
import { UserHandle } from "@/components/ui/user-handle";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { requestStatusConfig } from "@/constants/request-status";
import { softChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { Chip } from "@/components/ui/chip";
import type { RequestStatus } from "@/types/requests";
import { CommentCard } from "@/components/requests/comment-card";
import { CommentInput } from "@/components/requests/comment-input";

const TYPE_LABELS: Record<string, string> = {
  new_game: "New Game",
  game_category: "Game Category",
  feature: "Feature",
  bug: "Bug Fix",
};

export function RequestDetailSkeleton() {
  return (
    <div className="page-container">
      <GoBack to="/requests" label="Requests" className="mb-6" />
      <div>
        <div className="flex items-start gap-6">
          <Skeleton className="w-14 h-16 rounded-lg shrink-0" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <div className="mt-8 space-y-4">
          <Skeleton className="h-6 w-24" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    </div>
  );
}

export function RequestDetail({ id }: { id: string }) {
  const navigate = useNavigate();
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth();
  const { triggerHaptic } = useHaptics();

  const userRole = user?.role ?? "user";
  const isStaffOrDev = userRole === "staff" || userRole === "developer";
  const canComment = userRole === "contributor" || isStaffOrDev;

  const { data: entry } = useSuspenseQuery(trpc.request.getById.queryOptions({ id }));

  const { data: commentsData } = useQuery(
    trpc.request.listComments.queryOptions({ entryId: id, limit: 50 }),
  );

  const toggleVoteMutation = useMutation(
    trpc.request.toggle.mutationOptions({
      onMutate: async ({ entryId }) => {
        await queryClient.cancelQueries({
          queryKey: trpc.request.getById.queryKey({ id: entryId }),
        });
        await queryClient.cancelQueries({
          queryKey: trpc.request.list.queryKey(),
        });

        const previousDetail = queryClient.getQueryData(
          trpc.request.getById.queryKey({ id: entryId }),
        );
        const previousList = queryClient.getQueriesData({
          queryKey: trpc.request.list.queryKey(),
        });

        const wasVoted = entry?.hasVoted ?? false;
        const delta = wasVoted ? -1 : 1;

        queryClient.setQueryData(trpc.request.getById.queryKey({ id: entryId }), (old) => {
          if (!old) return old;
          return {
            ...old,
            hasVoted: !wasVoted,
            voteCount: old.voteCount + delta,
          };
        });

        queryClient.setQueriesData(
          { queryKey: trpc.request.list.queryKey() },
          (
            old:
              | {
                  items: Array<{
                    id: string;
                    hasVoted: boolean;
                    voteCount: number;
                  }>;
                }
              | undefined,
          ) => {
            if (!old?.items) return old;
            return {
              ...old,
              items: old.items.map((item) =>
                item.id === entryId
                  ? {
                      ...item,
                      hasVoted: !wasVoted,
                      voteCount: item.voteCount + delta,
                    }
                  : item,
              ),
            };
          },
        );

        triggerHaptic(wasVoted ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);

        return { previousDetail, previousList };
      },
      onError: (_err, { entryId }, context) => {
        if (context?.previousDetail) {
          queryClient.setQueryData(
            trpc.request.getById.queryKey({ id: entryId }),
            context.previousDetail,
          );
        }
        if (context?.previousList) {
          for (const [key, data] of context.previousList) {
            queryClient.setQueryData(key, data);
          }
        }
      },
      onSettled: (_data, _err, { entryId }) => {
        queryClient.invalidateQueries({
          queryKey: trpc.request.getById.queryKey({ id: entryId }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.request.list.queryKey(),
        });
      },
    }),
  );

  const deleteEntryMutation = useMutation(
    trpc.request.delete.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.request.list.queryKey(),
        });
        navigate({ to: "/requests" });
      },
    }),
  );

  const setStatusMutation = useMutation(
    trpc.request.setStatus.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.request.getById.queryKey({ id }),
        });
        queryClient.invalidateQueries({
          queryKey: trpc.request.list.queryKey(),
        });
      },
    }),
  );

  const handleStatusChange = (newStatus: string) => {
    if (
      newStatus === "open" ||
      newStatus === "in_progress" ||
      newStatus === "completed" ||
      newStatus === "rejected"
    ) {
      setStatusMutation.mutate({ id, status: newStatus });
    }
  };

  const gameName = entry?.game?.name ?? TYPE_LABELS[entry?.type ?? ""] ?? "";
  const displayGameName = useGameName(gameName);
  const categoryName = entry?.game ? TYPE_LABELS[entry.type] : undefined;

  const hasVoted = entry?.hasVoted ?? false;
  const voteCount = entry?.voteCount ?? 0;

  const canDeleteEntry = entry && (entry.creator.id === user?.id || isStaffOrDev);

  const handleUpvote = () => {
    toggleVoteMutation.mutate({ entryId: id });
  };

  const handleDeleteEntry = () => {
    if (!confirm("Delete this request? This cannot be undone.")) return;
    deleteEntryMutation.mutate({ id });
  };

  if (!entry) {
    return (
      <div className="page-container">
        <GoBack to="/requests" label="Requests" className="mb-6" />
        <EmptyState
          message="Request not found"
          action={{
            label: "Browse requests",
            onClick: () => (window.location.href = "/requests"),
          }}
        />
      </div>
    );
  }

  const status = requestStatusConfig[(entry.status as RequestStatus) ?? "open"];
  const StatusIcon = status.icon;
  const comments = commentsData?.items ?? [];
  const isVotingClosed = entry.status === "completed" || entry.status === "rejected";

  return (
    <div className="page-container">
      <GoBack to="/requests" label="Requests" className="mb-6" />

      <div>
        <div className="flex gap-5">
          <div className="shrink-0">
            {isVotingClosed ? (
              /* closed: keep your vote visible - voted keeps the accent chip
                 colours at reduced opacity, unvoted goes quiet */
              <div
                style={hasVoted ? softChipStyle(ACCENT_CHIP_COLOR) : undefined}
                className={cn(
                  "flex flex-col items-center justify-center w-14 h-16 rounded-lg cursor-not-allowed",
                  hasVoted ? "opacity-60" : "bg-muted/20 text-muted-foreground/50",
                )}
                title={hasVoted ? "Voting closed - you upvoted this" : "Voting closed"}
              >
                <IconChevronUp className="size-5" />
                <span className="text-sm font-medium tabular-nums mt-0.5">{voteCount}</span>
              </div>
            ) : isAuthenticated ? (
              <button
                onClick={handleUpvote}
                disabled={toggleVoteMutation.isPending}
                style={hasVoted ? softChipStyle(ACCENT_CHIP_COLOR) : undefined}
                className={cn(
                  "flex flex-col items-center justify-center w-14 h-16 rounded-lg transition-[filter] outline-none",
                  hasVoted ? "hover:brightness-110" : mutedControl,
                  toggleVoteMutation.isPending && "opacity-50 cursor-not-allowed",
                )}
              >
                <IconChevronUp className="size-5" />
                <span className="text-sm font-medium tabular-nums mt-0.5">{voteCount}</span>
              </button>
            ) : (
              <LoginDialog>
                <button
                  className={cn(
                    mutedControl,
                    "flex flex-col items-center justify-center w-14 h-16 rounded-lg",
                  )}
                >
                  <IconChevronUp className="size-5" />
                  <span className="text-sm font-medium tabular-nums mt-0.5">{voteCount}</span>
                </button>
              </LoginDialog>
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="mb-4">
              <div className="flex flex-wrap items-center gap-2.5 mb-2">
                <h1 className="text-display text-2xl md:text-3xl text-foreground leading-tight">
                  {entry.title}
                </h1>
                {isStaffOrDev ? (
                  <Select
                    value={entry.status}
                    onValueChange={handleStatusChange}
                    disabled={setStatusMutation.isPending}
                  >
                    <SelectTrigger
                      style={softChipStyle(status.color)}
                      className="h-auto w-auto gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full border-0"
                    >
                      {/* plain label, not <SelectValue/>: Value re-renders the selected
                          item's children, which include the icon - pairing it with the
                          explicit StatusIcon above doubled the icon in the chip */}
                      <StatusIcon className="size-3.5" />
                      {status.label}
                    </SelectTrigger>
                    <SelectContent>
                      {(
                        Object.entries(requestStatusConfig) as [RequestStatus, typeof status][]
                      ).map(([value, cfg]) => {
                        const Icon = cfg.icon;
                        return (
                          <SelectItem key={value} value={value}>
                            <span className="flex items-center gap-1.5">
                              <Icon className={cn("size-3.5", cfg.className)} />
                              {cfg.label}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <Chip
                    tone={status.color}
                    icon={<StatusIcon className="size-3.5" />}
                    className="text-xs shrink-0"
                  >
                    {status.label}
                  </Chip>
                )}
              </div>
              <p className="text-sm text-muted-foreground">
                {displayGameName}
                {categoryName && <span className="opacity-50"> / {categoryName}</span>}
              </p>
            </div>

            <p className="text-sm text-muted-foreground/80 leading-relaxed mb-5">
              {entry.description ?? "No description provided."}
            </p>

            <div className="h-px bg-border/40 mb-5" />

            <div className="surface-raised flex items-center gap-3 p-3 rounded-xl">
              <UserAvatar user={entry.creator} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <UserHandle
                    username={entry.creator.name}
                    role={entry.creator.role}
                    className="text-sm max-w-full"
                  />
                </div>
                <p className="text-xs text-muted-foreground">Submitted this request</p>
              </div>
              {canDeleteEntry && (
                <button
                  onClick={handleDeleteEntry}
                  disabled={deleteEntryMutation.isPending}
                  className="text-muted-foreground/50 hover:text-destructive transition-colors disabled:opacity-50"
                  title="Delete entry"
                >
                  <IconTrash className="size-5" />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-10">
          <div className="flex items-center gap-2 mb-6">
            <h2 className="text-display text-xl text-foreground">Comments</h2>
            <span className="text-sm text-muted-foreground/50">({comments.length})</span>
          </div>

          {canComment && user && (
            <div className="mb-6">
              <CommentInput
                entryId={id}
                user={{
                  id: user.id,
                  name: user.name,
                  image: user.image ?? null,
                }}
                onSuccess={() => {}}
              />
            </div>
          )}

          {comments.length > 0 ? (
            <div className="space-y-6">
              {comments.map((comment) => {
                const canDeleteComment = comment.user.id === user?.id || isStaffOrDev;
                return (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    entryId={id}
                    canDelete={canDeleteComment}
                    isAuthenticated={isAuthenticated}
                  />
                );
              })}
            </div>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground/60">
                No comments yet. Be the first to comment.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

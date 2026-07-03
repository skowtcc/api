import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useAuth } from "@/hooks/use-auth";
import { LoginDialog } from "@/components/auth/login-dialog";
import type { AssetRequest } from "@/types/requests";
import { IconChevronUp, IconMsg } from "nucleo-micro-bold";
import { cn, mutedControl } from "@/lib/utils";
import { softChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { useGameName } from "@/hooks/use-game-name";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { requestStatusConfig } from "@/constants/request-status";
import { timeAgo } from "@/lib/time";

interface RequestCardProps {
  request: AssetRequest;
}

export function RequestCard({ request }: RequestCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useAuth();
  const displayGameName = useGameName(request.gameName);
  const { triggerHaptic } = useHaptics();

  const toggleVoteMutation = useMutation(
    trpc.request.toggle.mutationOptions({
      onMutate: async ({ entryId }) => {
        await queryClient.cancelQueries({ queryKey: trpc.request.list.queryKey() });
        await queryClient.cancelQueries({
          queryKey: trpc.request.getById.queryKey({ id: entryId }),
        });

        const previousList = queryClient.getQueriesData({ queryKey: trpc.request.list.queryKey() });
        const previousDetail = queryClient.getQueryData(
          trpc.request.getById.queryKey({ id: entryId }),
        );

        const wasUpvoted = request.hasUpvoted ?? false;
        const delta = wasUpvoted ? -1 : 1;

        queryClient.setQueriesData(
          { queryKey: trpc.request.list.queryKey() },
          (
            old: { items: Array<{ id: string; hasVoted: boolean; voteCount: number }> } | undefined,
          ) => {
            if (!old?.items) return old;
            return {
              ...old,
              items: old.items.map((item) =>
                item.id === entryId
                  ? { ...item, hasVoted: !wasUpvoted, voteCount: item.voteCount + delta }
                  : item,
              ),
            };
          },
        );

        queryClient.setQueryData(trpc.request.getById.queryKey({ id: entryId }), (old) => {
          if (!old) return old;
          return { ...old, hasVoted: !wasUpvoted, voteCount: old.voteCount + delta };
        });

        triggerHaptic(wasUpvoted ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);
        return { previousList, previousDetail };
      },
      onError: (_err, { entryId }, context) => {
        if (context?.previousList) {
          for (const [key, data] of context.previousList) {
            queryClient.setQueryData(key, data);
          }
        }
        if (context?.previousDetail) {
          queryClient.setQueryData(
            trpc.request.getById.queryKey({ id: entryId }),
            context.previousDetail,
          );
        }
      },
      onSettled: (_data, _err, { entryId }) => {
        queryClient.invalidateQueries({ queryKey: trpc.request.list.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.request.getById.queryKey({ id: entryId }) });
      },
    }),
  );

  const handleUpvote = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    toggleVoteMutation.mutate({ entryId: request.id });
  };

  const status = requestStatusConfig[request.status];
  const StatusIcon = status.icon;
  const isVotingClosed = request.status === "completed" || request.status === "rejected";

  const upvotePill = isVotingClosed ? (
    /* closed: keep your vote visible - voted keeps the accent chip colours at
       reduced opacity, unvoted goes quiet */
    <div
      style={request.hasUpvoted ? softChipStyle(ACCENT_CHIP_COLOR) : undefined}
      className={cn(
        "flex items-center gap-1 px-2.5 h-7 rounded-full text-xs shrink-0 tabular-nums cursor-not-allowed",
        request.hasUpvoted ? "opacity-60" : "bg-muted/20 text-muted-foreground/50",
      )}
      title={request.hasUpvoted ? "Voting closed - you upvoted this" : "Voting closed"}
    >
      <IconChevronUp className="size-3" />
      {request.upvotes}
    </div>
  ) : isAuthenticated ? (
    <button
      onClick={handleUpvote}
      disabled={toggleVoteMutation.isPending}
      style={request.hasUpvoted ? softChipStyle(ACCENT_CHIP_COLOR) : undefined}
      className={cn(
        "flex items-center gap-1 px-2.5 h-7 rounded-full text-xs shrink-0 tabular-nums transition-[filter] outline-none disabled:opacity-50 disabled:cursor-not-allowed",
        request.hasUpvoted ? "hover:brightness-110" : mutedControl,
      )}
    >
      <IconChevronUp className="size-3" />
      {request.upvotes}
    </button>
  ) : (
    <div
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <LoginDialog>
        <button
          className={cn(
            mutedControl,
            "flex items-center gap-1 px-2.5 h-7 rounded-full text-xs shrink-0 tabular-nums outline-none",
          )}
        >
          <IconChevronUp className="size-3" />
          {request.upvotes}
        </button>
      </LoginDialog>
    </div>
  );

  return (
    <Link
      to="/request/$id"
      params={{ id: request.id }}
      data-haptic="selection"
      className="surface-raised-pressable group flex items-start gap-3 px-3 py-3 rounded-xl"
    >
      <StatusIcon className={cn("size-[18px] shrink-0 mt-0.5", status.className)} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3">
          <p className="text-display text-[15px] text-foreground leading-snug truncate flex-1 min-w-0">
            {request.title}
          </p>
          {upvotePill}
        </div>

        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
          <span>{displayGameName}</span>
          <span className="opacity-60">·</span>
          <span>@{request.submittedBy.username}</span>
          <span className="opacity-60">·</span>
          <span>{timeAgo(request.submittedAt)}</span>
          {request.commentCount > 0 && (
            <>
              <span className="opacity-60">·</span>
              <span className="inline-flex items-center gap-0.5">
                <IconMsg className="size-3" />
                {request.commentCount}
              </span>
            </>
          )}
        </p>

        {request.description && (
          <p className="text-sm text-muted-foreground line-clamp-1 mt-1">{request.description}</p>
        )}
      </div>
    </Link>
  );
}

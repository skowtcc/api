import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { cn, mutedControl } from "@/lib/utils";
import { softChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { UserAvatar } from "@/components/ui/user-avatar";
import { LoginDialog } from "@/components/auth/login-dialog";
import { UserHandle } from "@/components/ui/user-handle";
import { IconChevronUp, IconTrash } from "nucleo-micro-bold";
import { timeAgoLong } from "@/lib/time";

interface ApiUser {
  id: string;
  name: string | null;
  image: string | null;
  role?: string | null;
}

interface ApiComment {
  id: string;
  content: string;
  createdAt: Date | string;
  upvoteCount: number;
  hasUpvoted: boolean;
  user: ApiUser;
}

export function CommentCard({
  comment,
  entryId,
  canDelete,
  isAuthenticated,
}: {
  comment: ApiComment;
  entryId: string;
  canDelete: boolean;
  isAuthenticated: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptics();

  /* the live listComments query carries a limit in its input, so an exact-key
     setQueryData({ entryId }) writes to a key nothing reads. match by prefix
     with the plural setQueriesData (same pattern as request-card's vote) */
  const commentsFilter = { queryKey: trpc.request.listComments.queryKey({ entryId }) };

  const deleteCommentMutation = useMutation(
    trpc.request.deleteComment.mutationOptions({
      onMutate: async ({ id }) => {
        await queryClient.cancelQueries(commentsFilter);

        const previous = queryClient.getQueriesData(commentsFilter);

        queryClient.setQueriesData(commentsFilter, (old: { items: ApiComment[] } | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.filter((c) => c.id !== id),
          };
        });

        return { previous };
      },
      onError: (_err, _vars, context) => {
        for (const [key, data] of context?.previous ?? []) {
          queryClient.setQueryData(key, data);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries(commentsFilter);
      },
    }),
  );

  const toggleUpvoteMutation = useMutation(
    trpc.request.toggleCommentUpvote.mutationOptions({
      onMutate: async ({ commentId }) => {
        await queryClient.cancelQueries(commentsFilter);

        const previous = queryClient.getQueriesData(commentsFilter);

        queryClient.setQueriesData(commentsFilter, (old: { items: ApiComment[] } | undefined) => {
          if (!old?.items) return old;
          return {
            ...old,
            items: old.items.map((c) =>
              c.id === commentId
                ? {
                    ...c,
                    hasUpvoted: !c.hasUpvoted,
                    upvoteCount: c.hasUpvoted ? c.upvoteCount - 1 : c.upvoteCount + 1,
                  }
                : c,
            ),
          };
        });

        const wasUpvoted = comment.hasUpvoted;
        triggerHaptic(wasUpvoted ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);

        return { previous };
      },
      onError: (_err, _vars, context) => {
        for (const [key, data] of context?.previous ?? []) {
          queryClient.setQueryData(key, data);
        }
      },
      onSettled: () => {
        queryClient.invalidateQueries(commentsFilter);
      },
    }),
  );

  const handleDelete = () => {
    if (!confirm("Delete this comment?")) return;
    deleteCommentMutation.mutate({ id: comment.id });
  };

  const handleUpvote = () => {
    if (!isAuthenticated) return;
    toggleUpvoteMutation.mutate({ commentId: comment.id });
  };

  /* same pill vocabulary as the request-card upvote: accent chip when voted,
     quiet control otherwise */
  const upvotePillClass =
    "flex items-center gap-1 px-2 h-6 rounded-full text-xs shrink-0 tabular-nums outline-none";
  const upvoteButton = isAuthenticated ? (
    <button
      onClick={handleUpvote}
      disabled={toggleUpvoteMutation.isPending}
      style={comment.hasUpvoted ? softChipStyle(ACCENT_CHIP_COLOR) : undefined}
      className={cn(
        upvotePillClass,
        "transition-[filter] disabled:opacity-50 disabled:cursor-not-allowed",
        comment.hasUpvoted ? "hover:brightness-110" : mutedControl,
      )}
    >
      <IconChevronUp className="size-3" />
      {comment.upvoteCount}
    </button>
  ) : (
    <LoginDialog>
      <button className={cn(upvotePillClass, mutedControl)}>
        <IconChevronUp className="size-3" />
        {comment.upvoteCount}
      </button>
    </LoginDialog>
  );

  return (
    <article className="group relative">
      <div className="flex gap-3">
        <UserAvatar user={comment.user} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <UserHandle username={comment.user.name} role={comment.user.role} className="text-sm" />
            {canDelete && (
              <button
                onClick={handleDelete}
                disabled={deleteCommentMutation.isPending}
                className="opacity-0 group-hover:opacity-100 transition-opacity ml-auto text-muted-foreground/50 hover:text-destructive disabled:opacity-50"
                title="Delete comment"
              >
                <IconTrash className="size-4" />
              </button>
            )}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mb-1.5">{comment.content}</p>
          <div className="flex items-center gap-1.5 text-xs">
            {upvoteButton}
            <span className="text-muted-foreground/60">&middot;</span>
            <span className="text-muted-foreground">
              {timeAgoLong(
                typeof comment.createdAt === "string"
                  ? comment.createdAt
                  : comment.createdAt.toISOString(),
              )}
            </span>
          </div>
        </div>
      </div>
    </article>
  );
}

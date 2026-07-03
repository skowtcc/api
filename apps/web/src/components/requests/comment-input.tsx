import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Button } from "@/components/ui/button";

interface ApiUser {
  id: string;
  name: string | null;
  image: string | null;
  role?: string | null;
}

export function CommentInput({
  entryId,
  user,
  onSuccess,
}: {
  entryId: string;
  user: ApiUser;
  onSuccess: () => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [comment, setComment] = useState("");
  const { triggerHaptic } = useHaptics();

  const addCommentMutation = useMutation(
    trpc.request.addComment.mutationOptions({
      onSuccess: () => {
        setComment("");
        queryClient.invalidateQueries({
          queryKey: trpc.request.listComments.queryKey({ entryId }),
        });
        triggerHaptic(HAPTIC.SUCCESS);
        onSuccess();
      },
    }),
  );

  const handleSubmit = () => {
    if (!comment.trim()) return;
    addCommentMutation.mutate({ entryId, content: comment.trim() });
  };

  return (
    <div className="flex gap-3">
      <UserAvatar user={user} size="sm" />
      <div className="flex-1">
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Add a comment..."
          rows={3}
          className={cn(
            "w-full bg-muted/30 border border-border/40 rounded-lg px-3 py-2",
            "text-sm text-foreground placeholder:text-muted-foreground/50",
            "focus:outline-none focus:ring-1 focus:ring-border/60 focus:border-border/60",
            "resize-none transition-colors",
          )}
        />
        <div className="flex justify-end mt-2">
          <Button
            size="sm"
            disabled={!comment.trim() || addCommentMutation.isPending}
            onClick={handleSubmit}
          >
            {addCommentMutation.isPending ? "Posting..." : "Post Comment"}
          </Button>
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { UserAvatar } from "@/components/ui/user-avatar";
import { UserHandle } from "@/components/ui/user-handle";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { buildLimboAssetUrl } from "@/lib/api-transforms";
import { flatChipStyle } from "@/lib/chip";

// same review-state colours as the uploads history chips
const APPROVE_COLOR = "oklch(0.82 0.10 162)";
const DENY_COLOR = "oklch(0.74 0.10 25)";
import { cn } from "@/lib/utils";
import { IconCheck, IconXmark } from "nucleo-micro-bold";

interface ModerationAsset {
  id: string;
  name: string;
  hash: string;
  extension: string;
  size: number;
  status: string;
  downloadCount: number;
  viewCount: number;
  isSuggestive: boolean;
  createdAt: string;
  game: { id: string; slug: string; name: string };
  category: { id: string; slug: string; name: string };
  uploader: { id: string; name: string; image: string | null; role?: string } | null;
}

interface ModerationCardProps {
  asset: ModerationAsset;
  /** intrinsic image size; read by AssetGrid's column balancer too */
  dimensions?: { width: number; height: number };
}

export function ModerationCard({ asset, dimensions }: ModerationCardProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptics();
  const [denyOpen, setDenyOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);

  const approveMutation = useMutation(
    trpc.moderation.setStatus.mutationOptions({
      onSuccess: () => {
        triggerHaptic(HAPTIC.SUCCESS);
        /* pathFilter matches the infinite getPending query; queryKey() would
           carry type:'query' and miss the type:'infinite' key */
        queryClient.invalidateQueries(trpc.moderation.getPending.pathFilter());
      },
    }),
  );

  const denyMutation = useMutation(
    trpc.moderation.setStatus.mutationOptions({
      onSuccess: () => {
        triggerHaptic(HAPTIC.WARNING);
        /* pathFilter matches the infinite getPending query; queryKey() would
           carry type:'query' and miss the type:'infinite' key */
        queryClient.invalidateQueries(trpc.moderation.getPending.pathFilter());
        setDenyOpen(false);
      },
    }),
  );

  const handleApprove = () => {
    approveMutation.mutate({ assetId: asset.id, status: "approved" });
  };

  const handleDeny = () => {
    denyMutation.mutate({ assetId: asset.id, status: "denied" });
  };

  const isPending = approveMutation.isPending || denyMutation.isPending;
  const thumbnailUrl = buildLimboAssetUrl(asset.id, asset.extension);

  return (
    <>
      <div
        className={cn(
          "surface-raised group relative overflow-hidden rounded-xl",
          isPending && "opacity-60 pointer-events-none",
        )}
      >
        {/* the image is the only click target and it opens the fullscreen
            preview - never the asset page, which doesn't exist while pending */}
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          className="block w-full cursor-zoom-in"
          title="View full size"
        >
          <img
            src={thumbnailUrl}
            alt={`${asset.name} from ${asset.game.name}`}
            style={{
              aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : "1 / 1",
            }}
            className="w-full block object-contain min-h-[7.5rem]"
            loading="lazy"
          />
        </button>

        {asset.uploader && (
          <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 rounded-full bg-black/55 pl-1 pr-2.5 py-1">
            <UserAvatar user={asset.uploader} size="sm" />
            <UserHandle
              username={asset.uploader.name}
              role={asset.uploader.role ?? "contributor"}
              className="text-xs"
            />
          </div>
        )}

        <div className="absolute top-2 right-2 z-10 flex gap-1.5">
          <button
            type="button"
            onClick={handleApprove}
            disabled={isPending}
            className="flex items-center justify-center size-9 rounded-md hover:brightness-110 active:translate-y-px transition-transform duration-75"
            style={flatChipStyle(APPROVE_COLOR, 22)}
            title="Approve"
          >
            <IconCheck className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setDenyOpen(true)}
            disabled={isPending}
            className="flex items-center justify-center size-9 rounded-md hover:brightness-110 active:translate-y-px transition-transform duration-75"
            style={flatChipStyle(DENY_COLOR, 22)}
            title="Deny"
          >
            <IconXmark className="size-4" />
          </button>
        </div>

        {/* info overlay - same anatomy as browse cards, non-interactive */}
        <div className="absolute inset-x-0 bottom-0 glass-overlay px-3 pb-3 pt-10 pointer-events-none">
          <h3
            className="text-display text-sm text-white leading-snug truncate"
            style={{ textShadow: "0 1px 4px oklch(0 0 0 / 0.6)" }}
          >
            {asset.name}
          </h3>
          <p
            className="text-[11px] text-white/65 truncate mt-0.5"
            style={{ textShadow: "0 1px 3px oklch(0 0 0 / 0.5)" }}
          >
            {asset.game.name}
            <span className="text-white/35"> &middot; </span>
            {asset.category.name}
            <span className="text-white/35"> &middot; </span>
            <span className="uppercase">{asset.extension}</span>
            {asset.isSuggestive && (
              <span style={{ color: "oklch(0.84 0.10 80)" }}> &middot; Suggestive</span>
            )}
          </p>
        </div>
      </div>

      <AlertDialog open={denyOpen} onOpenChange={setDenyOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deny this asset?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{asset.name}" from the upload queue. This action cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={denyMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeny}
              disabled={denyMutation.isPending}
              className="surface-danger-pressable"
            >
              {denyMutation.isPending ? "Denying..." : "Deny asset"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent
          variant="fullscreen"
          className="items-center justify-center bg-black/90 border-none p-0"
        >
          <DialogTitle className="sr-only">{asset.name}</DialogTitle>
          <img
            src={thumbnailUrl}
            alt={asset.name}
            className="max-h-full max-w-full object-contain"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { LoginDialog } from "@/components/auth/login-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useIsMobile } from "@/hooks/use-mobile";
import { useSelectionStore, type SelectedAsset } from "@/stores/selection-store";
import { useTRPC } from "@/utils/trpc";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { canShareFiles, shareAssetFile } from "@/lib/share-asset";
import { buildRawAssetUrl } from "@/lib/api-transforms";
import {
  IconDownload as ArrowDownTrayIcon,
  IconBookmark as BookmarkIcon,
  IconLink as LinkIcon,
  IconCheck,
  IconStack,
  IconStackFilled,
  IconBookmarkFilled as BookmarkSolidIcon,
  IconExternalLink,
} from "nucleo-micro-bold";

interface AssetActionsProps {
  assetId: string;
  assetUrl: string;
  assetName: string;
  gameName: string;
  categoryName: string;
  extension: string;
  tags?: string[];
  attribution?: {
    publisher: string | null;
    usageTerms: string | null;
    termsUrl: string | null;
  };
}

export function AssetActions({
  assetId,
  assetUrl,
  assetName,
  gameName,
  categoryName,
  extension,
  tags = [],
  attribution,
}: AssetActionsProps) {
  const { isAuthenticated } = useAuth();
  const isMobile = useIsMobile();
  const [mobileDownloadOpen, setMobileDownloadOpen] = useState(false);
  const isFanmade = tags.includes("Fanmade");
  const rawAssetUrl = buildRawAssetUrl(assetId, extension);
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptics();

  const { isSelected, toggleAsset, isAtLimit, setSelectMode } = useSelectionStore();
  const selected = isSelected(assetId);
  const atLimit = isAtLimit();
  const canSelect = selected || !atLimit;

  const { data: bookmarkStatus } = useQuery({
    ...trpc.bookmark.exists.queryOptions({ assetId }),
    enabled: isAuthenticated,
  });

  const isSaved = bookmarkStatus?.saved ?? false;

  /* handlers passed into mutationOptions (not spread + overridden) so tRPC
     threads the onMutate context type through to onError */
  const toggleBookmark = useMutation(
    trpc.bookmark.toggle.mutationOptions({
      onMutate: async () => {
        await queryClient.cancelQueries({ queryKey: trpc.bookmark.exists.queryKey({ assetId }) });
        const previous = queryClient.getQueryData(trpc.bookmark.exists.queryKey({ assetId }));
        queryClient.setQueryData(trpc.bookmark.exists.queryKey({ assetId }), { saved: !isSaved });
        triggerHaptic(isSaved ? HAPTIC.ACTION : HAPTIC.SUCCESS);
        return { previous };
      },
      onError: (_err, _vars, context) => {
        if (context?.previous) {
          queryClient.setQueryData(trpc.bookmark.exists.queryKey({ assetId }), context.previous);
        }
        triggerHaptic(HAPTIC.ERROR);
      },
      onSettled: () => {
        queryClient.invalidateQueries({ queryKey: trpc.bookmark.exists.queryKey({ assetId }) });
        queryClient.invalidateQueries({ queryKey: ["bookmark.list"] });
      },
    }),
  );

  const handleSelectAsset = () => {
    if (!canSelect) {
      triggerHaptic(HAPTIC.WARNING);
      return;
    }
    setSelectMode(true);
    const selectedAsset: SelectedAsset = {
      id: assetId,
      name: assetName,
      url: assetUrl,
      gameName,
      categoryName,
      extension,
    };
    toggleAsset(selectedAsset);
    triggerHaptic(HAPTIC.ACTION);
  };

  const recordDownloadHistoryMutation = useMutation(trpc.downloads.record.mutationOptions());

  const recordDownloadCountMutation = useMutation(trpc.asset.recordDownload.mutationOptions());

  const recordDownload = async () => {
    recordDownloadCountMutation.mutate({ id: assetId });
    await recordDownloadHistoryMutation.mutateAsync({
      assets: [
        {
          id: assetId,
          name: assetName,
          extension,
          gameName,
          categoryName,
        },
      ],
    });
  };

  const handleDesktopDownload = async () => {
    try {
      await recordDownload();
    } catch {
      triggerHaptic(HAPTIC.ERROR);
      return;
    }

    try {
      const proxyUrl = `https://bridge.skowt.cc/?url=${encodeURIComponent(rawAssetUrl)}`;
      const response = await fetch(proxyUrl);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${assetName}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      triggerHaptic(HAPTIC.SUCCESS);
    } catch {
      window.open(assetUrl, "_blank");
      triggerHaptic(HAPTIC.WARNING);
    }
  };

  const handleMobileDownload = async () => {
    try {
      await recordDownload();
    } catch {
      triggerHaptic(HAPTIC.ERROR);
      return;
    }

    // try web share API first (gives iOS users native "Save Image")
    if (canShareFiles()) {
      try {
        await shareAssetFile(assetId, assetName, extension);
        triggerHaptic(HAPTIC.SUCCESS);
        return;
      } catch (err) {
        // user cancelled share sheet; that's fine
        if (err instanceof Error && err.name === "AbortError") return;
        // other errors fall through to legacy modal
      }
    }

    // fallback: show the "hold down to save" modal
    setMobileDownloadOpen(true);
    triggerHaptic(HAPTIC.SUCCESS);
  };

  const handleDownload = () => {
    if (isMobile) {
      handleMobileDownload();
    } else {
      handleDesktopDownload();
    }
  };

  const handleSave = () => {
    toggleBookmark.mutate({ assetId });
  };

  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout>>(null);

  const handleCopyUrl = async () => {
    const url = `${window.location.origin}/asset/${assetId}`;
    try {
      await navigator.clipboard.writeText(url);
      triggerHaptic(HAPTIC.SUCCESS);
      setCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setCopied(false), 5000);
    } catch {
      triggerHaptic(HAPTIC.ERROR);
    }
  };

  const AuthButton = ({
    children,
    onClick,
    variant = "default",
    disabled = false,
    haptic = "action",
  }: {
    children: React.ReactNode;
    onClick: () => void;
    variant?: "default" | "secondary";
    disabled?: boolean;
    haptic?: string;
  }) => {
    if (isAuthenticated) {
      return (
        <Button
          variant={variant}
          onClick={onClick}
          disabled={disabled}
          data-haptic={haptic}
          className="flex-1 h-10 rounded-xl text-sm font-medium gap-2"
        >
          {children}
        </Button>
      );
    }

    return (
      <LoginDialog>
        <Button
          variant={variant}
          data-haptic={haptic}
          className="flex-1 h-10 rounded-xl text-sm font-medium gap-2"
        >
          {children}
        </Button>
      </LoginDialog>
    );
  };

  return (
    <>
      <Dialog open={mobileDownloadOpen} onOpenChange={setMobileDownloadOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-display text-2xl">Save Image</DialogTitle>
            <DialogDescription>Hold down on the image to save</DialogDescription>
          </DialogHeader>
          <div className="flex justify-center">
            <img src={rawAssetUrl} alt={assetName} className="max-h-[65vh] w-auto object-contain" />
          </div>
        </DialogContent>
      </Dialog>

      <div className="space-y-3">
        <div className="flex">
          <AuthButton onClick={handleDownload} haptic="light">
            <ArrowDownTrayIcon className="size-4" />
            Download
          </AuthButton>
        </div>

        <div className="flex gap-2">
          <AuthButton
            variant="secondary"
            onClick={handleSave}
            disabled={toggleBookmark.isPending}
            haptic="light"
          >
            {isSaved ? (
              <>
                <BookmarkSolidIcon className="size-4" />
                Saved
              </>
            ) : (
              <>
                <BookmarkIcon className="size-4" />
                Save
              </>
            )}
          </AuthButton>
          <Button
            variant={selected ? "default" : "secondary"}
            onClick={handleSelectAsset}
            data-haptic="off"
            disabled={!canSelect && !selected}
            className="flex-1 h-10 rounded-xl text-sm font-medium gap-2"
          >
            {selected ? (
              <>
                <IconStackFilled className="size-4" />
                Selected
              </>
            ) : (
              <>
                <IconStack className="size-4" />
                Select
              </>
            )}
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopyUrl}
            data-haptic="off"
            className="h-10 rounded-xl text-sm font-medium px-3"
            title="Copy link"
          >
            {/* instant icon swap - no animation, light (no white), nothing fancy */}
            {copied ? <IconCheck className="size-4" /> : <LinkIcon className="size-4" />}
          </Button>
        </div>

        {/* usage & attribution - per-game researched terms when present,
            generic fallback otherwise */}
        <div className="surface-raised rounded-xl p-4 mt-1 space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-xs font-semibold text-foreground/70">Usage & attribution</h3>
            {attribution?.publisher && (
              <span className="text-xs text-muted-foreground truncate">
                © {attribution.publisher}
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground/80 leading-relaxed">
            {isFanmade
              ? "Fan-made. Free for personal use. Credit the uploader."
              : (attribution?.usageTerms ??
                "Free for personal use. For commercial use, contact the game publisher.")}
          </p>
          {!isFanmade && attribution?.termsUrl && (
            <a
              href={attribution.termsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-medium text-accent-foreground/80 hover:text-accent-foreground transition-colors"
              style={{ color: "var(--chip-violet)" }}
            >
              Publisher's fan content policy
              <IconExternalLink className="size-3" aria-hidden />
            </a>
          )}
          <p className="text-[11px] leading-snug text-muted-foreground/60">
            skowt.cc does not claim ownership of uploaded content.
          </p>
        </div>
      </div>
    </>
  );
}

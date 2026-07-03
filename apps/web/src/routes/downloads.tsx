import { useState } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useSuspenseQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useTRPC } from "@/utils/trpc";
import { buildAssetUrl, cdnAssetUrl } from "@/lib/api-transforms";
import { getUser } from "@/functions/get-user";
import { useSelectionStore, type SelectedAsset } from "@/stores/selection-store";
import { IconFileFill24, IconFolderFill24 } from "nucleo-core-fill-24";
import { IconTrash, IconRefresh } from "nucleo-micro-bold";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { timeAgo } from "@/lib/time";

// shown when you have no download history yet
const NO_DOWNLOADS_IMAGE = cdnAssetUrl("0198390e-52f1-722e-a082-200ae1500839");

/* blocking is client-side only. server doesn't enforce it, it's just so people
   stop asking questions and messaging me directly */
export const Route = createFileRoute("/downloads")({
  component: DownloadsComponent,
  pendingComponent: DownloadsPendingComponent,
  beforeLoad: async () => {
    const session = await getUser();
    if (!session?.user) throw redirect({ to: "/" });
    return { session };
  },
  head: () => ({
    meta: [
      { title: "Download History - skowt.cc" },
      { name: "description", content: "View your recent downloads on skowt." },
      { name: "og:title", content: "Download History - skowt.cc" },
      { name: "og:description", content: "View your recent downloads on skowt." },
    ],
  }),
});

function DownloadsHeader() {
  return (
    <>
      <GoBack className="mb-6" />
      <PageHeader
        title="Download history"
        description="Your recent downloads. Tap to reselect assets."
      />
    </>
  );
}

function DownloadsPendingComponent() {
  return (
    <div className="page-container">
      <DownloadsHeader />
      <div className="space-y-0">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-start gap-3 py-3 animate-pulse">
            <div className="size-[18px] rounded-full bg-muted/30 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1.5">
              <div className="h-[18px] w-28 bg-muted/30 rounded-md" />
              <div className="h-3.5 w-44 bg-muted/20 rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface Batch {
  batchId: string;
  timestamp: number;
  assetCount: number;
  gameNames: string[];
}

interface BatchAsset {
  id: string;
  name: string;
  extension: string;
  gameName: string;
  categoryName: string;
}

function BatchCard({ batch }: { batch: Batch }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const { triggerHaptic } = useHaptics();

  const { clearSelection, setSelectMode, selectAsset, getSelectedCount } = useSelectionStore();

  const [showReplaceDialog, setShowReplaceDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);

  const deleteMutation = useMutation(
    trpc.downloads.deleteBatch.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: trpc.downloads.history.queryKey(),
        });
        triggerHaptic(HAPTIC.WARNING);
      },
      onError: () => {
        triggerHaptic(HAPTIC.ERROR);
      },
    }),
  );

  const handleSelectAll = async () => {
    const currentCount = getSelectedCount();

    if (currentCount > 0) {
      setShowReplaceDialog(true);
      return;
    }

    await loadAndSelectAssets();
  };

  const loadAndSelectAssets = async () => {
    setIsLoadingAssets(true);
    try {
      const result = await queryClient.fetchQuery(
        trpc.downloads.getBatch.queryOptions({ batchId: batch.batchId }),
      );

      clearSelection();
      setSelectMode(true);

      for (const asset of result.assets as BatchAsset[]) {
        const selectedAsset: SelectedAsset = {
          id: asset.id,
          name: asset.name,
          url: buildAssetUrl(asset.id, asset.extension),
          gameName: asset.gameName,
          categoryName: asset.categoryName,
          extension: asset.extension,
        };
        selectAsset(selectedAsset);
      }
      triggerHaptic(HAPTIC.SUCCESS);
    } catch {
      triggerHaptic(HAPTIC.ERROR);
    } finally {
      setIsLoadingAssets(false);
      setShowReplaceDialog(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const confirmDelete = () => {
    deleteMutation.mutate({ batchId: batch.batchId });
    setShowDeleteDialog(false);
  };

  const gameList = batch.gameNames.slice(0, 2).join(", ");
  const moreGames = batch.gameNames.length > 2 ? ` +${batch.gameNames.length - 2}` : "";

  return (
    <>
      <article
        onClick={handleSelectAll}
        data-haptic="light"
        className={cn(
          "group flex items-start gap-3 py-3 cursor-pointer",
          isLoadingAssets && "pointer-events-none",
        )}
      >
        {batch.assetCount === 1 ? (
          <IconFileFill24
            className={cn(
              "size-4 shrink-0 mt-0.5 text-muted-foreground",
              isLoadingAssets && "animate-pulse",
            )}
          />
        ) : (
          <IconFolderFill24
            className={cn(
              "size-4 shrink-0 mt-0.5 text-muted-foreground",
              isLoadingAssets && "animate-pulse",
            )}
          />
        )}

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <p className="text-display text-[15px] text-foreground leading-snug truncate flex-1 min-w-0">
              {batch.assetCount} asset{batch.assetCount !== 1 ? "s" : ""}
              {isLoadingAssets && (
                <IconRefresh className="size-3 text-muted-foreground animate-spin inline ml-2" />
              )}
            </p>
            <button
              onClick={handleDelete}
              data-haptic="warning"
              disabled={deleteMutation.isPending}
              className={cn(
                "p-1 rounded-md transition-colors shrink-0",
                "text-destructive/60 hover:text-destructive hover:bg-destructive/10",
                "sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100",
                deleteMutation.isPending && "pointer-events-none",
              )}
            >
              {deleteMutation.isPending ? (
                <IconRefresh className="size-3.5 animate-spin" />
              ) : (
                <IconTrash className="size-3.5" />
              )}
            </button>
          </div>

          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 truncate">
            <span>
              {gameList}
              {moreGames && <span className="opacity-60">{moreGames}</span>}
            </span>
            <span className="opacity-60">&middot;</span>
            <span>{timeAgo(batch.timestamp)}</span>
          </p>
        </div>
      </article>

      <Dialog open={showReplaceDialog} onOpenChange={setShowReplaceDialog}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-sm gap-0 p-2 !bg-background-surface overflow-hidden !rounded-xl"
        >
          <div className="bg-background rounded-lg border border-border px-6 py-8 flex flex-col items-center text-center">
            <DialogHeader className="mb-4 items-center">
              <DialogTitle className="text-display text-lg">Replace current selection?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-6">
              You have {getSelectedCount()} asset{getSelectedCount() !== 1 ? "s" : ""} selected.
              This will replace your current selection.
            </p>
            <div className="flex gap-2.5 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowReplaceDialog(false)}
              >
                Cancel
              </Button>
              <Button className="flex-1" onClick={loadAndSelectAssets} disabled={isLoadingAssets}>
                {isLoadingAssets ? "Loading..." : "Replace"}
              </Button>
            </div>
          </div>
          <div className="px-4 py-3">
            <p className="text-[0.6875rem] text-muted-foreground text-center">
              This cannot be undone.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent
          showCloseButton={false}
          className="sm:max-w-sm gap-0 p-2 !bg-background-surface overflow-hidden !rounded-xl"
        >
          <div className="bg-background rounded-lg border border-border px-6 py-8 flex flex-col items-center text-center">
            <DialogHeader className="mb-4 items-center">
              <DialogTitle className="text-display text-lg">Delete this download?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground mb-6">
              This will remove this entry from your history.
            </p>
            <div className="flex gap-2.5 w-full">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowDeleteDialog(false)}
              >
                Cancel
              </Button>
              <Button variant="destructive" className="flex-1" onClick={confirmDelete}>
                Delete
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DownloadsComponent() {
  const navigate = useNavigate();
  const trpc = useTRPC();

  const { data } = useSuspenseQuery(trpc.downloads.history.queryOptions({ limit: 50 }));

  const batches = data?.batches ?? [];

  if (batches.length === 0) {
    return (
      <div className="page-container">
        <DownloadsHeader />
        <EmptyState
          message="No download history"
          image={NO_DOWNLOADS_IMAGE}
          action={{
            label: "Browse assets",
            onClick: () => navigate({ to: "/" }),
          }}
        />
      </div>
    );
  }

  return (
    <div className="page-container">
      <DownloadsHeader />
      <div className="space-y-0">
        {batches.map((batch: Batch) => (
          <BatchCard key={batch.batchId} batch={batch} />
        ))}
      </div>
    </div>
  );
}

import { useState, useRef, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { useSelectionStore, WARNING_THRESHOLD } from "@/stores/selection-store";
import { downloadAssetsAsZip } from "@/lib/download-assets";
import { useTRPC } from "@/utils/trpc";
import { useServerStatus } from "@/hooks/use-server-status";
import { useAuth } from "@/hooks/use-auth";
import { useHaptics } from "@/components/providers/haptics-provider";
import {
  IconDownload,
  IconXmark,
  IconStack,
  IconCircleWarning,
  IconEye,
  IconStackFilled,
} from "nucleo-micro-bold";
import { SelectionViewer } from "./selection-viewer";
import { LoginDialog } from "@/components/auth/login-dialog";
import { cn } from "@/lib/utils";
import { HAPTIC } from "@/lib/haptics";

export function SelectionPill() {
  const { isSelectMode, getSelectedCount, getRemainingSlots, getSelectedArray, clearSelection } =
    useSelectionStore();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showServerError, setShowServerError] = useState(false);
  const [isViewerOpen, setIsViewerOpen] = useState(false);
  const [showLoginDialog, setShowLoginDialog] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isExpanded) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsExpanded(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isExpanded]);

  const trpc = useTRPC();
  const { discordInviteUrl, refresh: refreshServerStatus } = useServerStatus();
  const { isAuthenticated } = useAuth();
  const { triggerHaptic } = useHaptics();

  const recordDownloadMutation = useMutation(trpc.downloads.record.mutationOptions());

  const selectedCount = getSelectedCount();
  const remainingSlots = getRemainingSlots();
  const isWarning = selectedCount >= WARNING_THRESHOLD;
  const selectedAssets = getSelectedArray();

  const handleDownload = async () => {
    if (selectedCount === 0 || isDownloading) return;

    if (!isAuthenticated) {
      setShowLoginDialog(true);
      triggerHaptic(HAPTIC.WARNING);
      return;
    }

    const result = await refreshServerStatus();

    if (!result?.inServer) {
      setShowServerError(true);
      triggerHaptic(HAPTIC.ERROR);
      return;
    }

    setShowServerError(false);
    setIsDownloading(true);
    setDownloadProgress(0);

    try {
      const downloaded = await downloadAssetsAsZip(selectedAssets, (progress) => {
        setDownloadProgress(progress);
      });

      // record only the assets that actually made it into the archive
      if (downloaded.length > 0) {
        recordDownloadMutation.mutate({
          assets: downloaded.map((a) => ({
            id: a.id,
            name: a.name,
            extension: a.extension,
            gameName: a.gameName,
            categoryName: a.categoryName,
          })),
        });
      }

      clearSelection();
      setIsExpanded(false);
      triggerHaptic(HAPTIC.SUCCESS);
    } catch {
      triggerHaptic(HAPTIC.ERROR);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(0);
    }
  };

  const handleClear = () => {
    clearSelection();
    setIsExpanded(false);
    triggerHaptic(HAPTIC.WARNING);
  };

  if (!isSelectMode && selectedCount === 0) return null;

  const expanded = (isExpanded || isDownloading) && selectedCount > 0;

  return (
    <div ref={containerRef} className="flex flex-col items-end gap-2">
      {expanded && (
        <div className="surface-glass animate-fade-in-up rounded-2xl p-2 min-w-[280px]">
          {isDownloading && (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="surface-accent-soft size-9 rounded-full flex items-center justify-center shrink-0">
                  <span className="size-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Preparing download</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCount} {selectedCount === 1 ? "asset" : "assets"}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <div className="surface-well h-1.5 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-linear-to-r from-bronze-deep via-bronze-face to-bronze-top rounded-full transition-[width] duration-200 ease-out"
                    style={{ width: `${downloadProgress}%` }}
                  />
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Fetching assets...</span>
                  <span className="font-mono tabular-nums">{Math.round(downloadProgress)}%</span>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/50 leading-relaxed">
                Please keep this page open until complete.
              </p>
            </div>
          )}

          {!isDownloading && (
            <div className="space-y-1">
              {showServerError && (
                <div className="flex items-start gap-2.5 p-3 mb-1 rounded-xl bg-destructive/[0.08]">
                  <div className="size-8 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                    <IconCircleWarning className="size-4" />
                  </div>
                  <div className="flex-1 min-w-0 py-0.5">
                    <p className="text-xs text-foreground font-medium">
                      Discord membership required
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Join our server to download assets
                    </p>
                    <a
                      href={discordInviteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs font-medium text-bronze-top hover:text-bronze-face mt-2"
                    >
                      Join Discord
                      <span aria-hidden="true">→</span>
                    </a>
                  </div>
                </div>
              )}
              <button
                onClick={handleDownload}
                data-haptic="light"
                disabled={selectedCount === 0}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors hover:bg-foreground/[0.05] active:bg-foreground/[0.08] disabled:opacity-50 disabled:pointer-events-none"
              >
                <div className="surface-accent-soft size-9 rounded-full flex items-center justify-center shrink-0">
                  <IconDownload className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">Download ZIP</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedCount} {selectedCount === 1 ? "asset" : "assets"} selected
                  </p>
                </div>
              </button>

              <button
                onClick={() => setIsViewerOpen(true)}
                data-haptic="action"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors hover:bg-foreground/[0.05] active:bg-foreground/[0.08]"
              >
                <div className="size-9 rounded-full bg-foreground/[0.06] text-foreground/70 flex items-center justify-center shrink-0">
                  <IconEye className="size-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground">View selected</p>
                  <p className="text-xs text-muted-foreground">
                    See all {selectedCount} {selectedCount === 1 ? "asset" : "assets"}
                  </p>
                </div>
              </button>

              <div className="h-px bg-foreground/[0.06] mx-2 my-1" />

              <button
                onClick={handleClear}
                data-haptic="off"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left cursor-pointer transition-colors bg-destructive/[0.06] hover:bg-destructive/[0.12] active:bg-destructive/[0.16]"
              >
                <div className="size-9 rounded-full bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                  <IconXmark className="size-4" />
                </div>
                <p className="text-sm font-medium text-destructive">Clear selection</p>
              </button>
            </div>
          )}
        </div>
      )}

      <button
        onClick={() => {
          if (selectedCount > 0) {
            setIsExpanded(!isExpanded);
            triggerHaptic(HAPTIC.LIGHT_ACTION);
          }
        }}
        data-haptic="off"
        disabled={isDownloading}
        className={cn(
          "surface-raised-pressable group flex items-center gap-3 pl-3.5 pr-4.5 py-2.5 rounded-full ring-1 ring-foreground/15 shadow-xl shadow-black/50",
          selectedCount === 0 && "cursor-default",
        )}
      >
        <div
          className={cn(
            "size-9 rounded-full flex items-center justify-center",
            isWarning || selectedCount > 0
              ? "surface-accent-soft"
              : "surface-well text-foreground/70",
          )}
        >
          {isDownloading ? (
            <span className="size-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          ) : selectedCount > 0 ? (
            <IconStackFilled className="size-4" />
          ) : (
            <IconStack className="size-4" />
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="text-left whitespace-nowrap">
            <p className="text-sm font-medium text-foreground leading-none">
              {selectedCount === 0 ? (
                "Tap to select"
              ) : (
                <>
                  {selectedCount}
                  <span className="text-muted-foreground font-normal ml-1">selected</span>
                </>
              )}
            </p>
            <p
              className={cn(
                "text-[10px] mt-0.5 leading-none",
                isWarning ? "text-bronze-face" : "text-muted-foreground/60",
              )}
            >
              {remainingSlots} remaining
            </p>
          </div>

          {selectedCount > 0 && !isDownloading && (
            <div
              className={cn(
                "text-muted-foreground/60 transition-transform duration-200",
                isExpanded && "rotate-180",
              )}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path
                  d="M4 5.5L7 8.5L10 5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          )}
        </div>
      </button>

      <SelectionViewer open={isViewerOpen} onOpenChange={setIsViewerOpen} />
      <LoginDialog open={showLoginDialog} onOpenChange={setShowLoginDialog} />
    </div>
  );
}

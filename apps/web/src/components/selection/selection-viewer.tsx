import { useMemo } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useSelectionStore, MAX_SELECTION } from "@/stores/selection-store";
import { useIsMobile } from "@/hooks/use-mobile";
import { useFilters } from "@/hooks/use-filters";
import { IconXmark, IconTrash, IconCube, IconStackFilled } from "nucleo-micro-bold";
import { buildAssetUrl, gameIconUrl } from "@/lib/api-transforms";
import { useGameName } from "@/hooks/use-game-name";
import { cn } from "@/lib/utils";

interface SelectionViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface AssetItemProps {
  asset: {
    id: string;
    name: string;
    gameName: string;
    categoryName: string;
    extension: string;
  };
  onDeselect: (id: string) => void;
}

function AssetItem({ asset, onDeselect }: AssetItemProps) {
  const displayGameName = useGameName(asset.gameName);
  const thumbnailUrl = buildAssetUrl(asset.id, asset.extension);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10, scale: 0.9 }}
      transition={{ duration: 0.15 }}
      className="group relative flex items-center gap-3 p-2.5 rounded-xl hover:bg-muted/20 transition-colors"
    >
      <div className="size-11 rounded-lg glass-panel overflow-hidden shrink-0">
        <img
          src={thumbnailUrl}
          alt={asset.name}
          className="size-full object-contain"
          loading="lazy"
        />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate leading-tight">{asset.name}</p>
        <p className="text-[11px] text-muted-foreground/60 truncate mt-0.5">
          <span className="text-muted-foreground">{displayGameName}</span>
          <span> / {asset.categoryName}</span>
        </p>
      </div>

      <button
        onClick={() => onDeselect(asset.id)}
        data-haptic="warning"
        className="size-7 rounded-lg flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
        aria-label={`Remove ${asset.name} from selection`}
      >
        <IconXmark className="size-4" />
      </button>
    </motion.div>
  );
}

export function SelectionViewer({ open, onOpenChange }: SelectionViewerProps) {
  const { getSelectedArray, getSelectedCount, deselectAsset, clearSelection } = useSelectionStore();
  const { games } = useFilters();

  const isMobile = useIsMobile();
  const selectedAssets = getSelectedArray();
  const selectedCount = getSelectedCount();

  const gameSlugMap = useMemo(() => {
    const map: Record<string, string> = {};
    for (const game of games) {
      map[game.name] = game.slug;
    }
    return map;
  }, [games]);

  const groupedAssets = useMemo(() => {
    const groups: Record<
      string,
      { gameName: string; gameSlug: string; assets: typeof selectedAssets }
    > = {};

    for (const asset of selectedAssets) {
      if (!groups[asset.gameName]) {
        groups[asset.gameName] = {
          gameName: asset.gameName,
          gameSlug: gameSlugMap[asset.gameName] ?? "",
          assets: [],
        };
      }
      groups[asset.gameName].assets.push(asset);
    }

    return Object.values(groups).sort((a, b) => a.gameName.localeCompare(b.gameName));
  }, [selectedAssets, gameSlugMap]);

  const handleClearAll = () => {
    clearSelection();
    onOpenChange(false);
  };

  const handleDeselect = (assetId: string) => {
    deselectAsset(assetId);
    // auto-close if last item removed
    if (selectedCount === 1) {
      onOpenChange(false);
    }
  };

  return (
    <Drawer open={open} onOpenChange={onOpenChange} direction={isMobile ? "bottom" : "right"}>
      <DrawerContent
        className={cn(
          "bg-background/95 backdrop-blur-2xl border-border/20",
          !isMobile && "sm:max-w-md",
        )}
      >
        <DrawerHeader className="border-b border-border/15 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-xl glass-panel flex items-center justify-center">
                <IconStackFilled className="size-5 text-foreground/70" />
              </div>
              <div className="text-left">
                <DrawerTitle className="text-base text-display">Selected Assets</DrawerTitle>
                <DrawerDescription className="text-xs">
                  {selectedCount} of {MAX_SELECTION} slots used
                </DrawerDescription>
              </div>
            </div>

            {selectedCount > 0 && (
              <button
                onClick={handleClearAll}
                data-haptic="warning"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-destructive bg-destructive/10 border border-destructive/20 hover:bg-destructive/15 hover:border-destructive/35 active:bg-destructive/20 transition-colors"
              >
                <IconTrash className="size-3.5" />
                Clear all
              </button>
            )}
          </div>

          <div className="mt-5 h-1 bg-muted/20 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-linear-to-r from-bronze-deep via-bronze-face to-bronze-top transition-[width] duration-300 ease-out"
              style={{ width: `${(selectedCount / MAX_SELECTION) * 100}%` }}
            />
          </div>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto overscroll-contain min-h-0">
          {selectedCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-6">
              <div className="size-16 rounded-2xl glass-panel border-dashed !border-border/30 flex items-center justify-center mb-5">
                <IconCube className="size-7 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">No assets selected</p>
              <p className="text-xs text-muted-foreground mt-1 text-center">
                Start selecting assets to see them here
              </p>
            </div>
          ) : (
            <div className="p-5 space-y-7">
              <AnimatePresence mode="popLayout">
                {groupedAssets.map((group, groupIndex) => (
                  <motion.div
                    key={group.gameName}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{
                      duration: 0.2,
                      delay: groupIndex * 0.03,
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      {group.gameSlug && (
                        <img
                          src={gameIconUrl(group.gameSlug)}
                          alt=""
                          className="size-4 rounded-sm object-contain"
                        />
                      )}
                      <span className="text-xs font-medium tracking-wide text-muted-foreground">
                        {group.gameName}
                      </span>
                      <span className="text-[0.625rem] text-muted-foreground tabular-nums">
                        ({group.assets.length})
                      </span>
                      <div className="flex-1 h-px bg-border/15" />
                    </div>

                    <div className="space-y-0.5">
                      <AnimatePresence mode="popLayout">
                        {group.assets.map((asset) => (
                          <AssetItem key={asset.id} asset={asset} onDeselect={handleDeselect} />
                        ))}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

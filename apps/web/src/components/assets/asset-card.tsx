import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { IconEyeFilled as EyeSlashIcon } from "nucleo-micro-bold";
import { useGameName } from "@/hooks/use-game-name";
import { useSelectionStore, type SelectedAsset } from "@/stores/selection-store";
import { useSettings } from "@/hooks/use-settings";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { cn } from "@/lib/utils";

interface AssetCardProps {
  id: string;
  name: string;
  gameName: string;
  categoryName: string;
  url: string;
  extension?: string;
  isSuggestive?: boolean;
  /** intrinsic image size; reserves the layout box before the image loads */
  dimensions?: { width: number; height: number };
  disableSelection?: boolean;
  overlay?: React.ReactNode;
}

export const AssetCard = memo(function AssetCard({
  id,
  name,
  gameName,
  categoryName,
  url,
  extension = "png",
  isSuggestive = false,
  dimensions,
  disableSelection = false,
  overlay,
}: AssetCardProps) {
  const displayGameName = useGameName(gameName);
  const isSelectMode = useSelectionStore((s) => s.isSelectMode);
  const selected = useSelectionStore((s) => !!s.selectedAssets[id]);
  const atLimit = useSelectionStore((s) => Object.keys(s.selectedAssets).length >= 350);
  const toggleAsset = useSelectionStore((s) => s.toggleAsset);
  const { settings } = useSettings();
  const { triggerHaptic } = useHaptics();

  const isBlocked = isSuggestive && !settings.showSuggestiveContent;

  if (isBlocked) {
    return (
      <div className="select-none">
        <div className="surface-raised relative overflow-hidden rounded-xl aspect-square flex flex-col items-center justify-center text-center p-4">
          <div className="relative z-10 flex flex-col items-center gap-2">
            <EyeSlashIcon className="size-8 text-muted-foreground/60" />
            <p className="text-sm font-medium text-muted-foreground">Suggestive Content</p>
            <p className="text-xs text-muted-foreground/60">Enable in settings to view</p>
          </div>
        </div>
      </div>
    );
  }

  const disabled = !selected && atLimit;

  const handleSelect = () => {
    if (disabled) {
      triggerHaptic(HAPTIC.WARNING);
      return;
    }

    const asset: SelectedAsset = {
      id,
      name,
      url,
      gameName,
      categoryName,
      extension,
    };
    toggleAsset(asset);
    triggerHaptic(selected ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);
  };

  const cardContent = (
    <>
      {/* the image box is always reserved via aspect-ratio so the masonry never
          reflows on load. when intrinsic dims are unknown (pre-backfill, or a
          failed capture) fall back to a 1:1 square - object-contain letterboxes
          the real image inside it, so nothing is cropped and the grid stays put */}
      <img
        src={url}
        alt={`${name} from ${gameName}`}
        style={{
          aspectRatio: dimensions ? `${dimensions.width} / ${dimensions.height}` : "1 / 1",
        }}
        /* min-height floor so tiny or wide/short images get breathing room
           (object-contain letterboxes them) instead of collapsing to a sliver */
        className="w-full block object-contain min-h-[7.5rem] group-hover:scale-[1.02] transition-transform duration-300"
        loading="lazy"
      />

      {/* glass overlay, bottom with name/game */}
      <div className="absolute inset-x-0 bottom-0 glass-overlay px-3 pb-3 pt-10">
        <h3
          className="text-display text-sm text-white leading-snug truncate"
          style={{ textShadow: "0 1px 4px oklch(0 0 0 / 0.6)" }}
        >
          {name}
        </h3>
        <p
          className="text-[11px] text-white/65 truncate mt-0.5"
          style={{ textShadow: "0 1px 3px oklch(0 0 0 / 0.5)" }}
        >
          {displayGameName}
          {categoryName && (
            <>
              <span className="text-white/35"> &middot; </span>
              {categoryName}
            </>
          )}
        </p>
      </div>
    </>
  );

  if (disableSelection || !isSelectMode) {
    return (
      <Link to="/asset/$id" params={{ id }} data-haptic="selection">
        <div className="surface-raised group relative overflow-hidden rounded-xl cursor-pointer transition-transform duration-150 active:scale-[0.98]">
          {cardContent}
          {overlay}
        </div>
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "surface-raised group relative overflow-hidden rounded-xl cursor-pointer transition-transform duration-150 active:scale-[0.98]",
        disabled && "opacity-50 cursor-not-allowed",
      )}
      data-haptic="selection"
      onClick={handleSelect}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleSelect();
        }
      }}
      aria-pressed={selected}
      aria-disabled={disabled}
    >
      {/* selection ring + bronze tint when selected */}
      {selected && (
        <>
          <div className="absolute inset-0 rounded-xl pointer-events-none z-20 [box-shadow:inset_0_0_0_2px_var(--bronze-face)]" />
          <div className="absolute inset-0 bg-bronze-face/12 pointer-events-none z-10" />
        </>
      )}

      {cardContent}
    </div>
  );
});

import { memo } from "react";
import { Link } from "@tanstack/react-router";
import { IconEyeFilled as EyeSlashIcon } from "nucleo-micro-bold";
import { useGameName } from "@/hooks/use-game-name";
import { useSelectionStore, type SelectedAsset } from "@/stores/selection-store";
import { useSettings } from "@/hooks/use-settings";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { FormatChip } from "@/components/ui/format-chip";
import { cn } from "@/lib/utils";

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

interface AssetListItemProps {
  id: string;
  name: string;
  gameName: string;
  categoryName: string;
  url: string;
  extension?: string;
  isSuggestive?: boolean;
  size?: number;
}

export const AssetListItem = memo(function AssetListItem({
  id,
  name,
  gameName,
  categoryName,
  url,
  extension = "png",
  isSuggestive = false,
  size,
}: AssetListItemProps) {
  const displayGameName = useGameName(gameName);
  const isSelectMode = useSelectionStore((s) => s.isSelectMode);
  const selected = useSelectionStore((s) => !!s.selectedAssets[id]);
  const atLimit = useSelectionStore((s) => Object.keys(s.selectedAssets).length >= 350);
  const toggleAsset = useSelectionStore((s) => s.toggleAsset);
  const { settings } = useSettings();
  const { triggerHaptic } = useHaptics();

  const isBlocked = isSuggestive && !settings.showSuggestiveContent;
  const disabled = !selected && atLimit;

  const handleSelect = () => {
    if (disabled) {
      triggerHaptic(HAPTIC.WARNING);
      return;
    }
    const asset: SelectedAsset = { id, name, url, gameName, categoryName, extension };
    toggleAsset(asset);
    triggerHaptic(selected ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);
  };

  if (isBlocked) {
    return (
      <div className="surface-raised flex items-center gap-3 px-3 py-2.5 rounded-xl select-none">
        <div className="surface-well size-12 rounded-lg shrink-0 flex items-center justify-center">
          <EyeSlashIcon className="size-5 text-muted-foreground/60" />
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Suggestive Content</p>
          <p className="text-xs text-muted-foreground/60">Enable in settings to view</p>
        </div>
      </div>
    );
  }

  const content = (
    <div className="flex items-center gap-3 w-full min-w-0">
      <img
        src={url}
        alt={name}
        className="surface-well size-12 rounded-lg object-cover shrink-0"
        loading="lazy"
      />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{name}</p>
        <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5 mt-0.5">
          <span>{displayGameName}</span>
          <span className="opacity-40">&middot;</span>
          <FormatChip extension={extension} variant="inline" />
          {size != null && size > 0 && <span>{formatSize(size)}</span>}
        </p>
      </div>
    </div>
  );

  if (!isSelectMode) {
    return (
      <Link
        to="/asset/$id"
        params={{ id }}
        data-haptic="selection"
        className="surface-raised-pressable group flex items-center gap-3 px-3 py-2.5 rounded-xl"
      >
        {content}
      </Link>
    );
  }

  return (
    <div
      className={cn(
        "surface-raised-pressable relative flex items-center gap-3 px-3 py-2.5 rounded-xl",
        selected &&
          "[box-shadow:inset_0_0_0_2px_var(--bronze-face),inset_0_1px_0_0_var(--rim-light),inset_0_-1px_0_0_var(--rim-shadow-soft)]",
        disabled && "opacity-50 cursor-not-allowed",
      )}
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
      {content}
    </div>
  );
});

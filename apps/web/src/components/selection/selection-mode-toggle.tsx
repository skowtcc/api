import { useSelectionStore } from "@/stores/selection-store";
import { cn } from "@/lib/utils";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { IconStack, IconStackFilled } from "nucleo-micro-bold";

interface SelectionModeToggleProps {
  className?: string;
}

export function SelectionModeToggle({ className }: SelectionModeToggleProps) {
  const { isSelectMode, toggleSelectMode, getSelectedCount } = useSelectionStore();
  const { triggerHaptic } = useHaptics();
  const selectedCount = getSelectedCount();

  const handleToggle = () => {
    toggleSelectMode();
    triggerHaptic(isSelectMode ? HAPTIC.LIGHT_ACTION : HAPTIC.ACTION);
  };

  return (
    <button
      onClick={handleToggle}
      data-haptic="off"
      className={cn(
        "relative flex items-center gap-2 rounded-md px-3 py-2.5",
        isSelectMode
          ? "surface-nav-active"
          : "text-muted-foreground hover:text-foreground hover:surface-nav-hover",
        className,
      )}
      aria-pressed={isSelectMode}
      aria-label="Toggle bulk selection mode"
    >
      {isSelectMode ? <IconStackFilled className="size-4" /> : <IconStack className="size-4" />}

      <span className="text-sm whitespace-nowrap flex items-center gap-1.5">
        {isSelectMode ? "Selecting" : "Select"}
        {selectedCount > 0 && (
          <span className="surface-accent-solid inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1.5 text-xs font-medium tabular-nums rounded-full">
            {selectedCount}
          </span>
        )}
      </span>
    </button>
  );
}

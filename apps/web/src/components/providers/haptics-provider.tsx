import * as React from "react";
import { useWebHaptics } from "web-haptics/react";
import { useSettings } from "@/hooks/use-settings";
import {
  isHapticInputDisabled,
  resolveHapticFromDataAttr,
  type HapticDefinition,
} from "@/lib/haptics";

interface HapticsContextValue {
  isEnabled: boolean;
  triggerHaptic: (def: HapticDefinition) => void;
}

const HapticsContext = React.createContext<HapticsContextValue | undefined>(undefined);

const INTERACTIVE_HAPTIC_SELECTOR = "[data-haptic],button,[role='button']";

function isPrimaryTouchLikePress(event: PointerEvent): boolean {
  const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";
  return isTouchLike && event.button === 0;
}

export function HapticsProvider({ children }: { children: React.ReactNode }) {
  const { settings } = useSettings();
  const { trigger } = useWebHaptics();
  const isEnabled = settings.enableHaptics;

  const triggerHaptic = React.useCallback(
    (def: HapticDefinition) => {
      if (!isEnabled) return;
      void trigger(def.pattern, def.options);
    },
    [isEnabled, trigger],
  );

  React.useEffect(() => {
    if (typeof document === "undefined") return;

    const onPointerDown = (event: PointerEvent) => {
      if (!isEnabled || !isPrimaryTouchLikePress(event)) return;

      const target = event.target;
      if (!(target instanceof Element)) return;

      const interactive = target.closest<HTMLElement>(INTERACTIVE_HAPTIC_SELECTOR);
      if (!interactive) return;

      if (
        interactive.hasAttribute("disabled") ||
        interactive.getAttribute("aria-disabled") === "true" ||
        interactive.getAttribute("data-disabled") === "true"
      ) {
        return;
      }

      const requestedInput = interactive.getAttribute("data-haptic");
      if (isHapticInputDisabled(requestedInput)) return;

      const def = resolveHapticFromDataAttr(requestedInput);
      void trigger(def.pattern, def.options);
    };

    document.addEventListener("pointerdown", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [isEnabled, trigger]);

  const contextValue = React.useMemo(
    () => ({ isEnabled, triggerHaptic }),
    [isEnabled, triggerHaptic],
  );

  return <HapticsContext.Provider value={contextValue}>{children}</HapticsContext.Provider>;
}

export function useHaptics() {
  const context = React.useContext(HapticsContext);
  if (!context) {
    throw new Error("useHaptics must be used within a HapticsProvider");
  }
  return context;
}

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { IconChevronUp } from "nucleo-micro-bold";
import { useSelectionStore } from "@/stores/selection-store";
import { useHaptics } from "@/components/providers/haptics-provider";
import { HAPTIC } from "@/lib/haptics";
import { SelectionPill } from "./selection/selection-pill";

const SCROLL_THRESHOLD = 400;
// shared so the pill's reflow and the button's enter/exit feel like one motion
const TRANSITION = { duration: 0.22, ease: [0.16, 1, 0.3, 1] } as const;

export function FloatingActions() {
  const [showScrollTop, setShowScrollTop] = useState(false);
  const { isSelectMode, getSelectedCount } = useSelectionStore();

  const selectedCount = getSelectedCount();
  const showPill = isSelectMode || selectedCount > 0;

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > SCROLL_THRESHOLD);
    };

    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const { triggerHaptic } = useHaptics();

  const scrollToTop = () => {
    triggerHaptic(HAPTIC.LIGHT_ACTION);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  if (!showScrollTop && !showPill) return null;

  return (
    /* mobile bottom offset = nav height (3.5rem) + its safe-area padding + a
       gap, so the buttons float clear of the bar instead of colliding with it
       on devices with a home-indicator inset */
    <div className="fixed bottom-[calc(4.75rem+max(0.5rem,env(safe-area-inset-bottom)))] right-4 md:bottom-6 md:right-6 z-50 flex items-end gap-2">
      {/* layout + AnimatePresence: when the scroll-top button enters/leaves, the
          pill smoothly reflows (slides left to make room, back when it's gone) */}
      <AnimatePresence>
        {showPill && (
          <motion.div
            key="pill"
            layout
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={TRANSITION}
          >
            <SelectionPill />
          </motion.div>
        )}

        {showScrollTop && (
          <motion.button
            key="scroll-top"
            layout
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={TRANSITION}
            onClick={scrollToTop}
            data-haptic="light"
            className="surface-raised-pressable h-[52px] w-[52px] rounded-full flex items-center justify-center text-muted-foreground shrink-0"
            aria-label="Scroll to top"
          >
            <IconChevronUp className="size-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}

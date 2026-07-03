import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface ScrollFadeRowProps {
  children: React.ReactNode;
  /** classes for the scroll container (overflow behaviour lives here) */
  className?: string;
  /** classes for the inner flex row */
  innerClassName?: string;
  /** edge-fade width; tighten where the fade would eat content (e.g. rows
   *  over the hero banner art, where the faded zone reveals the backdrop) */
  fade?: string;
}

const DEFAULT_FADE = "2rem";

/**
 * A horizontally scrollable row with scroll-aware edge fades: an edge is
 * masked only while content is hidden beyond it, and both masks drop when the
 * row doesn't overflow - so it composes with responsive wrap breakpoints for
 * free (no overflow, no fade).
 */
export function ScrollFadeRow({
  children,
  className,
  innerClassName,
  fade = DEFAULT_FADE,
}: ScrollFadeRowProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ left: false, right: false });

  useEffect(() => {
    const el = scrollRef.current;
    const inner = innerRef.current;
    if (!el || !inner) return;

    const update = () => {
      // 1px tolerance: fractional scroll positions on zoomed/hidpi screens
      const left = el.scrollLeft > 1;
      const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
    };

    update();
    el.addEventListener("scroll", update, { passive: true });
    /* observe both boxes: the container resizing and the content growing
       (chips render async - counts load, filter pills appear) */
    const observer = new ResizeObserver(update);
    observer.observe(el);
    observer.observe(inner);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  const maskImage =
    edges.left || edges.right
      ? `linear-gradient(to right, ${edges.left ? `transparent, black ${fade}` : "black"}, ${
          edges.right ? `black calc(100% - ${fade}), transparent` : "black"
        })`
      : undefined;

  return (
    <div
      ref={scrollRef}
      className={cn("overflow-x-auto no-scrollbar", className)}
      style={maskImage ? { maskImage, WebkitMaskImage: maskImage } : undefined}
    >
      <div ref={innerRef} className={cn("flex items-center", innerClassName)}>
        {children}
      </div>
    </div>
  );
}

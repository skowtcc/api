import { Children, isValidElement, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AssetGridProps {
  children: React.ReactNode;
  className?: string;
}

/* same thresholds as the old @container column classes (@5xl / @7xl / 100rem),
   so the column count still tracks content width - a sidebar narrowing the
   content drops columns instead of cramming them */
function columnsForWidth(width: number): number {
  if (width >= 1600) return 5;
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  return 2;
}

/* estimated relative height of a card at fixed column width. mirrors the
   card's own rendering rule (aspect-ratio from dimensions, square fallback)
   so the estimate matches what actually paints */
function estimateHeight(child: ReactNode): number {
  if (isValidElement(child)) {
    const dims = (child.props as { dimensions?: { width: number; height: number } }).dimensions;
    if (dims?.width && dims?.height) return dims.height / dims.width;
  }
  return 1;
}

/* masonry with stable appends. CSS multi-columns re-balance the entire layout
   whenever items are appended (the browser redistributes cards to equalize
   column heights), so loading the next infinite-scroll page visibly shuffled
   cards the user was looking at. instead we partition items into real column
   stacks ourselves: greedy shortest-column-first using each card's known
   aspect ratio. the assignment is deterministic and prefix-stable - appending
   new items can only add to column bottoms, never move existing cards */
export function AssetGrid({ children, className }: AssetGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setColumnCount(columnsForWidth(el.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = Children.toArray(children);

  /* pre-measure render (SSR + first client paint): the old CSS-columns layout,
     visually identical for the initial page. the JS partition takes over after
     mount and only re-lays-out if the measured column count differs */
  if (columnCount === null) {
    return (
      <div ref={containerRef} className="@container">
        <div
          className={cn(
            "columns-2 @5xl:columns-3 @7xl:columns-4 @min-[100rem]:columns-5 gap-x-4",
            className,
          )}
        >
          {items.map((child, i) => (
            <div key={i} className="break-inside-avoid mb-4">
              {child}
            </div>
          ))}
        </div>
      </div>
    );
  }

  const heights = Array<number>(columnCount).fill(0);
  const columns: ReactNode[][] = Array.from({ length: columnCount }, () => []);
  for (const child of items) {
    const target = heights.indexOf(Math.min(...heights));
    columns[target].push(child);
    /* + a small constant for the card's chrome/gap so tall stacks of short
       cards don't get over-packed relative to the pure image-height estimate */
    heights[target] += estimateHeight(child) + 0.1;
  }

  return (
    <div ref={containerRef} className={cn("flex items-start gap-4", className)}>
      {columns.map((column, i) => (
        <div key={i} className="flex-1 min-w-0">
          {column.map((child, j) => (
            /* Children.toArray children carry their original keys (asset ids),
               so reconciliation tracks the asset, not the slot - no remounts
               when the same card keeps its position across a re-render */
            <div key={isValidElement(child) && child.key != null ? child.key : j} className="mb-4">
              {child}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

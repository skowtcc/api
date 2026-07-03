import { useEffect, useRef } from "react";

interface LoadMoreProps {
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

/* shared infinite-scroll trigger: an IntersectionObserver sentinel that calls
   fetchNextPage when scrolled into view. lives in one place so the asset
   browser and the "Similar Assets" section share the same behaviour */
export function LoadMore({ hasNextPage, isFetchingNextPage, fetchNextPage }: LoadMoreProps) {
  const loadMoreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          fetchNextPage();
        }
      },
      /* fire ~3-4 viewports ahead: a fast flick covers 1000px before the
         fetch round-trip lands, so the margin has to outrun momentum
         scrolling, not walking pace. combined with the 100-item pages the
         spinner is effectively unreachable */
      { threshold: 0, rootMargin: "3000px 0px" },
    );

    const currentRef = loadMoreRef.current;
    if (currentRef) {
      observer.observe(currentRef);
    }

    return () => {
      if (currentRef) {
        observer.unobserve(currentRef);
      }
    };
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  /* invisible sentinel: the skeleton runway rendered after it (see
     AssetBrowser) is the loading affordance - momentum scrolling continues
     into ghost cards instead of dying at the document floor, and the next
     page swaps in beneath the user mid-flight */
  return <div ref={loadMoreRef} aria-hidden className="h-px" />;
}

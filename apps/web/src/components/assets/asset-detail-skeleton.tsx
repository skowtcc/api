import { Skeleton } from "@/components/ui/skeleton";
import { AssetGrid } from "@/components/assets/asset-grid";

const SIMILAR_RATIOS = [1, 1.3, 0.8, 1.1, 0.9, 1.4, 1, 0.75];

export function AssetDetailSkeleton() {
  return (
    <>
      <div className="flex flex-col lg:flex-row gap-10">
        {/* image */}
        <div className="w-full lg:w-1/2 shrink-0">
          <Skeleton className="w-full aspect-square lg:aspect-auto lg:h-[440px] rounded-2xl" />
        </div>

        {/* info */}
        <div className="w-full lg:w-1/2 min-w-0 space-y-6">
          {/* header: title · game/category · uploader handle */}
          <div className="space-y-2">
            <Skeleton className="h-9 lg:h-10 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
            <div className="flex items-center gap-2 pt-1">
              <Skeleton className="size-5 rounded-full" />
              <Skeleton className="h-3.5 w-28" />
            </div>
          </div>

          {/* tags */}
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-6 w-14 rounded-full" />
          </div>

          {/* actions */}
          <div className="space-y-2.5">
            <Skeleton className="h-11 w-full rounded-xl" />
            <div className="flex gap-2.5">
              <Skeleton className="h-10 flex-1 rounded-xl" />
              <Skeleton className="h-10 flex-1 rounded-xl" />
            </div>
          </div>
        </div>
      </div>

      {/* similar assets */}
      <div className="mt-16">
        <Skeleton className="h-8 w-48 mb-8" />
        <AssetGrid>
          {SIMILAR_RATIOS.map((ratio, i) => (
            <Skeleton
              key={i}
              className="w-full rounded-xl"
              style={{ aspectRatio: `1 / ${ratio}` }}
            />
          ))}
        </AssetGrid>
      </div>
    </>
  );
}

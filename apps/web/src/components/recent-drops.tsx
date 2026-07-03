import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { gameCoverUrl, gameIconUrl } from "@/lib/api-transforms";
import { timeAgo } from "@/lib/time";
import { flatChipStyle } from "@/lib/chip";
import { ScrollFadeRow } from "@/components/ui/scroll-fade-row";
import { Skeleton } from "@/components/ui/skeleton";

/* the stat band's colour-fact vocabulary, reused: violet = assets (the count),
   green = games (the NEW badge) */
const NEW_BADGE_COLOR = "oklch(0.85 0.10 162)";
const COUNT_COLOR = "oklch(0.82 0.10 285)";

/**
 * game-update cards: one wide art-backed card
 * per game with recent uploads. cover art carries the identity, the corners
 * carry the facts - count bottom-left, recency bottom-right - so a bulk drop
 * reads as an event poster instead of a wall of tiles. clicking drops into
 * the browser filtered to that game. renders nothing in quiet months
 */
export function RecentDropsRow() {
  const trpc = useTRPC();
  const { data, isLoading } = useQuery(trpc.asset.getRecentDrops.queryOptions());

  /* same footprint as the loaded cards, so the page doesn't shift when the
     query lands (drops are near-always present; a quiet month eats one
     skeleton→empty collapse, the rare case worth trading for zero CLS) */
  if (isLoading) {
    return (
      <div className="flex gap-2.5 overflow-hidden">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 flex-1 min-w-[300px] max-w-[420px] rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.drops.length) return null;

  return (
    <ScrollFadeRow fade="1rem" innerClassName="gap-2.5">
      {data.drops.map((drop) => (
        <Link
          key={drop.game.id}
          to="/"
          search={{ games: drop.game.slug }}
          className="group shrink-0 flex-1 min-w-[300px] max-w-[420px]"
        >
          <div className="relative h-24 overflow-hidden rounded-xl bg-card">
            <img
              src={gameCoverUrl(drop.game.slug)}
              alt=""
              aria-hidden
              loading="lazy"
              className="absolute inset-0 size-full object-cover object-[center_15%] opacity-50 transition-opacity group-hover:opacity-65"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-card/90 via-card/30 to-card/20"
            />
            <div className="relative flex h-full flex-col justify-between p-3">
              <div className="flex items-center gap-2">
                <img
                  src={gameIconUrl(drop.game.slug)}
                  alt=""
                  className="size-6 rounded-md object-cover shrink-0"
                  loading="lazy"
                />
                <span className="text-sm font-semibold">{drop.game.name}</span>
                {drop.isNewGame && (
                  <span
                    className="rounded px-1.5 py-px text-[10px] font-bold tracking-wide"
                    style={flatChipStyle(NEW_BADGE_COLOR, 24)}
                  >
                    NEW
                  </span>
                )}
              </div>
              <div className="flex items-end justify-between text-xs">
                <span
                  className="rounded px-1.5 py-0.5 font-bold tabular-nums"
                  style={flatChipStyle(COUNT_COLOR, 24)}
                >
                  +{drop.count.toLocaleString()} assets
                </span>
                <span className="text-muted-foreground font-medium">
                  {timeAgo(drop.latest)} ago
                </span>
              </div>
            </div>
          </div>
        </Link>
      ))}
    </ScrollFadeRow>
  );
}

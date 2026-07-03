import { CoverHero, COVER_CREDIT_CLASS, GAME_COPYRIGHT } from "@/components/cover-hero";
import { PromoBanner } from "@/components/home-hero";
import { formatCount } from "@/lib/seo";
import { timeAgo } from "@/lib/time";

interface GameLandingData {
  game: { id: string; slug: string; name: string };
  totalAssets: number;
  latestAssetAt: string | null;
  categories: Array<{ id: string; slug: string; name: string; count: number }>;
}

interface GameLandingHeroProps {
  landing: GameLandingData;
  /** set on /games/$slug/$category - scopes the count and the H1 subject */
  activeCategory?: { id: string; slug: string; name: string; count: number };
}

// categories stat keeps the filter-vocabulary teal
const CATEGORY_TONE = "oklch(0.83 0.10 200)";

/**
 * SEO landing hero for /games/$slug and /games/$slug/$category: the same
 * promo banner + cover frame as the homepage, over the game's own art, with
 * the game-scoped fact as the H1 ("1,024 Genshin Impact assets"). category
 * navigation lives in the filter bar (plus sitemaps and asset-page
 * breadcrumbs for crawlers) - the hero stays a scene, not a menu.
 */
export function GameLandingHero({ landing, activeCategory }: GameLandingHeroProps) {
  const { game, totalAssets, categories } = landing;
  const count = activeCategory ? activeCategory.count : totalAssets;
  const subject = activeCategory ? `${game.name} ${activeCategory.name}` : `${game.name} assets`;

  return (
    <div className="-mt-3 space-y-2.5">
      <PromoBanner />
      <CoverHero
        slug={game.slug}
        ariaLabel={`${game.name} assets`}
        credit={
          <span className={COVER_CREDIT_CLASS}>art © {GAME_COPYRIGHT[game.slug] ?? game.name}</span>
        }
      >
        <div className="mx-auto space-y-3 text-center sm:mx-0 sm:text-left">
          {/* the lockup: same anatomy as the homepage - display number,
              muted subject, stat prose beneath. the h1 carries the full
              crawlable fact */}
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums">
            {formatCount(count)}
            <span className="ml-2 text-lg sm:text-xl font-semibold text-foreground/70 tracking-normal">
              {subject}
            </span>
          </h1>

          <div className="flex items-center justify-center gap-2.5 text-sm sm:justify-start">
            <span>
              <span className="font-bold tabular-nums" style={{ color: CATEGORY_TONE }}>
                {formatCount(categories.length)}
              </span>
              <span className="ml-1.5 font-medium text-foreground/70">
                {categories.length === 1 ? "category" : "categories"}
              </span>
            </span>
            {landing.latestAssetAt && (
              <>
                <span className="text-muted-foreground/40">·</span>
                <span className="font-medium text-foreground/70">
                  updated {timeAgo(landing.latestAssetAt)} ago
                </span>
              </>
            )}
          </div>
        </div>
      </CoverHero>
    </div>
  );
}

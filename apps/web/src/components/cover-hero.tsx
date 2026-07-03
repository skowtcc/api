import type { ReactNode } from "react";
import { gameCoverUrl } from "@/lib/api-transforms";

/* rights holder per game for the hero art credit. client-side map until the
   per-game attribution column is surfaced here; unknown slugs fall back to
   the game's display name */
export const GAME_COPYRIGHT: Record<string, string> = {
  "genshin-impact": "HoYoverse",
  "honkai-star-rail": "HoYoverse",
  "honkai-impact-3rd": "HoYoverse",
  "honkai-nexus-anima": "HoYoverse",
  "zenless-zone-zero": "HoYoverse",
  "tears-of-themis": "HoYoverse",
  "wuthering-waves": "Kuro Games",
  "blue-archive": "NEXON Games",
  "goddess-of-victory-nikke": "SHIFT UP",
  "cookie-run": "Devsisters",
  dislyte: "Lilith Games",
  "project-sekai": "SEGA / Colorful Palette",
  "reverse-1999": "Bluepoch",
  "tower-of-fantasy": "Hotta Studio",
  "persona-3-reload": "ATLUS",
  balatro: "LocalThunk",
  "neon-white": "Angel Matrix",
  crosscode: "Radical Fish Games",
  "risk-of-rain-2": "Hopoo Games",
  "hollow-knight-silksong": "Team Cherry",
};

/* the credit pill bottom-right of the frame; callers render a Link or span
   with this class so home and landing heroes stay visually identical */
export const COVER_CREDIT_CLASS =
  "absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-lg bg-card/75 px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:bg-card";

interface CoverHeroProps {
  /** cover-art game; null renders the plain card frame with no art */
  slug: string | null;
  /** credit pill node (use COVER_CREDIT_CLASS); rendered only with art */
  credit?: ReactNode;
  ariaLabel?: string;
  children: ReactNode;
}

/**
 * the homepage hero's cover frame, shared so game landing pages wear the
 * exact same scene: cover art with an even dim, a left readability gradient
 * under the lockup, and the art-credit pill. content floats centre-left in a
 * fixed-min-height row. a missing cover (404) hides itself and the frame
 * degrades to the plain card
 */
export function CoverHero({ slug, credit, ariaLabel, children }: CoverHeroProps) {
  return (
    <section className="relative overflow-hidden rounded-2xl bg-card" aria-label={ariaLabel}>
      {slug && (
        <>
          <img
            src={gameCoverUrl(slug)}
            alt=""
            aria-hidden
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = "none";
            }}
            className="absolute inset-0 size-full object-cover object-[center_15%] opacity-90"
          />
          {/* lighter even dim + a local scrim under the lockup only, so the
              art stays vivid while the numbers always sit on quiet ground */}
          <div aria-hidden className="absolute inset-0 bg-card/75 sm:bg-card/60" />
          <div
            aria-hidden
            className="absolute inset-y-0 left-0 hidden w-3/5 bg-gradient-to-r from-card/80 via-card/35 to-transparent sm:block"
          />
          {credit}
        </>
      )}
      <div className="relative flex min-h-[13rem] sm:min-h-[15rem] items-center p-4 sm:p-6">
        {children}
      </div>
    </section>
  );
}

import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { IconExternalLink } from "nucleo-micro-bold";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { STATS, fmt } from "@/components/site-stats-hero";
import { RecentDropsRow } from "@/components/recent-drops";
import { cdnAssetUrl } from "@/lib/api-transforms";
import { CoverHero, COVER_CREDIT_CLASS, GAME_COPYRIGHT } from "@/components/cover-hero";
import { softChipStyle } from "@/lib/chip";

const DISCORD_INVITE = "https://discord.gg/noid";
const ORIGINOID_URL = "https://originoid.co";

/* promo tints: Discord keeps its blurple; Originoid gets a rose in the same
   pastel band as the stat chips (swap for the real brand colour if it differs) */
const DISCORD_COLOR = "var(--discord)";
const ORIGINOID_COLOR = "oklch(0.82 0.10 350)";

const PROMO_INTERVAL_MS = 8000;

// hand-picked hero cover; swap per patch or set null for automatic latest-drop
const HERO_FEATURED_SLUG: string | null = "zenless-zone-zero";

/**
 * homepage hero, top to bottom:
 *  1. slim rotating promo banner (their event-banner slot) - Discord and
 *     Originoid funnels cycling with a crossfade, dash indicators, pause on
 *     hover;
 *  2. tall art hero: latest drop's cover as an evenly-dimmed scene with the
 *     asset-count lockup floating centre-left;
 *  3. game-update cards (their contest-card slot) - cover-art event cards,
 *     one per recent drop
 */
export function HomeHero() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.asset.getRecentDrops.queryOptions());
  const { data: totals } = useQuery(trpc.stats.getSiteTotals.queryOptions());
  /* curated hero backdrop: the featured slug renders unconditionally (it
     doesn't need a recent drop - cover + (c) resolve from the slug alone).
     set HERO_FEATURED_SLUG to null to track the latest drop automatically */
  const latestGame = HERO_FEATURED_SLUG
    ? {
        slug: HERO_FEATURED_SLUG,
        name:
          data?.drops.find((d) => d.game.slug === HERO_FEATURED_SLUG)?.game.name ??
          HERO_FEATURED_SLUG,
      }
    : data?.drops[0]?.game;

  return (
    <div className="-mt-3 space-y-2.5">
      <PromoBanner />

      <CoverHero
        slug={latestGame?.slug ?? null}
        ariaLabel="Site stats"
        credit={
          latestGame && (
            /* art credit: names the cover's game,
               clicks through to its catalog */
            <Link to="/" search={{ games: latestGame.slug }} className={COVER_CREDIT_CLASS}>
              art © {GAME_COPYRIGHT[latestGame.slug] ?? latestGame.name}
            </Link>
          )
        }
      >
        {/* the lockup: display number, plain-fact subline, supporting stats
          beneath - one left-anchored block floating in the scene */}
        <div className="mx-auto space-y-3 text-center sm:mx-0 sm:text-left">
          <div className="text-3xl sm:text-4xl font-extrabold tracking-tight tabular-nums">
            {totals ? totals.assets.toLocaleString() : "-"}
            <span className="ml-2 text-lg sm:text-xl font-semibold text-foreground/70 tracking-normal">
              assets
            </span>
          </div>
          {/* stats as prose, not badges: coloured numbers, muted labels,
              interpunct separators - the labels name the facts, so icons
              would only add uniformed clutter */}
          <div className="flex items-center justify-center gap-2.5 text-sm sm:justify-start">
            {STATS.filter((s) => s.key !== "assets").map(({ key, label, color }, i) => (
              <span key={key} className="inline-flex items-center gap-2.5">
                {i > 0 && <span className="text-muted-foreground/40">·</span>}
                <span>
                  <span className="font-bold tabular-nums" style={{ color }}>
                    {fmt(totals?.[key as "games" | "downloads" | "views"])}
                  </span>
                  <span className="ml-1.5 font-medium text-foreground/70">{label}</span>
                </span>
              </span>
            ))}
          </div>
        </div>
      </CoverHero>

      <RecentDropsRow />
    </div>
  );
}

type Promo = {
  key: string;
  href: string;
  color: string;
  title: string;
  subtitle: string;
  /** hand-tightened one-liner for small screens - a written short version
   *  keeps the message intact where truncation would amputate it */
  subtitleShort: string;
  icon: React.ReactNode;
};

/**
 * slim rotating funnel banner. crossfades between promos on a timer, pauses
 * while hovered, dash indicators double as manual switches. state-driven
 * opacity transition only - no animation library
 */
export function PromoBanner() {
  const trpc = useTRPC();
  const { data: discord } = useQuery(trpc.stats.getDiscord.queryOptions());
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const promos: Promo[] = [
    {
      key: "discord",
      href: DISCORD_INVITE,
      color: DISCORD_COLOR,
      title: "Join our Discord",
      subtitle: discord?.members
        ? `${discord.members.toLocaleString()} members · get support, updates & assets missing from the site`
        : "get support, updates & assets missing from the site",
      subtitleShort: discord?.members
        ? `${discord.members.toLocaleString()} members · updates & missing assets`
        : "support, updates & missing assets",
      icon: <DiscordGlyph className="size-6 shrink-0" />,
    },
    {
      key: "originoid",
      href: ORIGINOID_URL,
      color: ORIGINOID_COLOR,
      title: "Work stolen?",
      subtitle:
        "Originoid protects your work from theft, edits and misuse, plus OC sharing and custom algorithms · from the creator of skowt.cc",
      subtitleShort: "Originoid protects your art from thieves",
      icon: (
        <img
          src={cdnAssetUrl("0198390e-6bff-775b-8027-bb8f7f0345e4")}
          alt=""
          className="size-10 shrink-0 object-contain"
          loading="lazy"
        />
      ),
    },
  ];

  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setActive((a) => (a + 1) % promos.length), PROMO_INTERVAL_MS);
    return () => clearInterval(id);
  }, [paused, promos.length]);

  return (
    <div
      className="relative h-14"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {promos.map((p, i) => (
        <a
          key={p.key}
          href={p.href}
          target="_blank"
          rel="noopener noreferrer"
          tabIndex={i === active ? 0 : -1}
          aria-hidden={i !== active}
          className={`group absolute inset-0 transition-opacity duration-500 ${
            i === active ? "opacity-100" : "pointer-events-none opacity-0"
          }`}
        >
          <div
            className="flex h-full items-center gap-3 rounded-xl px-4"
            style={softChipStyle(p.color)}
          >
            {/* rotation rail: two vertical bars spanning the banner height,
                the lit one is the active promo; click switches */}
            <span className="flex flex-col justify-center gap-1 shrink-0" aria-hidden>
              {promos.map((_, d) => (
                <button
                  key={d}
                  type="button"
                  tabIndex={-1}
                  onClick={(e) => {
                    e.preventDefault();
                    setActive(d);
                  }}
                  className={`w-1 h-4 rounded-full transition-opacity ${
                    d === active ? "opacity-90" : "opacity-40 hover:opacity-65"
                  }`}
                  style={{ background: "currentcolor" }}
                />
              ))}
            </span>
            <span className="flex w-10 shrink-0 items-center justify-center">{p.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-bold leading-tight whitespace-nowrap">{p.title}</div>
              <div className="hidden text-xs font-medium opacity-70 truncate sm:block">
                {p.subtitle}
              </div>
              <div className="text-xs font-medium opacity-70 truncate sm:hidden">
                {p.subtitleShort}
              </div>
            </div>
            <IconExternalLink
              className="size-4 shrink-0 opacity-50 transition-opacity group-hover:opacity-90"
              aria-hidden
            />
          </div>
        </a>
      ))}
    </div>
  );
}

function DiscordGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z" />
    </svg>
  );
}

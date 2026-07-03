import { createFileRoute } from "@tanstack/react-router";
import { GoBack } from "@/components/ui/go-back";
import { PageHeader } from "@/components/ui/page-header";
import { Chip } from "@/components/ui/chip";

export const Route = createFileRoute("/changelog")({
  component: ChangelogComponent,
  head: () => ({
    meta: [
      { title: "Changelog - skowt.cc" },
      {
        name: "description",
        content: "Latest updates, improvements, and changes to skowt.cc.",
      },
      { name: "og:title", content: "Changelog - skowt.cc" },
      {
        name: "og:description",
        content: "Latest updates, improvements, and changes to skowt.cc.",
      },
    ],
  }),
});

interface ChangelogEntry {
  date: string;
  version: string;
  title: string;
  description: string;
  changes: string[];
  isLatest?: boolean;
}

const changelog: ChangelogEntry[] = [
  {
    date: "July 1st, 2026",
    version: "v5.2",
    title: "skowt v5.2",
    description:
      "A cleaner look, much faster search and browsing, and a pile of fixes you asked for.",
    changes: [
      "Search is fast now. I rebuilt it so it stops reading through all 39,000+ asset names on every keystroke. Results appear as you type and the grid never blanks out",
      "Asset previews used to load the full-size file, some over 4MB. Cards now load a tiny optimised copy: one preview went from 4.7MB to 23KB. Much kinder to mobile data",
      "The site had lost a few of its database shortcuts somewhere along the way. I put them back, so sorting by most downloaded or most viewed stopped checking the whole catalog, and most pages load faster",
      "Similar assets used to stop at 8. Now more load as you scroll, closest matches first: same game and category, then the same game, then the same category from other games",
      "I brung back the old wanderer.moe style and focused on whimsy instead",
      "The grid sits still now: images reserve their spot before they load, and new batches stack in underneath without shuffling the cards you're looking at. The next batch also loads before you reach the bottom",
      "The homepage now leads with the totals: assets, games, downloads and views",
      "On desktop, Games, Categories and Tags are searchable dropdowns instead of a wall of pills, and your active filters show as chips you can remove",
      "Medium-sized screens no longer get a crowded layout: the filters and grid size to the space next to the sidebar instead of the whole window",
      "On closed requests you can still see whether you upvoted: your vote keeps its colour, just faded out",
      "Game icons show inside the filter dropdowns and on your active filters",
      "Your role lives in your username now: the handle picks up its colour and icon, no separate badge",
      "The link in your address bar remembers your search and filters, so you can bookmark or share a filtered view, and the back button drops you right where you left off",
      "Empty pages (no saved assets, nothing downloaded, no search matches) show artwork instead of a blank gap",
      "I removed duplicate assets that snuck into the catalog over the years (and one that was somehow an empty file)",
      "Plus the small stuff: filter menus are no longer see-through over the grid, the scroll-to-top button stays clear of the mobile nav, the request status label no longer shows its icon twice, tidied the logo, fixed the loading placeholder on asset pages, matched the filter chip colours, cleaner sidebar highlighting, and spacing fixes all over",
    ],
    isLatest: true,
  },
  {
    date: "May 17th, 2026",
    version: "v5.1.2",
    title: "skowt v5.1.2",
    description: "New look, plus some things cooking in the background.",
    changes: [
      "Full UI redesign, new dark theme with a more tactile feel across nav, cards, buttons and chrome",
      "/votes is now /requests (old links will redirect)",
      "Some new features are quietly in testing behind feature flags, they'll roll out once I'm happy with them",
    ],
    isLatest: false,
  },
  {
    date: "March 8th, 2026",
    version: "v5.0.1",
    title: "skowt v5",
    description: "New UI and heavy mobile fixes",
    changes: [
      "PWA support, install skowt to your home screen from Settings",
      "Improved single asset downloading on iOS",
      "Search and filter on /votes",
      "UI overhaul",
      "Improved filter bar layout and spacing",
      "Added haptic feedback on mobile",
    ],
    isLatest: false,
  },
  {
    date: "January 2nd, 2026",
    version: "v4.0.4",
    title: "Week 1 Hotfixes",
    description: "Fixing authentication issues and improving mobile UX.",
    changes: [
      "Fixed /downloads and /saved pages failing to load",
      "Grouped navigation items in user menu for better organization",
      "Download history is now viewable on mobile",
    ],
    isLatest: false,
  },
  {
    date: "December 28th, 2025",
    version: "v4.0.3",
    title: "Day 1 Hotfixes: Batch 3",
    description: "I'm so locked in rn I don't even know what to write here",
    changes: [
      "Added a data export route for transparency so you can what data skowt collects",
      "Fixed mobile input scaling issues",
      "Removed /about in favour of /faq",
      "Added a 'I dont have discord' button in login, alongside an explanation on why Discord is (currently) needed.",
      "Fixed the header vanishing you scrolled down a little and tried clicking on your profile pic on larger devices.",
      "Reintroduced /contributors",
    ],
    isLatest: false,
  },
  {
    date: "December 28th, 2025",
    version: "v4.0.2",
    title: "Day 1 Hotfixes: Batch 2",
    description: "Further small additions from v4.0.1",
    changes: [
      "Fixed UI issues regarding x overflow that wasn't handled properly on mobile",
      "Added upvoting comments on /vote (thanks to markus for the suggestion)",
      "Fixed broken upvoting logic and state (ty trek for reporting)",
      "Fixed UI for mobile users when downloading individual assets",
      "Updated /downloads to store both batch downloads and individual asset downloads",
    ],
    isLatest: false,
  },
  {
    date: "December 28th, 2025",
    version: "v4.0.1",
    title: "Day 1 Hotfixes: Batch 1",
    description:
      "Fixing some issues from the v4 release. Mostly bug fixes and some small QoL improvements.",
    changes: [
      "Fixed tagging not returning full results",
      "Fixed some edge cases not being handled correctly",
      "Fixed various buggy state handling",
      "Fixed some database queries",
      "Fixed dry metadata",
      "Sidebar on larger devices is now sticky and follows while scrolling",
      "Reintroduced go to top button",
      "You can now see selected assets when multi-selecting",
      "Reintroduced game icons next to game names when filtering",
      "Further test coverage (internal, prevents broken releases)",
      "Removed bad hotfix code from earlier",
    ],
    isLatest: false,
  },
  {
    date: "December 27th, 2025",
    version: "v4.0.0",
    title: "Skowt v4",
    description:
      "skowt's biggest update to date. The tech debt on the Frontend was so bad and needed a full rewrite to fix. This is mostly for Quality of Life and ensuring skowt.cc long term.",
    changes: [
      "Frontend Migration from NextJS + Redux (slow) to Tanstack Router + Zustand (banger stack icl)",
      "Backend Migration to Elysia + Bun",
      "Relocated Infrastructure from Cloudflare Workers to Railway",
      "Being in our Discord server is now required to download assets (due to level of abuse, the fact skowt is a free service, etc)",
      "Better multi-select",
      "New settings page",
      "Mobile navigation bar",
      "Reintroduced arbitrary download limits for stability (350 max at once)",
      "An actually useful info page",
      "Votes page to decide what to prioritize",
      "Better filter panel with smarter and cleaner game and category organization",
    ],
  },
  {
    date: "November 3rd, 2025",
    version: "v3.0.15b",
    title: "Temporary Fixes",
    description:
      "Frontend's fucked and full with tech debt. Most of my time is on Originoid so skowt's getting smaller fixes for a while.",
    changes: [
      "Frontend codebase refactoring",
      "Performance optimisations",
      "Bug fixes and stability improvements",
    ],
  },
  {
    date: "August 30th, 2025",
    version: "v3.0.1b",
    title: "Search & Discovery",
    description:
      "You can now search properly, see similar assets &the site remembers where you were.",
    changes: [
      "Character sheets and splash art for Honkai: Nexus Anima",
      "Search for games, categories, and tags",
      "New assets show up faster",
      "Similar assets on detail pages",
      "Better asset tagging",
      "Layout tweaks",
      "Fixed link previews",
      "Filters and scroll position persist",
    ],
  },
  {
    date: "August 17th, 2025",
    version: "v3.0.0b",
    title: "skowt.cc",
    description:
      "wanderer.moe is now skowt.cc. Adde user accounts, more asset types, and a contributor upload system.",
    changes: [
      "User accounts",
      "More asset types",
      "Better search",
      "Live uploads",
      "Contributor uploads",
    ],
  },
  {
    date: "May 29th, 2025",
    version: "v2.0.0b",
    title: "Post-DDoS",
    description:
      "Individuals with nothing better to do decided to DDoS the site. Rebuilt from SvelteKit to NextJS since I don't write Svelte anymore.",
    changes: ["New infrastructure", "Better performance", "DDoS protection"],
  },
  {
    date: "May 14th, 2025",
    version: "v2.3.0a",
    title: "Saving & History",
    description: "Save assets, track downloads, see what's fanmade.",
    changes: ["Fanmade labels", "Save to favourites", "Download history"],
  },
  {
    date: "February 19th, 2025",
    version: "v2.2.0a",
    title: "Multi-Select",
    description:
      "Downloading one by one is tedious. Proper multi-select so you can grab everything at once.",
    changes: ["View and select mode", "Multi-select for batch downloads", "'Better' selection UI"],
  },
  {
    date: "February 17th, 2025",
    version: "v2.1.0b",
    title: "Download Fixes",
    description:
      "Downloads were broken, especially on iOS. This was an ongoing issue affecting some users for around 2 years. It was cors (it's always cors). A fix has been implemented and download limits have been removed.",
    changes: ["Fixed batch downloads", "iOS Chrome support", "No more download limits"],
  },
];

function ChangelogEntry({ entry, index }: { entry: ChangelogEntry; index: number }) {
  return (
    <article
      className="group relative grid grid-cols-[1fr] md:grid-cols-[200px_1fr] gap-4 md:gap-10 pb-8 md:pb-10"
      style={{ animationDelay: `${index * 50}ms` }}
    >
      <div className="md:text-right">
        <div className="flex items-center gap-2.5 md:hidden mb-1.5">
          <Chip
            fill="flat"
            flatPct={18}
            tone="var(--chip-neutral-bg)"
            textTone="var(--chip-neutral-fg)"
            className="font-mono"
          >
            {entry.version}
          </Chip>
          {entry.isLatest && <Chip className="uppercase tracking-wider font-semibold">Latest</Chip>}
        </div>
        <time className="text-sm font-sans text-muted-foreground">{entry.date}</time>
      </div>

      <div className="relative md:pl-10">
        <div
          className={`absolute -left-[20px] top-2 size-2.5 rounded-full -translate-x-1/2 hidden md:block ring-4 ring-background ${
            index === 0 ? "bg-foreground" : index === 1 ? "bg-foreground/60" : "bg-foreground/40"
          }`}
        />

        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-display text-xl md:text-2xl text-foreground tracking-tight">
            {entry.title}
          </h2>
          <div className="hidden md:flex items-center gap-2.5">
            <Chip
              fill="flat"
              flatPct={18}
              tone="var(--chip-neutral-bg)"
              textTone="var(--chip-neutral-fg)"
              className="font-mono"
            >
              {entry.version}
            </Chip>
            {entry.isLatest && (
              <Chip className="uppercase tracking-wider font-semibold">Latest</Chip>
            )}
          </div>
        </div>

        <p className="text-[14px] text-muted-foreground leading-relaxed mb-4 max-w-lg">
          {entry.description}
        </p>

        <ul className="space-y-2">
          {entry.changes.map((change, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[0.8125rem] text-muted-foreground">
              <span className="size-1 rounded-full bg-muted-foreground/50 mt-[7px] shrink-0" />
              {change}
            </li>
          ))}
        </ul>
      </div>
    </article>
  );
}

function ChangelogComponent() {
  return (
    <div className="page-container">
      <GoBack className="mb-8" />
      <PageHeader
        title="Changelog"
        description="Changelog written by the developer of skowt.cc, updated frequently."
        className="mb-10"
      />

      <div className="relative">
        {/* timeline line at 220px: the 200px date column + half the 40px gap */}
        <div className="absolute left-[220px] top-0 bottom-0 w-px bg-border/20 hidden md:block" />

        {changelog.map((entry, index) => (
          <ChangelogEntry key={entry.version} entry={entry} index={index} />
        ))}
      </div>
    </div>
  );
}

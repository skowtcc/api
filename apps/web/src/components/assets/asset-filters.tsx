import { Input } from "@/components/ui/input";
import {
  DropDrawer,
  DropDrawerContent,
  DropDrawerGroup,
  DropDrawerItem,
  DropDrawerTrigger,
} from "@/components/dropdrawer";
import {
  IconMagnifier,
  IconChevronDown,
  IconGrid,
  IconGrid2,
  IconArrowUp,
  IconArrowDown,
  IconTagFilled,
  IconMenuBars,
  IconXmark,
} from "nucleo-micro-bold";
import { useSettings } from "@/hooks/use-settings";
import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import { softChipStyle, ACCENT_CHIP_COLOR } from "@/lib/chip";
import { gameIconUrl } from "@/lib/api-transforms";
import { ScrollFadeRow } from "@/components/ui/scroll-fade-row";
import { cn, mutedControl } from "@/lib/utils";
import type { Category } from "@/types/assets";
import type { FilterGame, Tag } from "@/hooks/use-filters";
import { FilterPopover } from "@/components/assets/filter-popover";
import { GamepadGlyph } from "@/components/site-stats-hero";

export interface AssetFilterState {
  search: string;
  games: string[];
  categories: string[];
  tags: string[];
  sortBy: "name" | "date" | "downloads" | "views";
  sortOrder: "asc" | "desc";
}

interface AssetFilterBarProps {
  games: FilterGame[];
  tags: Tag[];
  filters: AssetFilterState;
  availableCategories: Category[];
  setSearch: (search: string) => void;
  toggleGame: (id: string) => void;
  toggleCategory: (id: string) => void;
  toggleTag: (slug: string) => void;
  setSortBy: (sortBy: AssetFilterState["sortBy"]) => void;
  setSortOrder: (sortOrder: AssetFilterState["sortOrder"]) => void;
  clearFilters: () => void;
  activeFilterCount: number;
}

/* translucent pill tone per filter kind - games keep the brand violet,
   categories + tags each get their own hue so the three read apart at a glance */
const FILTER_TONE = {
  game: ACCENT_CHIP_COLOR,
  category: "oklch(0.83 0.10 200)", // teal
  tag: "oklch(0.84 0.10 80)", // amber
} as const;

// mobile-only: horizontally-scrolled pill
function FilterPill({
  label,
  active,
  icon,
  tone = ACCENT_CHIP_COLOR,
  onClick,
}: {
  label: string;
  active: boolean;
  icon?: React.ReactNode;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      data-haptic={active ? "light" : "action"}
      onClick={onClick}
      style={active ? softChipStyle(tone) : undefined}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 h-8 text-sm font-medium whitespace-nowrap shrink-0 transition-[filter]",
        active ? "hover:brightness-110" : "surface-raised-pressable",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

// desktop: a selected filter shown as a removable accent chip
function ActiveChip({
  label,
  iconUrl,
  tone = ACCENT_CHIP_COLOR,
  onRemove,
}: {
  label: string;
  iconUrl?: string;
  tone?: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      data-haptic="light"
      onClick={onRemove}
      style={softChipStyle(tone)}
      className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-2 h-7 text-xs font-medium shrink-0 transition-[filter] hover:brightness-110"
    >
      {iconUrl && <img src={iconUrl} alt="" className="size-4 rounded-sm object-cover shrink-0" />}
      {label}
      <IconXmark className="size-3 opacity-80" />
    </button>
  );
}

const SORT_BY_LABELS: Record<AssetFilterState["sortBy"], string> = {
  date: "Date",
  name: "Name",
  downloads: "Downloads",
  views: "Views",
};

export function AssetFilterBar({
  games,
  tags,
  filters,
  availableCategories,
  setSearch,
  toggleGame,
  toggleCategory,
  toggleTag,
  setSortBy,
  setSortOrder,
  clearFilters,
  activeFilterCount,
}: AssetFilterBarProps) {
  const { settings, updateSetting } = useSettings();
  const trpc = useTRPC();

  /* NEW badge on recently added games (shares the getRecentDrops cache with
     the homepage band; resolves to an empty set while loading) */
  const { data: dropsData } = useQuery(trpc.asset.getRecentDrops.queryOptions());
  const newGameSlugs = new Set(
    (dropsData?.drops ?? []).filter((d) => d.isNewGame).map((d) => d.game.slug),
  );

  const gameOptions = games.map((g) => ({
    value: g.id,
    label: g.name,
    iconUrl: gameIconUrl(g.slug),
    badge: newGameSlugs.has(g.slug) ? "NEW" : undefined,
  }));
  const categoryOptions = availableCategories.map((c) => ({
    value: c.id,
    label: c.name,
  }));
  const tagOptions = tags.map((t) => ({ value: t.slug, label: t.name }));

  const selectedGames = games.filter((g) => filters.games.includes(g.id));
  const selectedCategories = availableCategories.filter((c) => filters.categories.includes(c.id));
  const selectedTags = tags.filter((t) => filters.tags.includes(t.slug));

  return (
    <div className="@container py-3 space-y-3">
      {/* top row: search · desktop filter popovers · sort + view. below @4xl
          the row wraps - search owns the first line, sort + view the second */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full @4xl:w-auto @4xl:flex-1 @4xl:max-w-xs">
          <IconMagnifier className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="Search assets..."
            value={filters.search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 text-sm"
          />
        </div>

        {/* desktop: searchable filter popovers (replaces the pill walls). gated on
            container width (not viewport) so the sidebar can't crowd them - below
            the threshold the scrollable pill rows below take over */}
        <div className="hidden @4xl:flex items-center gap-1.5">
          <FilterPopover
            label="Games"
            icon={<GamepadGlyph className="size-4" style={{ color: FILTER_TONE.game }} />}
            options={gameOptions}
            selected={filters.games}
            onToggle={toggleGame}
          />
          <FilterPopover
            label="Categories"
            icon={<IconGrid2 className="size-4" style={{ color: FILTER_TONE.category }} />}
            options={categoryOptions}
            selected={filters.categories}
            onToggle={toggleCategory}
          />
          {tags.length > 0 && (
            <FilterPopover
              label="Tags"
              icon={<IconTagFilled className="size-4" style={{ color: FILTER_TONE.tag }} />}
              options={tagOptions}
              selected={filters.tags}
              onToggle={toggleTag}
            />
          )}
        </div>

        <div className="flex w-full items-center gap-1.5 shrink-0 @4xl:w-auto @4xl:ml-auto">
          <DropDrawer>
            <DropDrawerTrigger
              className={cn(mutedControl, "flex items-center gap-1.5 px-3 h-8 text-sm rounded-md")}
            >
              {SORT_BY_LABELS[filters.sortBy]}
              <IconChevronDown className="size-3.5 opacity-60" />
            </DropDrawerTrigger>
            <DropDrawerContent>
              <DropDrawerGroup>
                <DropDrawerItem onClick={() => setSortBy("date")}>Date</DropDrawerItem>
                <DropDrawerItem onClick={() => setSortBy("name")}>Name</DropDrawerItem>
                <DropDrawerItem onClick={() => setSortBy("downloads")}>Downloads</DropDrawerItem>
                <DropDrawerItem onClick={() => setSortBy("views")}>Views</DropDrawerItem>
              </DropDrawerGroup>
            </DropDrawerContent>
          </DropDrawer>
          <DropDrawer>
            <DropDrawerTrigger
              className={cn(mutedControl, "flex items-center gap-1.5 px-3 h-8 text-sm rounded-md")}
            >
              {filters.sortOrder === "desc" ? (
                <IconArrowDown className="size-3.5" />
              ) : (
                <IconArrowUp className="size-3.5" />
              )}
              {filters.sortOrder === "desc" ? "Desc" : "Asc"}
              <IconChevronDown className="size-3.5 opacity-60" />
            </DropDrawerTrigger>
            <DropDrawerContent>
              <DropDrawerGroup>
                <DropDrawerItem onClick={() => setSortOrder("desc")}>Descending</DropDrawerItem>
                <DropDrawerItem onClick={() => setSortOrder("asc")}>Ascending</DropDrawerItem>
              </DropDrawerGroup>
            </DropDrawerContent>
          </DropDrawer>

          <button
            onClick={() =>
              updateSetting("viewMode", settings.viewMode === "grid" ? "list" : "grid")
            }
            className={cn(
              mutedControl,
              "size-8 inline-flex items-center justify-center rounded-md ml-auto @4xl:ml-0",
            )}
            title={settings.viewMode === "grid" ? "Switch to list view" : "Switch to grid view"}
          >
            {settings.viewMode === "grid" ? (
              <IconMenuBars className="size-4" />
            ) : (
              <IconGrid className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* desktop: active filters as removable chips */}
      {activeFilterCount > 0 && (
        <div className="hidden @4xl:flex flex-wrap items-center gap-2">
          {selectedGames.map((g) => (
            <ActiveChip
              key={g.id}
              label={g.name}
              iconUrl={gameIconUrl(g.slug)}
              tone={FILTER_TONE.game}
              onRemove={() => toggleGame(g.id)}
            />
          ))}
          {selectedCategories.map((c) => (
            <ActiveChip
              key={c.id}
              label={c.name}
              tone={FILTER_TONE.category}
              onRemove={() => toggleCategory(c.id)}
            />
          ))}
          {selectedTags.map((t) => (
            <ActiveChip
              key={t.slug}
              label={t.name}
              tone={FILTER_TONE.tag}
              onRemove={() => toggleTag(t.slug)}
            />
          ))}
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-muted-foreground hover:text-foreground px-2 h-7 rounded-md"
          >
            Clear all
          </button>
        </div>
      )}

      {/* mobile: games scroll row */}
      {games.length > 0 && (
        <ScrollFadeRow className="@4xl:hidden" innerClassName="gap-2">
          {games.map((game) => (
            <FilterPill
              key={game.id}
              label={game.name}
              active={filters.games.includes(game.id)}
              tone={FILTER_TONE.game}
              onClick={() => toggleGame(game.id)}
              icon={
                <img
                  src={gameIconUrl(game.slug)}
                  alt=""
                  className="size-4 rounded-sm object-cover"
                />
              }
            />
          ))}
        </ScrollFadeRow>
      )}

      {/* mobile: tags + categories scroll row */}
      {(tags.length > 0 || availableCategories.length > 0) && (
        <ScrollFadeRow className="@4xl:hidden" innerClassName="gap-2">
          {tags.map((tag) => (
            <FilterPill
              key={tag.slug}
              label={tag.name}
              active={filters.tags.includes(tag.slug)}
              tone={FILTER_TONE.tag}
              onClick={() => toggleTag(tag.slug)}
            />
          ))}
          {tags.length > 0 && availableCategories.length > 0 && (
            <div className="shrink-0 w-px h-6 bg-border self-center" />
          )}
          {availableCategories.map((cat) => (
            <FilterPill
              key={cat.id}
              label={cat.name}
              active={filters.categories.includes(cat.id)}
              tone={FILTER_TONE.category}
              onClick={() => toggleCategory(cat.id)}
            />
          ))}
        </ScrollFadeRow>
      )}
    </div>
  );
}

import { normalizeAssetSearch, joinCsv, type AssetSearch } from "./asset-search";
import type { ServerFilterState } from "@/hooks/use-server-assets";

// pairs of tags that can't be active together - selecting one clears the other
const MUTUALLY_EXCLUSIVE_TAGS: Record<string, string> = {
  official: "fanmade",
  fanmade: "official",
};

/* add `value` to `list`, or remove it if already present (game/category toggles);
   returns a new array; existing items keep their order */
export function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

/* toggle a tag slug, honouring mutual exclusivity: selecting a tag with an
   exclusive partner (official<->fanmade) removes the partner first, removing an
   already-selected tag just drops it */
export function applyTagToggle(current: string[], tagSlug: string): string[] {
  if (current.includes(tagSlug)) return current.filter((t) => t !== tagSlug);
  const exclusive = MUTUALLY_EXCLUSIVE_TAGS[tagSlug];
  const base = exclusive ? current.filter((t) => t !== exclusive) : current;
  return [...base, tagSlug];
}

/* build the URL search params from committed filters: game/category ids map back
   to slugs (unknown ids dropped), tags are already slugs, then normalize strips
   empty/default values so a clean browse collapses to "/" */
export function buildAssetSearchParams(
  filters: ServerFilterState,
  gameIdToSlug: Map<string, string>,
  catIdToSlug: Map<string, string>,
): AssetSearch {
  return normalizeAssetSearch({
    search: filters.search || undefined,
    games: joinCsv(
      filters.games.map((id) => gameIdToSlug.get(id)).filter((s): s is string => Boolean(s)),
    ),
    categories: joinCsv(
      filters.categories.map((id) => catIdToSlug.get(id)).filter((s): s is string => Boolean(s)),
    ),
    tags: joinCsv(filters.tags),
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
  });
}

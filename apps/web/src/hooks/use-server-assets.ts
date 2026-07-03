import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useInfiniteQuery, keepPreviousData } from "@tanstack/react-query";
import { useSearch, useNavigate } from "@tanstack/react-router";
import { useTRPC, useTRPCClient } from "@/utils/trpc";
import { getCategoriesForSelectedGames, type FilterGame } from "@/hooks/use-filters";
import { splitCsv, type AssetSearch } from "@/lib/asset-search";
import { toggleValue, applyTagToggle, buildAssetSearchParams } from "@/lib/filter-state";

export interface ServerFilterState {
  search: string;
  games: string[];
  categories: string[];
  tags: string[];
  sortBy: "date" | "name" | "downloads" | "views";
  sortOrder: "asc" | "desc";
}

/* path-pinned filters for the SEO landing routes (/games/$slug[/. $category])
   a pinned game/category comes from the URL *path* instead of query params, so
   the pin itself never appears in `?games=`/`?categories=` - the moment a
   filter change breaks the pin (second game toggled on, category set changed),
   commit() navigates to the route that owns that state instead */
export interface PinnedBrowse {
  gameId: string;
  gameSlug: string;
  categoryId?: string;
  categorySlug?: string;
}

/* short enough that the request fires between keystrokes (people type at
   ~150-250ms/char), long enough to coalesce a fast burst. the old 300ms sat
   on top of every search as pure added latency - the server answers in ~5ms
   off the FTS index, so the debounce was the wait */
const DEBOUNCE_MS = 120;

const DEFAULT_FILTERS: ServerFilterState = {
  search: "",
  games: [],
  categories: [],
  tags: [],
  // browse opens newest-first; the sort control still offers most-downloaded
  sortBy: "date",
  sortOrder: "desc",
};

interface AssetQueryInput {
  name: string | undefined;
  games: string[] | undefined;
  categories: string[] | undefined;
  tags: string[] | undefined;
  sortBy: ServerFilterState["sortBy"];
  sortOrder: ServerFilterState["sortOrder"];
  limit: number;
}

/* the query-input shape shared by the asset and bookmark infinite queries
   kept pure so the two data paths can't drift: search only applies at >=2
   chars, empty filter arrays collapse to undefined. `search` is the
   *committed* (debounced) value, never the live input */
export function buildAssetQueryInput(
  filters: ServerFilterState,
  debouncedSearch: string,
): AssetQueryInput {
  return {
    name: debouncedSearch.length >= 2 ? debouncedSearch : undefined,
    games: filters.games.length > 0 ? filters.games : undefined,
    categories: filters.categories.length > 0 ? filters.categories : undefined,
    tags: filters.tags.length > 0 ? filters.tags : undefined,
    sortBy: filters.sortBy,
    sortOrder: filters.sortOrder,
    limit: 100,
  };
}

/* shared filter state + callbacks used by both asset and bookmark hooks
   committed filters live in the URL as comma-separated slugs, so they survive
   navigating to /asset/[id] and back (which is what lets scroll restoration
   work) and are shareable. internally the query still uses ids for games/
   categories, so we map slug<->id at the URL boundary; tags are slugs already.
   the search box stays local + responsive; its debounced value commits to the URL.
   `enabled` mirrors the consuming query: AssetBrowser mounts both the assets and
   bookmarks hooks and toggles them via `enabled`, but they share the same route
   URL. only the enabled instance may write to the URL - otherwise the idle hook's
   debounce fights the active one over the search param (infinite commit loop) */
/* per-surface default sort. browse/bookmarks rank by popularity; uploads is a
   personal chronological list, so it opens newest-first (a just-submitted
   pending upload belongs at the top, not buried under downloaded ones) */
type SortDefaults = Pick<ServerFilterState, "sortBy" | "sortOrder">;
const UPLOAD_SORT_DEFAULTS: SortDefaults = { sortBy: "date", sortOrder: "desc" };

function useFilterState(
  games: FilterGame[],
  enabled: boolean,
  pinned?: PinnedBrowse,
  defaults: SortDefaults = DEFAULT_FILTERS,
) {
  const urlSearch = useSearch({ strict: false }) as AssetSearch;
  const navigate = useNavigate();

  const gameSlugToId = useMemo(() => new Map(games.map((g) => [g.slug, g.id])), [games]);
  const gameIdToSlug = useMemo(() => new Map(games.map((g) => [g.id, g.slug])), [games]);

  /* a pinned game is the whole game filter - the landing routes never carry
     ?games=. resolving from `pinned` (loader data) instead of the games list
     also means the SSR pass filters correctly before getFilters resolves */
  const gameIds = useMemo(
    () =>
      pinned
        ? [pinned.gameId]
        : splitCsv(urlSearch.games)
            .map((slug) => gameSlugToId.get(slug))
            .filter((id): id is string => Boolean(id)),
    [pinned, urlSearch.games, gameSlugToId],
  );

  const availableCategories = useMemo(
    () => getCategoriesForSelectedGames(games, gameIds),
    [games, gameIds],
  );
  const catSlugToId = useMemo(
    () => new Map(availableCategories.map((c) => [c.slug, c.id])),
    [availableCategories],
  );
  const catIdToSlug = useMemo(
    () => new Map(availableCategories.map((c) => [c.id, c.slug])),
    [availableCategories],
  );

  const categoryIds = useMemo(
    () =>
      pinned?.categoryId
        ? [pinned.categoryId]
        : splitCsv(urlSearch.categories)
            .map((slug) => catSlugToId.get(slug))
            .filter((id): id is string => Boolean(id)),
    [pinned, urlSearch.categories, catSlugToId],
  );
  const tagsSel = useMemo(() => splitCsv(urlSearch.tags), [urlSearch.tags]);

  const committed = useMemo<ServerFilterState>(
    () => ({
      search: urlSearch.search ?? DEFAULT_FILTERS.search,
      games: gameIds,
      categories: categoryIds,
      tags: tagsSel,
      sortBy: urlSearch.sortBy ?? defaults.sortBy,
      sortOrder: urlSearch.sortOrder ?? defaults.sortOrder,
    }),
    [
      urlSearch.search,
      urlSearch.sortBy,
      urlSearch.sortOrder,
      gameIds,
      categoryIds,
      tagsSel,
      defaults.sortBy,
      defaults.sortOrder,
    ],
  );

  /* commit id-based filter changes to the URL as slugs. navigate() is strictly
     typed to the router, so use one loosened call; replace so filter tweaks don't
     spam history (back from /asset/[id] lands on the filtered browse view).
     on pinned routes, a change that breaks the pin *navigates* (push, so back
     returns to the landing page) to the route that owns the new state: any
     other game set -> "/", any other category set -> the parent game route */
  const commit = useCallback(
    (next: Partial<ServerFilterState>) => {
      if (!enabled) return; // idle instance must not touch the shared route URL
      const merged: ServerFilterState = { ...committed, ...next };
      const search = buildAssetSearchParams(merged, gameIdToSlug, catIdToSlug);
      const nav = navigate as unknown as (o: {
        to?: string;
        params?: Record<string, string>;
        search: unknown;
        replace: boolean;
        resetScroll?: boolean;
      }) => void;

      if (pinned) {
        const gamesStillPinned = merged.games.length === 1 && merged.games[0] === pinned.gameId;
        if (!gamesStillPinned) {
          nav({ to: "/", search, replace: false, resetScroll: false });
          return;
        }
        const { games: _games, ...searchSansGame } = search; // the path carries the game
        if (pinned.categoryId) {
          const catStillPinned =
            merged.categories.length === 1 && merged.categories[0] === pinned.categoryId;
          if (!catStillPinned) {
            nav({
              to: "/games/$slug",
              params: { slug: pinned.gameSlug },
              search: searchSansGame,
              replace: false,
              resetScroll: false,
            });
            return;
          }
          const { categories: _cats, ...searchSansCat } = searchSansGame; // path carries the category
          nav({ search: searchSansCat, replace: true });
          return;
        }
        nav({ search: searchSansGame, replace: true });
        return;
      }

      nav({ search, replace: true });
    },
    [enabled, committed, gameIdToSlug, catIdToSlug, navigate, pinned],
  );

  // responsive search input; the debounced value is committed to the URL
  const [searchInput, setSearchInput] = useState(committed.search);

  useEffect(() => {
    if (!enabled) return;
    if (searchInput === committed.search) return;
    const timer = setTimeout(() => commit({ search: searchInput }), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [enabled, searchInput, committed.search, commit]);

  const setSearch = useCallback((search: string) => setSearchInput(search), []);

  const toggleGame = useCallback(
    (gameId: string) => {
      const newGames = toggleValue(committed.games, gameId);
      const validCategoryIds = new Set(
        getCategoriesForSelectedGames(games, newGames).map((c) => c.id),
      );
      commit({
        games: newGames,
        categories: committed.categories.filter((id) => validCategoryIds.has(id)),
      });
    },
    [committed, games, commit],
  );

  const toggleCategory = useCallback(
    (categoryId: string) => {
      commit({ categories: toggleValue(committed.categories, categoryId) });
    },
    [committed, commit],
  );

  const toggleTag = useCallback(
    (tagSlug: string) => {
      commit({ tags: applyTagToggle(committed.tags, tagSlug) });
    },
    [committed, commit],
  );

  /* switching the sort field resets direction to that field's natural read
     (A->Z for name, biggest/newest first for the rest) - a lingering desc from
     the downloads default otherwise lands users on Z->A name sort. the
     direction control still overrides afterwards */
  const setSortBy = useCallback(
    (sortBy: ServerFilterState["sortBy"]) =>
      commit({ sortBy, sortOrder: sortBy === "name" ? "asc" : "desc" }),
    [commit],
  );
  const setSortOrder = useCallback(
    (sortOrder: ServerFilterState["sortOrder"]) => commit({ sortOrder }),
    [commit],
  );

  const clearFilters = useCallback(() => {
    if (!enabled) return;
    setSearchInput("");
    /* clearing everything on a pinned route includes the pin itself, and an
       unfiltered browse lives on "/" - push so back returns to the landing page */
    (navigate as unknown as (o: { to?: string; search: unknown; replace: boolean }) => void)(
      pinned ? { to: "/", search: {}, replace: false } : { search: {}, replace: true },
    );
  }, [enabled, navigate, pinned]);

  /* exposed filters: committed values, but `search` reflects the live input so
     typing feels instant. the query uses `debouncedSearch` (the committed value) */
  const filters = useMemo<ServerFilterState>(
    () => ({ ...committed, search: searchInput }),
    [committed, searchInput],
  );

  const debouncedSearch = committed.search;

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (searchInput) count++;
    count += committed.games.length + committed.categories.length + committed.tags.length;
    return count;
  }, [searchInput, committed]);

  return {
    filters,
    debouncedSearch,
    availableCategories,
    setSearch,
    toggleGame,
    toggleCategory,
    toggleTag,
    setSortBy,
    setSortOrder,
    clearFilters,
    activeFilterCount,
  };
}

export function useServerAssets(games: FilterGame[], enabled = true, pinned?: PinnedBrowse) {
  const trpc = useTRPC();
  const filterState = useFilterState(games, enabled, pinned);

  const queryInput = useMemo(
    () => buildAssetQueryInput(filterState.filters, filterState.debouncedSearch),
    [
      filterState.debouncedSearch,
      filterState.filters.games,
      filterState.filters.categories,
      filterState.filters.tags,
      filterState.filters.sortBy,
      filterState.filters.sortOrder,
    ],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    ...trpc.asset.query.infiniteQueryOptions(queryInput, {
      getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    }),
    /* when the search/filters change the query key, keep showing the previous
       results until the new ones land - no skeleton flash between keystrokes */
    placeholderData: keepPreviousData,
    enabled,
  });

  const items = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items);
  }, [data]);

  return { items, ...filterState, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading };
}

export function useServerBookmarks(games: FilterGame[], enabled = true, pinned?: PinnedBrowse) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const filterState = useFilterState(games, enabled, pinned);
  const currentOffsetRef = useRef(0);

  const baseQueryInput = useMemo(
    () => buildAssetQueryInput(filterState.filters, filterState.debouncedSearch),
    [
      filterState.debouncedSearch,
      filterState.filters.games,
      filterState.filters.categories,
      filterState.filters.tags,
      filterState.filters.sortBy,
      filterState.filters.sortOrder,
    ],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: trpc.bookmark.list.queryKey(baseQueryInput),
    queryFn: async ({ pageParam = 0 }) => {
      const result = await trpcClient.bookmark.list.query({ ...baseQueryInput, offset: pageParam });
      currentOffsetRef.current = pageParam + result.items.length;
      return result;
    },
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    enabled,
  });

  const items = useMemo(() => {
    if (!data?.pages) return [];
    return data.pages.flatMap((page) => page.items.map((item) => item.asset));
  }, [data]);

  return { items, ...filterState, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading };
}

/* the caller's own uploads (all statuses), same filter/sort/infinite-scroll
   machinery as the browse + bookmark hooks. items carry a `status` for the
   review-state overlay; keepPreviousData keeps the grid stable across filter
   and search changes, same as the main browse */
export function useServerUploads(games: FilterGame[], enabled = true) {
  const trpc = useTRPC();
  const trpcClient = useTRPCClient();
  const filterState = useFilterState(games, enabled, undefined, UPLOAD_SORT_DEFAULTS);

  const baseQueryInput = useMemo(
    () => buildAssetQueryInput(filterState.filters, filterState.debouncedSearch),
    [
      filterState.debouncedSearch,
      filterState.filters.games,
      filterState.filters.categories,
      filterState.filters.tags,
      filterState.filters.sortBy,
      filterState.filters.sortOrder,
    ],
  );

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: trpc.uploads.list.queryKey(baseQueryInput),
    queryFn: ({ pageParam = 0 }) =>
      trpcClient.uploads.list.query({ ...baseQueryInput, offset: pageParam }),
    getNextPageParam: (lastPage, allPages) => {
      if (!lastPage.hasMore) return undefined;
      return allPages.reduce((sum, page) => sum + page.items.length, 0);
    },
    initialPageParam: 0,
    placeholderData: keepPreviousData,
    enabled,
  });

  const items = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);

  return { items, ...filterState, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading };
}

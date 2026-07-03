import { useQuery } from "@tanstack/react-query";
import { useTRPC } from "@/utils/trpc";
import type { Category } from "@/types/assets";

export interface Tag {
  id: string;
  slug: string;
  name: string;
}

export interface FilterGame {
  id: string;
  slug: string;
  name: string;
  categories: Category[];
}

export function useFilters() {
  const trpc = useTRPC();

  const { data, isLoading, error } = useQuery(trpc.asset.getFilters.queryOptions());

  return {
    games: data?.games ?? [],
    categories: data?.categories ?? [],
    tags: data?.tags ?? [],
    isLoading,
    error,
  };
}

export function getCategoriesForSelectedGames(
  games: FilterGame[],
  selectedGameIds: string[],
): Category[] {
  if (selectedGameIds.length === 0) {
    const categoryMap = new Map<string, Category>();
    games.forEach((game) => {
      game.categories.forEach((category) => {
        if (!categoryMap.has(category.id)) {
          categoryMap.set(category.id, category);
        }
      });
    });
    return Array.from(categoryMap.values());
  }

  const categoryMap = new Map<string, Category>();
  games
    .filter((game) => selectedGameIds.includes(game.id))
    .forEach((game) => {
      game.categories.forEach((category) => {
        if (!categoryMap.has(category.id)) {
          categoryMap.set(category.id, category);
        }
      });
    });

  return Array.from(categoryMap.values());
}

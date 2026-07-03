import { z } from "zod";

/* URL search-param schema for the asset browser (used by "/" and "/saved").
   games/categories/tags are stored as comma-separated *slugs* (e.g.
   ?games=genshin-impact,zenless-zone-zero) - readable, "properly" multi-value,
   and - unlike TanStack's default JSON-array encoding - they round-trip as plain
   strings so the filters survive a browser back-nav. everything is optional and
   omitted when default, so a clean browse is just "/" */
const assetSearchSchema = z.object({
  search: z.string().optional(),
  games: z.string().optional(),
  categories: z.string().optional(),
  tags: z.string().optional(),
  sortBy: z.enum(["date", "name", "downloads", "views"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
});

export type AssetSearch = z.infer<typeof assetSearchSchema>;

// tolerant parse for route validateSearch - never throw on a hand-edited URL
export function validateAssetSearch(input: Record<string, unknown>): AssetSearch {
  const result = assetSearchSchema.safeParse(input);
  return result.success ? result.data : {};
}

// drop empty / default values so the URL stays minimal
export function normalizeAssetSearch(s: AssetSearch): AssetSearch {
  const out: AssetSearch = {};
  if (s.search) out.search = s.search;
  if (s.games) out.games = s.games;
  if (s.categories) out.categories = s.categories;
  if (s.tags) out.tags = s.tags;
  if (s.sortBy && s.sortBy !== "date") out.sortBy = s.sortBy;
  if (s.sortOrder && s.sortOrder !== "desc") out.sortOrder = s.sortOrder;
  return out;
}

export const splitCsv = (v?: string): string[] => (v ? v.split(",").filter(Boolean) : []);
export const joinCsv = (arr: string[]): string | undefined =>
  arr.length ? arr.join(",") : undefined;

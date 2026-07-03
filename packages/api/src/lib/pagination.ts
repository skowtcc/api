export function paginateResults<T>(results: T[], limit: number): { items: T[]; hasMore: boolean } {
  const hasMore = results.length > limit;
  return { items: hasMore ? results.slice(0, limit) : results, hasMore };
}

/*
 * keyset pagination: callers over-fetch `limit + 1` rows; this trims to `limit`,
 * reports whether another page exists, and derives the next cursor from the last
 * kept row. `toCursor` encodes that row into whatever the caller's cursor format
 * requires (an opaque base64 keyset cursor, a raw ISO timestamp, etc.) - it is
 * invoked only when a next page exists, and may return null for "no further cursor"
 */
export function keysetPage<T>(
  rows: T[],
  limit: number,
  toCursor: (last: T) => string | null,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return { items, nextCursor: hasMore && last ? toCursor(last) : null };
}

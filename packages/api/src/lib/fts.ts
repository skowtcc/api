import { asset, like, sql } from "@skowt-monorepo/db";
import type { SQL } from "drizzle-orm";

/*
 * trigram FTS5 cannot tokenize queries shorter than 3 characters, so anything
 * below this falls back to the original LIKE scan (input is already length>=2 via
 * the router's zod schema, so the fallback only ever handles 2-char terms)
 */
const FTS_MIN_LENGTH = 3;

/*
 * wrap a user term as a single FTS5 string literal: FTS5 MATCH has its own query
 * grammar (AND OR NOT NEAR, prefix `*`, column filter `col:`, `-` negation,
 * phrase `"..."`, grouping `()`), and passing raw input would let a user inject
 * operators or trigger a syntax error -> 500. surrounding the whole term in double
 * quotes and doubling any embedded quote forces FTS5 to treat every character as
 * literal string content, which for the trigram tokenizer is exactly a substring
 * match -- behaviour-identical to the old `LIKE '%term%'`. verified against LibSQL
 * with adversarial inputs (`" OR x`, `a*b`, `a OR b`) all neutralized to literals
 */
function escapeFtsMatch(term: string): string {
  return '"' + term.replace(/"/g, '""') + '"';
}

/*
 * build the asset-name filter condition. for terms >= 3 chars, resolve matches
 * through the FTS5 trigram index via a non-correlated `IN (SELECT ...)` subquery:
 * MATCH runs once, there is no materialized id list (so no bound-parameter limit
 * and no multi-KB SQL text in traces), and the query planner uses the FTS index.
 * the asset table's own status/sort/cursor conditions still apply on the outside.
 * shorter terms keep the case-insensitive LIKE substring scan
 */
export function assetNameCondition(rawName: string): SQL {
  const term = rawName.trim();
  if (term.length >= FTS_MIN_LENGTH) {
    return sql`${asset.id} IN (SELECT asset_id FROM asset_fts WHERE name MATCH ${escapeFtsMatch(term)})`;
  }
  return like(asset.name, `%${term}%`);
}

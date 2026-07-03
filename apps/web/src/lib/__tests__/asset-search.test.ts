import { describe, test, expect } from "bun:test";
import { splitCsv, joinCsv, normalizeAssetSearch, validateAssetSearch } from "../asset-search";

/* first web-side unit tests - seed the floor on the pure URL-search helpers that
   back browse/saved filter persistence (no React/router needed to exercise them) */

describe("splitCsv / joinCsv", () => {
  test("round-trips a multi-slug value", () => {
    const slugs = ["genshin-impact", "zenless-zone-zero"];
    expect(splitCsv(joinCsv(slugs))).toEqual(slugs);
  });

  test("splitCsv handles empty / undefined and drops blanks", () => {
    expect(splitCsv(undefined)).toEqual([]);
    expect(splitCsv("")).toEqual([]);
    expect(splitCsv("a,,b")).toEqual(["a", "b"]);
  });

  test("joinCsv collapses empty to undefined", () => {
    expect(joinCsv([])).toBeUndefined();
    expect(joinCsv(["a"])).toBe("a");
  });
});

describe("normalizeAssetSearch", () => {
  test("drops empty and default values so a clean browse is just '/'", () => {
    expect(normalizeAssetSearch({})).toEqual({});
    expect(
      normalizeAssetSearch({ search: "", games: "", sortBy: "date", sortOrder: "desc" }),
    ).toEqual({});
  });

  test("keeps non-default values", () => {
    expect(
      normalizeAssetSearch({
        search: "aya",
        games: "genshin-impact",
        sortBy: "name",
        sortOrder: "asc",
      }),
    ).toEqual({ search: "aya", games: "genshin-impact", sortBy: "name", sortOrder: "asc" });
  });

  test("keeps sortBy only when non-default", () => {
    expect(normalizeAssetSearch({ sortBy: "downloads" })).toEqual({ sortBy: "downloads" });
    expect(normalizeAssetSearch({ sortBy: "date" })).toEqual({});
  });
});

describe("validateAssetSearch", () => {
  test("passes through valid params", () => {
    expect(validateAssetSearch({ games: "a,b", sortBy: "views" })).toEqual({
      games: "a,b",
      sortBy: "views",
    });
  });

  test("is tolerant: returns {} on a hand-edited / invalid URL", () => {
    expect(validateAssetSearch({ sortBy: "not-a-sort" })).toEqual({});
  });

  test("strips unknown keys", () => {
    expect(validateAssetSearch({ games: "a", bogus: "x" })).toEqual({ games: "a" });
  });
});

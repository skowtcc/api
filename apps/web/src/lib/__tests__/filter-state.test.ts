import { describe, test, expect } from "bun:test";
import { toggleValue, applyTagToggle, buildAssetSearchParams } from "../filter-state";
import type { ServerFilterState } from "@/hooks/use-server-assets";

describe("toggleValue", () => {
  test("adds when absent, removes when present, preserves order", () => {
    expect(toggleValue([], "a")).toEqual(["a"]);
    expect(toggleValue(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleValue(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("applyTagToggle", () => {
  test("adds a tag", () => {
    expect(applyTagToggle([], "hd")).toEqual(["hd"]);
  });
  test("removes an already-selected tag", () => {
    expect(applyTagToggle(["hd", "official"], "hd")).toEqual(["official"]);
  });
  test("selecting 'official' clears the mutually-exclusive 'fanmade'", () => {
    expect(applyTagToggle(["fanmade", "hd"], "official")).toEqual(["hd", "official"]);
  });
  test("selecting 'fanmade' clears 'official'", () => {
    expect(applyTagToggle(["official"], "fanmade")).toEqual(["fanmade"]);
  });
  test("non-exclusive tags coexist", () => {
    expect(applyTagToggle(["hd"], "official")).toEqual(["hd", "official"]);
  });
});

describe("buildAssetSearchParams", () => {
  const gameIdToSlug = new Map([
    ["g1", "genshin-impact"],
    ["g2", "zenless-zone-zero"],
  ]);
  const catIdToSlug = new Map([["c1", "splash-art"]]);
  const base: ServerFilterState = {
    search: "",
    games: [],
    categories: [],
    tags: [],
    sortBy: "date",
    sortOrder: "desc",
  };

  test("maps game ids to slugs and drops unknown ids", () => {
    expect(
      buildAssetSearchParams(
        { ...base, games: ["g1", "g2", "unknown"] },
        gameIdToSlug,
        catIdToSlug,
      ),
    ).toEqual({ games: "genshin-impact,zenless-zone-zero" });
  });

  test("a clean filter set collapses to {}", () => {
    expect(buildAssetSearchParams(base, gameIdToSlug, catIdToSlug)).toEqual({});
  });

  test("tags pass through as slugs and non-default sort is kept", () => {
    expect(
      buildAssetSearchParams(
        { ...base, categories: ["c1"], tags: ["official"], sortBy: "downloads" },
        gameIdToSlug,
        catIdToSlug,
      ),
    ).toEqual({ categories: "splash-art", tags: "official", sortBy: "downloads" });
  });
});

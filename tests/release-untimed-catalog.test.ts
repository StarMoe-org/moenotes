import { describe, expect, test } from "bun:test";
import type { ServerFaceted } from "../src/lib/servers/facets";
import { filterReleasedSearchEntries } from "../src/lib/search/content-index";
import type { ContentSearchEntry } from "../src/lib/search/content-entry";
import { isReleaseFacetPublicAcrossServers } from "../src/lib/story/release";

const now = Date.UTC(2026, 10, 12, 12);

function facet(startAt: string, servers: ServerFaceted<{ startAt: string }>["servers"], serverVariants?: ServerFaceted<{ startAt: string }>["serverVariants"]) {
  return { startAt, servers, ...(serverVariants ? { serverVariants } : {}) };
}

function searchEntry(key: string, startAt: string | undefined, kind: ContentSearchEntry["kind"] = "comic"): ContentSearchEntry {
  return { key, kind, href: "/comics", title: {}, searchText: {}, startAt };
}

describe("release gate for catalogs with optional dates", () => {
  test("an entry no region dates is permanent and stays public", () => {
    expect(isReleaseFacetPublicAcrossServers(facet("", ["tw", "jp", "kr", "en"]), now)).toBe(true);
    // MasterData spells an absent timestamp "null" in a few tables (the beginner mission group).
    expect(isReleaseFacetPublicAcrossServers(facet("null", ["tw", "jp", "kr", "en"]), now)).toBe(true);
    expect(isReleaseFacetPublicAcrossServers(facet("", ["tw"], { tw: {} }), now)).toBe(true);
  });

  test("a dated entry still waits for every region that lists it", () => {
    const released = facet("2026/10/01 12:00:00", ["tw", "jp"], { jp: { startAt: "2026/10/20 12:00:00" } });
    const future = facet("2026/10/01 12:00:00", ["tw", "jp"], { jp: { startAt: "2026/12/01 12:00:00" } });
    expect(isReleaseFacetPublicAcrossServers(released, now)).toBe(true);
    expect(isReleaseFacetPublicAcrossServers(future, now)).toBe(false);
    // One undated region does not turn a dated entry into permanent content.
    expect(isReleaseFacetPublicAcrossServers(facet("2026/10/01 12:00:00", ["tw", "jp"], { jp: { startAt: "" } }), now)).toBe(false);
  });

  test("a malformed non-empty date is not mistaken for a permanent entry", () => {
    expect(isReleaseFacetPublicAcrossServers(facet("not a date", ["tw", "jp"]), now)).toBe(false);
    expect(isReleaseFacetPublicAcrossServers(facet("", []), now)).toBe(false);
    expect(isReleaseFacetPublicAcrossServers(facet("", ["tw"]), Number.NaN)).toBe(false);
  });
});

describe("search index undated entries", () => {
  test("empty and literal-null dates stay searchable; malformed dates do not", () => {
    const entries = [
      searchEntry("permanent", ""),
      searchEntry("literal-null", "null"),
      searchEntry("always-open", undefined),
      searchEntry("broken", "not a date"),
      searchEntry("future", "2026/12/01 12:00:00"),
    ];
    expect(filterReleasedSearchEntries(entries, new Map(), now).map((entry) => entry.key))
      .toEqual(["permanent", "literal-null", "always-open"]);
  });

  test("release-gated kinds still follow the per-entry release record", () => {
    // Search keys already carry their kind prefix (`gacha:10`), as the release map does.
    const entries = [searchEntry("gacha:permanent-gacha", "", "gacha"), searchEntry("gacha:future-gacha", "2026/12/01 12:00:00", "gacha")];
    const released = new Map([["gacha:permanent-gacha", true], ["gacha:future-gacha", false]]);
    expect(filterReleasedSearchEntries(entries, released, now).map((entry) => entry.key)).toEqual(["gacha:permanent-gacha"]);
  });
});

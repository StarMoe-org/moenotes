import { describe, expect, test } from "bun:test";
import type { ContentSearchEntry } from "../src/lib/search/content-entry";
import { filterReleasedSearchEntries } from "../src/lib/search/content-index";

function searchEntry(key: string, kind: ContentSearchEntry["kind"], startAt?: string): ContentSearchEntry {
  return { key, kind, href: "/story/1", title: { english: "Search title" }, searchText: {}, ...(startAt === undefined ? {} : { startAt }) };
}

describe("public search release filtering", () => {
  const now = Date.UTC(2026, 9, 27, 12);

  test("story and schedule-bearing entries require an explicit all-region MasterData approval", () => {
    const entries = [
      searchEntry("story:1", "story", "2026/10/01 12:00:00"),
      searchEntry("story:2", "story", "2026/10/01 12:00:00"),
      searchEntry("card:3", "card", "2026/10/01 12:00:00"),
    ];
    const released = new Map([["story:1", true], ["story:2", false], ["card:3", true]]);
    expect(filterReleasedSearchEntries(entries, released, now).map((entry) => entry.key)).toEqual(["story:1", "card:3"]);
    expect(filterReleasedSearchEntries([entries[0]!], new Map(), now)).toEqual([]);
  });

  test("malformed, future and missing-date schedule entries are not searchable", () => {
    const entries = [
      searchEntry("comic:future", "comic", "2026/11/01 12:00:00"),
      searchEntry("comic:malformed", "comic", "not a MasterData date"),
      searchEntry("comic:released", "comic", "2026/10/01 12:00:00"),
      searchEntry("character:1", "character"),
    ];
    expect(filterReleasedSearchEntries(entries, new Map(), now).map((entry) => entry.key)).toEqual(["comic:released", "character:1"]);
  });
});

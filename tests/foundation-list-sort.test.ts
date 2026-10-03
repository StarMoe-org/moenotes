import { describe, expect, test } from "bun:test";
import { isListSort, numericSortValue, parseNumericSort, sortEntries } from "../src/lib/filter/list-sort";

const at = (iso: string) => Date.parse(iso);

describe("endingSoon", () => {
  const now = at("2026-05-10T12:00:00+08:00");
  const items = [
    { id: "ended-old", startAt: "2026/01/01 00:00:00", endAt: "2026/01/10 00:00:00" },
    { id: "upcoming-late", startAt: "2026/07/01 00:00:00", endAt: "2026/07/10 00:00:00" },
    { id: "ongoing-late", startAt: "2026/05/01 00:00:00", endAt: "2026/05/30 00:00:00" },
    { id: "ended-recent", startAt: "2026/04/01 00:00:00", endAt: "2026/05/01 00:00:00" },
    { id: "ongoing-soon", startAt: "2026/05/01 00:00:00", endAt: "2026/05/11 00:00:00" },
    { id: "upcoming-soon", startAt: "2026/06/01 00:00:00", endAt: "2026/06/10 00:00:00" },
    { id: "open", startAt: "2026/01/01 00:00:00" },
    { id: "no-dates" },
  ];
  test("ongoing by end time, open-ended, upcoming by start, then ended (latest first), undated last", () => {
    expect(sortEntries(items, "endingSoon", "en-US", { now }).map((x) => x.id)).toEqual([
      "ongoing-soon", "ongoing-late", "open", "upcoming-soon", "upcoming-late", "ended-recent", "ended-old", "no-dates",
    ]);
  });
  test("reads MasterData time in server time (UTC+8 by default, tagged offsets honoured)", () => {
    // 2026/05/10 12:30 in UTC+8 is still ahead of `now`; the same wall time in UTC+9 is already past.
    const edge = [
      { id: "jp", startAt: "2026/05/01 00:00:00+09:00", endAt: "2026/05/10 12:30:00+09:00" },
      { id: "cn", startAt: "2026/05/01 00:00:00", endAt: "2026/05/10 12:30:00" },
    ];
    expect(sortEntries(edge, "endingSoon", "en-US", { now: at("2026-05-10T11:20:00+08:00") }).map((x) => x.id)).toEqual(["jp", "cn"]);
    expect(sortEntries(edge, "endingSoon", "en-US", { now: at("2026-05-10T11:40:00+08:00") }).map((x) => x.id)).toEqual(["cn", "jp"]);
  });
});

describe("custom numeric fields", () => {
  const songs = [
    { id: 1, bpm: 180, stats: { power: 3000 } },
    { id: 2, bpm: 120, stats: { power: 9000 } },
    { id: 3, stats: { power: 5000 } },
    { id: 4, bpm: 120, stats: {} },
  ];
  test("value helpers round-trip", () => {
    expect(numericSortValue("bpm", "desc")).toBe("field:bpm:desc");
    expect(parseNumericSort("field:stats.power:asc")).toEqual({ key: "stats.power", direction: "asc" });
    expect(parseNumericSort("dateDesc")).toBeNull();
    expect(isListSort("field:bpm:desc")).toBe(true);
    expect(isListSort("endingSoon")).toBe(true);
    expect(isListSort("bogus")).toBe(false);
  });
  test("sorts by the entry field in both directions; missing values stay last; ties by id", () => {
    expect(sortEntries(songs, "field:bpm:desc", "en-US").map((x) => x.id)).toEqual([1, 2, 4, 3]);
    expect(sortEntries(songs, "field:bpm:asc", "en-US").map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });
  test("follows dotted paths, or a registered reader", () => {
    expect(sortEntries(songs, "field:stats.power:desc", "en-US").map((x) => x.id)).toEqual([2, 3, 1, 4]);
    expect(sortEntries(songs, "field:double:asc", "en-US", { numeric: { double: (song) => (song.bpm ? song.bpm * 2 : null) } }).map((x) => x.id)).toEqual([2, 4, 1, 3]);
  });
});

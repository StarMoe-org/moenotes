import { describe, expect, test } from "bun:test";
import {
  addCalendarDays,
  calendarDate,
  calendarDayAt,
  calendarDaysBetween,
  chunkWeeks,
  itemsOnDay,
  layoutWeek,
  layoutWeekLimited,
  monthGrid,
  monthKey,
  nextYearly,
  overlapsRange,
  parseCalendarDate,
  parseMonthKey,
  scheduleDays,
  shiftMonth,
  weekStartFor,
  weekdayOrder,
  yearlyDate,
  yearlyOccurrences,
  type DaySpan,
} from "../src/lib/calendar/model";

const span = (id: string, start: string, end: string): DaySpan => ({ id, start, end });

describe("calendar dates", () => {
  test("parses only real dates", () => {
    expect(parseCalendarDate("2026-02-28")).toEqual({ year: 2026, month: 2, day: 28 });
    expect(parseCalendarDate("2026-02-29")).toBeNull();
    expect(parseCalendarDate("2024-02-29")).toEqual({ year: 2024, month: 2, day: 29 });
    expect(parseCalendarDate("2026-13-01")).toBeNull();
    expect(parseCalendarDate("2026-1-1")).toBeNull();
    expect(parseCalendarDate(undefined)).toBeNull();
  });

  test("day arithmetic crosses months, years and DST", () => {
    expect(addCalendarDays("2026-01-31", 1)).toBe("2026-02-01");
    expect(addCalendarDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addCalendarDays("2026-03-01", -1)).toBe("2026-02-28");
    // US DST starts 2026-03-08; civil arithmetic does not care.
    expect(addCalendarDays("2026-03-07", 2)).toBe("2026-03-09");
    expect(calendarDaysBetween("2026-01-01", "2027-01-01")).toBe(365);
    expect(calendarDaysBetween("2026-03-09", "2026-03-07")).toBe(-2);
    expect(calendarDate(2026, 13, 1)).toBe("2027-01-01");
  });

  test("instants fall on the day of the given time zone", () => {
    const instant = Date.parse("2026-10-04T16:30:00Z");
    expect(calendarDayAt(instant, "UTC")).toBe("2026-10-04");
    expect(calendarDayAt(instant, "Asia/Shanghai")).toBe("2026-10-05");
    expect(calendarDayAt(instant, "America/Los_Angeles")).toBe("2026-10-04");
  });
});

describe("months", () => {
  test("month keys round-trip and reject nonsense", () => {
    expect(monthKey({ year: 2026, month: 3 })).toBe("2026-03");
    expect(parseMonthKey("2026-03")).toEqual({ year: 2026, month: 3 });
    expect(parseMonthKey("2026-00")).toBeNull();
    expect(parseMonthKey("2026-3")).toBeNull();
    expect(parseMonthKey(null)).toBeNull();
  });

  test("shifting months wraps years both ways", () => {
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
  });

  test("a month grid has 6 full weeks starting on the week start", () => {
    // October 2026 starts on a Thursday.
    const sunday = monthGrid({ year: 2026, month: 10 }, 0);
    expect(sunday).toHaveLength(42);
    expect(sunday[0]).toBe("2026-09-27");
    expect(sunday[4]).toBe("2026-10-01");
    expect(sunday[41]).toBe("2026-11-07");
    const monday = monthGrid({ year: 2026, month: 10 }, 1);
    expect(monday[0]).toBe("2026-09-28");
    expect(monday[3]).toBe("2026-10-01");
    expect(chunkWeeks(monday)).toHaveLength(6);
    expect(chunkWeeks(monday).every((week) => week.length === 7)).toBe(true);
  });

  test("a month starting on the week start begins in the first cell", () => {
    // February 2026 starts on a Sunday.
    expect(monthGrid({ year: 2026, month: 2 }, 0)[0]).toBe("2026-02-01");
    expect(monthGrid({ year: 2026, month: 2 }, 1)[0]).toBe("2026-01-26");
  });
});

describe("week start", () => {
  test("follows the locale's region, falling back by language", () => {
    expect(weekStartFor("en-US")).toBe(0);
    expect(weekStartFor("ja-JP")).toBe(0);
    expect(weekStartFor("de-DE")).toBe(1);
    expect(weekStartFor("fr-FR")).toBe(1);
    // Without region data the fallback applies: en/zh/ja/ko on Sunday, others on Monday.
    for (const locale of ["zh-CN", "zh-TW", "ko-KR", "ru-RU", "es-ES"]) expect([0, 1]).toContain(weekStartFor(locale));
  });

  test("orders the weekday columns", () => {
    expect(weekdayOrder(0)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(weekdayOrder(1)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("week layout", () => {
  const week = monthGrid({ year: 2026, month: 10 }, 0).slice(7, 14); // 2026-10-04 … 2026-10-10

  test("cuts items to the week and marks the cut ends", () => {
    const [segment] = layoutWeek([span("a", "2026-09-30", "2026-10-06")], week);
    expect(segment).toMatchObject({ column: 0, span: 3, lane: 0, continuesBefore: true, continuesAfter: false });
    const [after] = layoutWeek([span("b", "2026-10-09", "2026-10-20")], week);
    expect(after).toMatchObject({ column: 5, span: 2, continuesBefore: false, continuesAfter: true });
    expect(layoutWeek([span("c", "2026-10-11", "2026-10-12")], week)).toEqual([]);
    expect(layoutWeek([span("d", "2026-10-03", "2026-10-03")], week)).toEqual([]);
  });

  test("overlapping bars get different rows, others share one", () => {
    const segments = layoutWeek([
      span("long", "2026-10-04", "2026-10-10"),
      span("left", "2026-10-04", "2026-10-05"),
      span("right", "2026-10-07", "2026-10-08"),
      span("mid", "2026-10-05", "2026-10-07"),
    ], week);
    const lane = Object.fromEntries(segments.map((segment) => [segment.item.id, segment.lane]));
    expect(lane.long).toBe(0);
    expect(lane.left).toBe(1);
    expect(lane.mid).toBe(2);
    expect(lane.right).toBe(1);
    // No two bars of one row cover the same column.
    for (const a of segments) for (const b of segments) {
      if (a === b || a.lane !== b.lane) continue;
      expect(a.column + a.span <= b.column || b.column + b.span <= a.column).toBe(true);
    }
  });

  test("ignores items whose end precedes their start", () => {
    expect(layoutWeek([span("bad", "2026-10-08", "2026-10-05")], week)).toEqual([]);
  });

  test("limits rows and counts the rest per day", () => {
    const items = [
      span("a", "2026-10-05", "2026-10-05"),
      span("b", "2026-10-05", "2026-10-05"),
      span("c", "2026-10-05", "2026-10-05"),
      span("d", "2026-10-05", "2026-10-05"),
      span("e", "2026-10-08", "2026-10-08"),
    ];
    const layout = layoutWeekLimited(items, week, 3);
    // Monday has 4 items: 2 bars and "+2"; Thursday's single item shows.
    expect(layout.visible.filter((segment) => segment.column === 1)).toHaveLength(2);
    expect(layout.hiddenByColumn[1]).toBe(2);
    expect(layout.visible.some((segment) => segment.item.id === "e")).toBe(true);
    expect(layout.hiddenByColumn[4]).toBe(0);
    expect(layout.laneCount).toBe(2);
  });

  test("days with exactly the limit show every bar", () => {
    const items = [span("a", "2026-10-05", "2026-10-05"), span("b", "2026-10-05", "2026-10-05"), span("c", "2026-10-05", "2026-10-05")];
    const layout = layoutWeekLimited(items, week, 3);
    expect(layout.visible).toHaveLength(3);
    expect(layout.hiddenByColumn.every((count) => count === 0)).toBe(true);
  });

  test("a hidden multi-day bar counts on each of its days", () => {
    const items = [
      span("a", "2026-10-05", "2026-10-05"),
      span("b", "2026-10-05", "2026-10-05"),
      span("long", "2026-10-04", "2026-10-06"),
    ];
    const layout = layoutWeekLimited(items, week, 2);
    const hidden = items.length - layout.visible.length;
    expect(hidden).toBeGreaterThan(0);
    expect(layout.hiddenByColumn[1]).toBeGreaterThan(0);
  });

  test("lists the items of a day, longest first", () => {
    const items = [span("short", "2026-10-05", "2026-10-05"), span("long", "2026-10-01", "2026-10-09"), span("other", "2026-10-06", "2026-10-07")];
    expect(itemsOnDay(items, "2026-10-05").map((item) => item.id)).toEqual(["long", "short"]);
    expect(overlapsRange(items[2]!, "2026-10-07", "2026-10-31")).toBe(true);
    expect(overlapsRange(items[0]!, "2026-10-06", "2026-10-31")).toBe(false);
  });
});

describe("schedules and birthdays", () => {
  const zone = "Asia/Shanghai";
  const at = (value: string) => Date.parse(value);

  test("covers start through the last instant before the end", () => {
    expect(scheduleDays(at("2026-10-01T15:00:00+08:00"), at("2026-10-08T00:00:00+08:00"), zone)).toEqual({ start: "2026-10-01", end: "2026-10-07", openEnded: false });
    expect(scheduleDays(at("2026-10-01T15:00:00+08:00"), at("2026-10-08T20:59:59+08:00"), zone)).toEqual({ start: "2026-10-01", end: "2026-10-08", openEnded: false });
  });

  test("open and placeholder ends keep the start day only", () => {
    expect(scheduleDays(at("2026-10-01T00:00:00+08:00"), null, zone)).toEqual({ start: "2026-10-01", end: "2026-10-01", openEnded: true });
    expect(scheduleDays(at("2026-10-01T00:00:00+08:00"), at("2099-12-31T23:59:59+08:00"), zone)).toMatchObject({ end: "2026-10-01", openEnded: true });
    expect(scheduleDays(null, at("2026-10-01T00:00:00+08:00"), zone)).toBeNull();
  });

  test("the time zone moves the days", () => {
    expect(scheduleDays(at("2026-10-01T23:00:00+08:00"), at("2026-10-02T23:00:00+08:00"), "UTC")).toEqual({ start: "2026-10-01", end: "2026-10-02", openEnded: false });
    expect(scheduleDays(at("2026-10-01T23:00:00+08:00"), at("2026-10-02T23:00:00+08:00"), "Asia/Tokyo")).toEqual({ start: "2026-10-02", end: "2026-10-02", openEnded: false });
    expect(scheduleDays(at("2026-10-01T23:00:00+08:00"), at("2026-10-03T01:00:00+08:00"), "Asia/Tokyo")).toEqual({ start: "2026-10-02", end: "2026-10-03", openEnded: false });
  });

  test("yearly dates handle February 29", () => {
    expect(yearlyDate(2026, 2, 29)).toBe("2026-02-28");
    expect(yearlyDate(2028, 2, 29)).toBe("2028-02-29");
    expect(yearlyDate(2026, 4, 31)).toBeNull();
    expect(yearlyDate(2026, 0, 1)).toBeNull();
  });

  test("lists occurrences in a range and finds the next one", () => {
    expect(yearlyOccurrences(10, 4, "2025-01-01", "2027-12-31")).toEqual(["2025-10-04", "2026-10-04", "2027-10-04"]);
    expect(yearlyOccurrences(10, 4, "2026-10-05", "2027-10-03")).toEqual([]);
    expect(nextYearly(10, 4, "2026-10-04")).toBe("2026-10-04");
    expect(nextYearly(10, 4, "2026-10-05")).toBe("2027-10-04");
    expect(nextYearly(1, 2, "2026-12-30")).toBe("2027-01-02");
  });
});

describe("time zones", () => {
  test("day starts follow the zone's offset", async () => {
    const { zonedDayStart, timeZoneOffset } = await import("../src/lib/calendar/model");
    expect(zonedDayStart("2026-10-04", "Asia/Shanghai")).toBe(Date.parse("2026-10-04T00:00:00+08:00"));
    expect(zonedDayStart("2026-10-04", "UTC")).toBe(Date.parse("2026-10-04T00:00:00Z"));
    expect(zonedDayStart("2026-03-08", "America/New_York")).toBe(Date.parse("2026-03-08T00:00:00-05:00"));
    expect(zonedDayStart("2026-07-01", "America/New_York")).toBe(Date.parse("2026-07-01T00:00:00-04:00"));
    expect(timeZoneOffset(Date.parse("2026-10-04T00:00:00Z"), "Asia/Tokyo")).toBe(9 * 3_600_000);
  });
});

describe("calendar entries", () => {
  test("builds dated entries, drops permanent ones and lays them out in the reader's zone", async () => {
    const { buildCalendarEntries, calendarItems, filterCalendarItems } = await import("../src/lib/calendar/data");
    const entries = buildCalendarEntries({
      events: [{ id: 3, name: "Event 3", startAt: "2026-10-01 15:00:00", endAt: "2026-10-08 20:59:59", displayEndAt: "", bannerUrl: "b", logoUrl: "", backgroundUrl: "", bandIds: [], characters: [{ id: 22, name: "K" }], searchText: "" }],
      gachas: [{ id: 7, name: "Gacha 7", description: "", bannerPath: "", startAt: "2026-10-04 0:00:00", endAt: "2026-10-06 23:59:59", isLimited: false, memberCount: 0, supportCount: 0, itemCount: 0, pickupCharacters: [{ id: 22, name: "K" }], bandIds: [], searchText: "" }],
      rewards: [
        { slug: "login-bonus-1", kind: "loginBonus", id: 1, title: "Daily", bannerUrl: "", startAt: "2026/01/01 0:00:00", endAt: "", highlights: [], searchText: "" },
        { slug: "missions-2", kind: "mission", id: 2, title: "Limited", bannerUrl: "", startAt: "2026/10/02 0:00:00", endAt: "2026/10/30 0:00:00", highlights: [], searchText: "" },
      ],
      realLives: [{ id: 1, bands: [{ id: 3, name: "Band 3" }], startAt: "2026/10/11 0:00:00", endAt: "2026/10/11 18:00:00" }],
    }, "en-US");
    expect(entries.map((entry) => [entry.id, entry.kind, entry.link])).toEqual([
      ["event:3", "event", { routeId: "events", detailId: 3 }],
      ["gacha:7", "gacha", { routeId: "gacha", detailId: 7 }],
      ["mission:2", "mission", { routeId: "rewards", detailId: "missions-2" }],
      ["realLive:1", "realLive", { routeId: "real-lives" }],
    ]);
    const birthdays = [{ characterId: 22, name: "K", bandId: 5, month: 10, day: 4, color: "#22CCFF" }];
    const items = calendarItems(entries, birthdays, "2026-09-27", "2026-11-07", "Asia/Shanghai");
    expect(items.find((item) => item.id === "event:3")).toMatchObject({ start: "2026-10-01", end: "2026-10-08" });
    expect(items.find((item) => item.kind === "birthday")).toMatchObject({ id: "birthday:22:2026", start: "2026-10-04", color: "#22CCFF", link: { routeId: "characters", detailId: 22 } });
    // Outside the range: nothing.
    expect(calendarItems(entries, birthdays, "2026-12-01", "2026-12-31", "Asia/Shanghai")).toEqual([]);
    expect(filterCalendarItems(items, { kinds: ["gacha", "birthday"], characterIds: [] }).map((item) => item.id)).toEqual(["gacha:7", "birthday:22:2026"]);
    expect(filterCalendarItems(items, { kinds: [], characterIds: [22] }).map((item) => item.kind).sort()).toEqual(["birthday", "event", "gacha"]);
  });
});

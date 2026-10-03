import { describe, expect, test } from "bun:test";
import { dateRangeBound, inDateRange, isDateRangeActive } from "../src/lib/filter/date-range";
import { countdownParts } from "../src/lib/schedule/countdown";

const at = (iso: string) => Date.parse(iso);

describe("inDateRange", () => {
  const event = { startAt: "2026/05/01 15:00:00", endAt: "2026/05/10 14:59:59" };
  test("inactive ranges keep everything", () => {
    expect(inDateRange(event, null)).toBe(true);
    expect(inDateRange(event, { from: "", to: null })).toBe(true);
    expect(isDateRangeActive({ from: "bad" })).toBe(false);
    expect(isDateRangeActive({ to: "2026-05-01" })).toBe(true);
  });
  test("days are whole server-time days (UTC+8)", () => {
    expect(dateRangeBound("2026-05-10", "from")).toBe(at("2026-05-10T00:00:00+08:00"));
    expect(dateRangeBound("2026-05-10", "to")).toBe(at("2026-05-10T23:59:59.999+08:00"));
  });
  test("overlap mode: any touch counts", () => {
    expect(inDateRange(event, { from: "2026-05-10" })).toBe(true);
    expect(inDateRange(event, { from: "2026-05-11" })).toBe(false);
    expect(inDateRange(event, { to: "2026-05-01" })).toBe(true);
    expect(inDateRange(event, { to: "2026-04-30" })).toBe(false);
    expect(inDateRange({ startAt: "2026/01/01 00:00:00", endAt: "" }, { from: "2030-01-01" })).toBe(true);
  });
  test("start mode: the start date must fall in the range", () => {
    expect(inDateRange(event, { from: "2026-05-02" }, { mode: "start" })).toBe(false);
    expect(inDateRange(event, { from: "2026-05-01", to: "2026-05-01" }, { mode: "start" })).toBe(true);
    expect(inDateRange({ startAt: "" }, { from: "2026-05-01" }, { mode: "start" })).toBe(false);
  });
  test("tagged offsets are honoured and reversed ranges read in order", () => {
    // 2026-05-01 00:30 JST is still April 30 in UTC+8.
    expect(inDateRange({ startAt: "2026/05/01 00:30:00+09:00" }, { from: "2026-05-01" }, { mode: "start" })).toBe(false);
    expect(inDateRange(event, { from: "2026-05-31", to: "2026-05-05" })).toBe(true);
  });
});

describe("countdownParts", () => {
  const start = "2026/05/10 15:00:00";
  const end = "2026/05/20 14:59:59";
  test("upcoming counts days to the start, rounded up", () => {
    expect(countdownParts(start, end, at("2026-05-01T15:00:00+08:00"))).toMatchObject({ status: "upcoming", target: "start", unit: "day", count: 9 });
    expect(countdownParts(start, end, at("2026-05-01T16:00:00+08:00")).count).toBe(9);
  });
  test("under two days it counts hours, never 0", () => {
    expect(countdownParts(start, end, at("2026-05-20T13:00:00+08:00"))).toMatchObject({ status: "ongoing", target: "end", unit: "hour", count: 2 });
    expect(countdownParts(start, end, at("2026-05-20T14:59:58+08:00")).count).toBe(1);
  });
  test("ended and open-ended schedules have no count", () => {
    expect(countdownParts(start, end, at("2026-06-01T00:00:00+08:00"))).toEqual({ status: "ended", target: null, remaining: 0, count: 0, unit: null });
    expect(countdownParts(start, "", at("2026-06-01T00:00:00+08:00")).status).toBe("permanent");
    expect(countdownParts(null, null, 0).status).toBe("permanent");
  });
});

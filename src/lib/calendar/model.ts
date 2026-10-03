/**
 * Month grid and bar layout of the calendar page (pure, no DOM). Days are civil dates (`YYYY-MM-DD`) kept apart from
 * instants: a schedule's instants become days in the reader's time zone (`calendarDayAt`), and stepping a day or a
 * month works on the date itself, so daylight saving time never shifts a cell.
 */

export type CalendarDate = string;

const DAY_MS = 86_400_000;
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH = /^(\d{4})-(\d{2})$/;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

export function parseCalendarDate(value: string | null | undefined): CivilDate | null {
  const match = value?.match(DATE);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return null;
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return { year, month, day };
}

/** `YYYY-MM-DD`; out-of-range parts roll over like `Date.UTC` (month 13 is next January). */
export function calendarDate(year: number, month: number, day: number): CalendarDate {
  const value = new Date(Date.UTC(year, month - 1, day));
  const y = value.getUTCFullYear();
  return `${String(y).padStart(4, "0")}-${String(value.getUTCMonth() + 1).padStart(2, "0")}-${String(value.getUTCDate()).padStart(2, "0")}`;
}

/** Noon UTC of a date: a stable instant for day arithmetic and weekday lookup. */
export function calendarDateUtc(value: CalendarDate): number {
  const date = parseCalendarDate(value);
  if (!date) throw new RangeError(`Invalid calendar date: ${value}`);
  return Date.UTC(date.year, date.month - 1, date.day, 12);
}

export function addCalendarDays(value: CalendarDate, days: number): CalendarDate {
  const date = new Date(calendarDateUtc(value) + days * DAY_MS);
  return calendarDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `a` to `b` (negative when `b` is earlier). */
export function calendarDaysBetween(a: CalendarDate, b: CalendarDate): number {
  return Math.round((calendarDateUtc(b) - calendarDateUtc(a)) / DAY_MS);
}

/** 0 = Sunday … 6 = Saturday. */
export function calendarWeekday(value: CalendarDate): number {
  return new Date(calendarDateUtc(value)).getUTCDay();
}

const dayFormatters = new Map<string, Intl.DateTimeFormat>();

/** The date an instant falls on in `timeZone`. */
export function calendarDayAt(ms: number, timeZone: string): CalendarDate {
  let formatter = dayFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
    dayFormatters.set(timeZone, formatter);
  }
  const parts = Object.fromEntries(formatter.formatToParts(ms).map((part) => [part.type, part.value]));
  return calendarDate(Number(parts.year), Number(parts.month), Number(parts.day));
}

// ── Months ──

export interface CalendarMonth {
  year: number;
  month: number;
}

/** `YYYY-MM` (the page's `?month=` value). */
export function monthKey({ year, month }: CalendarMonth): string {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

export function parseMonthKey(value: string | null | undefined): CalendarMonth | null {
  const match = value?.match(MONTH);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1970 || year > 9999 || month < 1 || month > 12) return null;
  return { year, month };
}

export function monthOf(value: CalendarDate): CalendarMonth {
  const date = parseCalendarDate(value);
  if (!date) throw new RangeError(`Invalid calendar date: ${value}`);
  return { year: date.year, month: date.month };
}

export function shiftMonth({ year, month }: CalendarMonth, step: number): CalendarMonth {
  const index = year * 12 + (month - 1) + step;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function daysInMonth({ year, month }: CalendarMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

// ── Week start ──

type WeekInfoLocale = Intl.Locale & { getWeekInfo?: () => { firstDay: number }; weekInfo?: { firstDay: number } };

/** Languages whose calendars start on Sunday when the runtime cannot tell (Intl.Locale week info is not everywhere). */
const SUNDAY_FIRST_LANGUAGES = new Set(["en", "zh", "ja", "ko"]);

/**
 * First day of the week for a locale, 0 = Sunday … 6 = Saturday: the region's from `Intl.Locale` week info when the
 * runtime has it, else Sunday for English, Chinese, Japanese and Korean and Monday for the rest.
 */
export function weekStartFor(locale: string): number {
  try {
    const info = new Intl.Locale(locale) as WeekInfoLocale;
    const firstDay = info.getWeekInfo?.().firstDay ?? info.weekInfo?.firstDay;
    if (typeof firstDay === "number" && firstDay >= 1 && firstDay <= 7) return firstDay % 7;
  } catch {
    // fall through to the language default
  }
  return SUNDAY_FIRST_LANGUAGES.has(locale.split("-")[0]!.toLowerCase()) ? 0 : 1;
}

/** Weekdays (0 = Sunday) in column order for a week starting on `weekStart`. */
export function weekdayOrder(weekStart: number): number[] {
  return Array.from({ length: 7 }, (_, index) => (weekStart + index) % 7);
}

/** The 42 days (6 weeks × 7) of a month view: the month with the days around it filling its first and last week. */
export function monthGrid(month: CalendarMonth, weekStart: number): CalendarDate[] {
  const first = calendarDate(month.year, month.month, 1);
  const offset = (calendarWeekday(first) - weekStart + 7) % 7;
  const start = addCalendarDays(first, -offset);
  return Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
}

/** `days` cut into rows of seven. */
export function chunkWeeks<T>(days: readonly T[]): T[][] {
  const weeks: T[][] = [];
  for (let index = 0; index < days.length; index += 7) weeks.push(days.slice(index, index + 7));
  return weeks;
}

// ── Bars ──

/** Something that covers whole days, `start` through `end` inclusive. */
export interface DaySpan {
  id: string;
  start: CalendarDate;
  end: CalendarDate;
}

export interface WeekSegment<T extends DaySpan> {
  item: T;
  /** First column (0–6) the bar covers in this week. */
  column: number;
  /** Columns covered. */
  span: number;
  /** Row of the bar within the week; bars of one week never overlap in a row. */
  lane: number;
  /** The item started before this week / goes on after it (the bar's cut ends). */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/**
 * The bars of one week (seven consecutive days): every item overlapping it, cut to the week, each given the lowest row
 * free over all its columns. Longer and earlier bars claim rows first so they stay on top across the week.
 */
export function layoutWeek<T extends DaySpan>(items: readonly T[], week: readonly CalendarDate[]): WeekSegment<T>[] {
  if (week.length === 0) return [];
  const first = week[0]!;
  const last = week[week.length - 1]!;
  const segments: Array<Omit<WeekSegment<T>, "lane">> = [];
  for (const item of items) {
    if (item.end < first || item.start > last || item.end < item.start) continue;
    const from = item.start < first ? first : item.start;
    const to = item.end > last ? last : item.end;
    const column = calendarDaysBetween(first, from);
    segments.push({ item, column, span: calendarDaysBetween(from, to) + 1, continuesBefore: item.start < first, continuesAfter: item.end > last });
  }
  segments.sort((a, b) => a.column - b.column || b.span - a.span || (a.item.start < b.item.start ? -1 : a.item.start > b.item.start ? 1 : 0) || (a.item.id < b.item.id ? -1 : a.item.id > b.item.id ? 1 : 0));
  // rows[lane][column] = taken
  const rows: boolean[][] = [];
  return segments.map((segment) => {
    let lane = 0;
    for (;; lane += 1) {
      const row = rows[lane] ??= Array<boolean>(week.length).fill(false);
      let free = true;
      for (let column = segment.column; column < segment.column + segment.span; column += 1) {
        if (row[column]) { free = false; break; }
      }
      if (free) {
        for (let column = segment.column; column < segment.column + segment.span; column += 1) row[column] = true;
        break;
      }
    }
    return { ...segment, lane };
  });
}

export interface WeekLayout<T extends DaySpan> {
  days: CalendarDate[];
  /** Bars in rows below `maxLanes`. */
  visible: WeekSegment<T>[];
  /** Per column, how many items of that day did not fit ("+N more"). */
  hiddenByColumn: number[];
  /** Rows the visible bars use (at most `maxLanes`). */
  laneCount: number;
}

/**
 * A week with at most `maxLanes` rows of bars; when a day has more items than fit, its last row gives way to the
 * "+N more" line, so that day lists `maxLanes - 1` bars and counts the rest.
 */
export function layoutWeekLimited<T extends DaySpan>(items: readonly T[], week: readonly CalendarDate[], maxLanes: number): WeekLayout<T> {
  const segments = layoutWeek(items, week);
  const perColumn = Array<number>(week.length).fill(0);
  for (const segment of segments) for (let column = segment.column; column < segment.column + segment.span; column += 1) perColumn[column]! += 1;
  // A column that overflows keeps one row free for its "+N" line.
  const limitFor = (column: number) => (perColumn[column]! > maxLanes ? Math.max(0, maxLanes - 1) : maxLanes);
  const visible: WeekSegment<T>[] = [];
  const hiddenByColumn = Array<number>(week.length).fill(0);
  for (const segment of segments) {
    let fits = true;
    for (let column = segment.column; column < segment.column + segment.span; column += 1) {
      if (segment.lane >= limitFor(column)) { fits = false; break; }
    }
    if (fits) visible.push(segment);
    else for (let column = segment.column; column < segment.column + segment.span; column += 1) hiddenByColumn[column]! += 1;
  }
  const laneCount = visible.reduce((max, segment) => Math.max(max, segment.lane + 1), 0);
  return { days: [...week], visible, hiddenByColumn, laneCount };
}

/** Items covering `day`, longest first then by start. */
export function itemsOnDay<T extends DaySpan>(items: readonly T[], day: CalendarDate): T[] {
  return items
    .filter((item) => item.start <= day && item.end >= day)
    .sort((a, b) => calendarDaysBetween(b.start, b.end) - calendarDaysBetween(a.start, a.end) || (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || (a.id < b.id ? -1 : 1));
}

/** Whether `item` overlaps `first`…`last`. */
export function overlapsRange(item: DaySpan, first: CalendarDate, last: CalendarDate): boolean {
  return item.start <= last && item.end >= first;
}

// ── Schedules and birthdays ──

/** Schedules longer than this have no meaningful end on a calendar (a far-future placeholder) and show on their start day only. */
export const OPEN_ENDED_DAYS = 400;

/**
 * The days a schedule covers in `timeZone`: from the start's day through the day of the last instant before the end
 * (an end at midnight closes the previous day). Null without a start. No end, or a placeholder end years away, leaves
 * the start day alone.
 */
export function scheduleDays(startMs: number | null, endMs: number | null, timeZone: string): { start: CalendarDate; end: CalendarDate; openEnded: boolean } | null {
  if (startMs === null || !Number.isFinite(startMs)) return null;
  const start = calendarDayAt(startMs, timeZone);
  if (endMs === null || !Number.isFinite(endMs) || endMs <= startMs) return { start, end: start, openEnded: endMs === null };
  const end = calendarDayAt(endMs - 1, timeZone);
  if (calendarDaysBetween(start, end) > OPEN_ENDED_DAYS) return { start, end: start, openEnded: true };
  return { start, end: end < start ? start : end, openEnded: false };
}

/**
 * The date a yearly `month`/`day` falls on in `year`; February 29 falls on February 28 in common years. Null for a
 * date no year has.
 */
export function yearlyDate(year: number, month: number, day: number): CalendarDate | null {
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) return null;
  const length = daysInMonth({ year, month });
  if (day > length) return month === 2 && day === 29 ? calendarDate(year, 2, 28) : null;
  return calendarDate(year, month, day);
}

/** Every occurrence of a yearly date between `first` and `last` (inclusive). */
export function yearlyOccurrences(month: number, day: number, first: CalendarDate, last: CalendarDate): CalendarDate[] {
  const from = parseCalendarDate(first);
  const to = parseCalendarDate(last);
  if (!from || !to) return [];
  const dates: CalendarDate[] = [];
  for (let year = from.year; year <= to.year; year += 1) {
    const date = yearlyDate(year, month, day);
    if (date && date >= first && date <= last) dates.push(date);
  }
  return dates;
}

/** The next occurrence of a yearly date on or after `today`. */
export function nextYearly(month: number, day: number, today: CalendarDate): CalendarDate | null {
  const now = parseCalendarDate(today);
  if (!now) return null;
  const thisYear = yearlyDate(now.year, month, day);
  if (thisYear && thisYear >= today) return thisYear;
  return yearlyDate(now.year + 1, month, day);
}

/** Offset of `timeZone` from UTC at `ms`, in ms (positive east of Greenwich). */
export function timeZoneOffset(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(ms)
      .map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour) % 24, Number(parts.minute), Number(parts.second));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant a civil date begins in `timeZone`. */
export function zonedDayStart(value: CalendarDate, timeZone: string): number {
  const date = parseCalendarDate(value);
  if (!date) throw new RangeError(`Invalid calendar date: ${value}`);
  const guess = Date.UTC(date.year, date.month - 1, date.day);
  const first = guess - timeZoneOffset(guess, timeZone);
  // A DST switch between the guess and the real midnight moves the offset once more.
  return guess - timeZoneOffset(first, timeZone);
}

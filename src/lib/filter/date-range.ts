import { MASTER_UTC_OFFSET, parseMasterDate } from "@/lib/schedule";

/**
 * A calendar-day range picked in a date filter: `YYYY-MM-DD` strings (what `<input type="date">` gives), either side
 * open when null/empty. Both ends are whole days: `from` starts at 00:00:00 and `to` ends at 23:59:59.
 */
export interface DateRange {
  from?: string | null;
  to?: string | null;
}

/** An entry with a MasterData schedule; a blank side is open. */
export interface DateRangeEntry {
  startAt?: string | null;
  endAt?: string | null;
}

export interface DateRangeOptions {
  /**
   * - `overlap` (default): the entry's schedule touches the range at all (an event still running on `from` counts).
   * - `start`: the entry starts within the range (release-date filtering).
   */
  mode?: "overlap" | "start";
  /** UTC offset the picked days are read in (default the international servers' `+08:00`, like MasterData itself). */
  offset?: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Start (00:00:00) or end (23:59:59.999) of a picked day as epoch ms in `offset`, or null when blank or malformed. */
export function dateRangeBound(day: string | null | undefined, side: "from" | "to", offset = MASTER_UTC_OFFSET): number | null {
  const match = day?.trim().match(DAY);
  if (!match) return null;
  const time = parseMasterDate(`${match[1]}-${match[2]}-${match[3]} ${side === "from" ? "0:00:00" : "23:59:59"}${offset}`);
  return time === null ? null : side === "to" ? time + 999 : time;
}

/** Whether the range filters anything. */
export function isDateRangeActive(range: DateRange | null | undefined): boolean {
  return Boolean(range && (dateRangeBound(range.from, "from") !== null || dateRangeBound(range.to, "to") !== null));
}

/**
 * Whether an entry falls in the range (see {@link DateRangeOptions.mode}). MasterData times are read in their server's
 * zone (parseMasterDate); an inactive range keeps everything. With `start`, an entry without a start date only passes
 * an inactive range.
 */
export function inDateRange(entry: DateRangeEntry, range: DateRange | null | undefined, options: DateRangeOptions = {}): boolean {
  if (!range) return true;
  const { mode = "overlap", offset = MASTER_UTC_OFFSET } = options;
  const from = dateRangeBound(range.from, "from", offset);
  const to = dateRangeBound(range.to, "to", offset);
  if (from === null && to === null) return true;
  // A reversed range (to before from) reads from the earlier day to the later one.
  const [low, high] = from !== null && to !== null && to < from
    ? [dateRangeBound(range.to, "from", offset), dateRangeBound(range.from, "to", offset)]
    : [from, to];
  const start = parseMasterDate(entry.startAt);
  if (mode === "start") {
    if (start === null) return false;
    return (low === null || start >= low) && (high === null || start <= high);
  }
  const end = parseMasterDate(entry.endAt);
  return (high === null || start === null || start <= high) && (low === null || end === null || end >= low);
}

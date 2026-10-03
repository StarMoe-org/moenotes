import { parseMasterDate, scheduleStatus, type ScheduleStatus } from "@/lib/schedule";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
/** Below this the countdown counts hours instead of days (matches ScheduleBadge). */
export const COUNTDOWN_HOURS_BELOW = 48 * HOUR;

export interface CountdownParts {
  status: ScheduleStatus;
  /** What the count counts down to: the start (upcoming), the end (ongoing), or nothing. */
  target: "start" | "end" | null;
  /** Time left in ms (0 when there is no target). */
  remaining: number;
  /** Whole units left, rounded up so a live schedule never shows 0; 0 when there is no target. */
  count: number;
  unit: "day" | "hour" | null;
}

/**
 * Where a MasterData schedule stands at `now` and how long until its next edge: days while two days or more remain,
 * else hours (rounded up). Blank dates leave that side open (an open end is `permanent`).
 */
export function countdownParts(startAt: string | null | undefined, endAt: string | null | undefined, now: number): CountdownParts {
  const status = scheduleStatus(startAt ?? "", endAt ?? "", now);
  const edge = status === "upcoming" ? parseMasterDate(startAt) : status === "ongoing" ? parseMasterDate(endAt) : null;
  if (edge === null) return { status, target: null, remaining: 0, count: 0, unit: null };
  const remaining = Math.max(0, edge - now);
  const unit = remaining < COUNTDOWN_HOURS_BELOW ? "hour" : "day";
  const count = Math.max(1, Math.ceil(remaining / (unit === "hour" ? HOUR : DAY)));
  return { status, target: status === "upcoming" ? "start" : "end", remaining, count, unit };
}

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

/**
 * Game server time. MasterData timestamps carry no offset: the international servers' are UTC+8. The build appends
 * the offset of other servers' tables (the JP server's `+09:00`, see src/config/servers.ts), which is read back here.
 */
export const MASTER_TIME_ZONE = "Asia/Shanghai";
export const MASTER_UTC_OFFSET = "+08:00";

// Where a timestamp tagged with an offset is shown.
const timeZoneByOffset: Readonly<Record<string, string>> = { "+08:00": MASTER_TIME_ZONE, "+09:00": "Asia/Tokyo" };

const MASTER_DATE = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?([+-]\d{2}:\d{2})?$/;

/** Whether a string is a MasterData timestamp, without an offset (the form the tables carry). */
export function isUntaggedMasterDate(value: string): boolean {
  const match = value.trim().match(MASTER_DATE);
  return Boolean(match && !match[7]);
}

/** "UTC+8"-style name of the offset a MasterData timestamp is read in. */
export function masterUtcLabel(value: string | null | undefined): string {
  const offset = value?.trim().match(MASTER_DATE)?.[7] ?? MASTER_UTC_OFFSET;
  const [hours = "0", minutes = "00"] = offset.slice(1).split(":");
  return `UTC${offset[0]}${Number(hours)}${minutes === "00" ? "" : `:${minutes}`}`;
}

/** The time zone a MasterData timestamp is shown in: its server's. */
export function masterTimeZone(value: string | null | undefined): string {
  const offset = value?.trim().match(MASTER_DATE)?.[7];
  return (offset && timeZoneByOffset[offset]) || MASTER_TIME_ZONE;
}

export type ScheduleStatus = "upcoming" | "ongoing" | "ended" | "permanent";

/**
 * Parses MasterData timestamps such as "2026/09/28 12:59:59" or "2026-09-01 0:00:00".
 * Blank values and the literal "null" mean the schedule is open on that side.
 */
export function parseMasterDate(value: string | null | undefined): number | null {
  const match = value?.trim().match(MASTER_DATE);
  if (!match) return null;
  const [, year, month, day, hour = "0", minute = "00", second = "00", offset = MASTER_UTC_OFFSET] = match;
  const pad = (part: string) => part.padStart(2, "0");
  const time = Date.parse(`${year}-${pad(month!)}-${pad(day!)}T${pad(hour)}:${minute}:${second}${offset}`);
  return Number.isFinite(time) ? time : null;
}

export function scheduleStatus(startAt: string, endAt: string, now: number): ScheduleStatus {
  const start = parseMasterDate(startAt);
  const end = parseMasterDate(endAt);
  if (start !== null && now < start) return "upcoming";
  if (end !== null) return now <= end ? "ongoing" : "ended";
  return "permanent";
}

/** Newest first; entries without a start date sort last. */
export function compareByStartDesc(a: { startAt: string; id: number | string }, b: { startAt: string; id: number | string }): number {
  const diff = (parseMasterDate(b.startAt) ?? -Infinity) - (parseMasterDate(a.startAt) ?? -Infinity);
  if (diff) return diff;
  return typeof a.id === "number" && typeof b.id === "number" ? b.id - a.id : String(b.id).localeCompare(String(a.id));
}

export function formatMasterDate(value: string, locale: AppLocale, withTime = true): string {
  const time = parseMasterDate(value);
  if (time === null) return "";
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hourCycle: "h23" as const } : {}),
    timeZone: masterTimeZone(value),
  }).format(time);
}

/** A MasterData date as "September 1, 2026" in its server's time; the raw value when it is not one. */
export function formatMasterDay(value: string, locale: AppLocale): string {
  const time = parseMasterDate(value);
  if (time === null) return value;
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric", timeZone: masterTimeZone(value) }).format(time);
}

/** Whole hours until `target`, rounded up so "0 hours left" is never shown for a live schedule. */
export function hoursUntil(target: number, now: number): number {
  return Math.max(1, Math.ceil((target - now) / 3_600_000));
}

/** "start – end", "from start", "until end", or "" when the schedule is open on both sides. */
export function formatScheduleRange(startAt: string, endAt: string, locale: AppLocale): string {
  const start = formatMasterDate(startAt, locale);
  const end = formatMasterDate(endAt, locale);
  if (start && end) return t(locale, "schedule.range", { start, end });
  if (start) return t(locale, "schedule.from", { start });
  if (end) return t(locale, "schedule.until", { end });
  return "";
}

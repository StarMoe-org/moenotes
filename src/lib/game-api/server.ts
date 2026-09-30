import { GAME_SERVER_TIME_ZONES, type GameServer } from "@/config/game-api";
import { isGameServer } from "@/config/servers";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { browserTimeZone } from "@/lib/schedule";
import type { GameServerSetting } from "@/types/settings";

export { isGameServer };

/** The server a reader most likely plays on: the Chinese site languages read the TW server, the rest EN. */
export function defaultGameServer(locale: AppLocale): GameServer {
  if (locale === "zh-CN" || locale === "zh-TW") return "tw";
  if (locale === "ja-JP") return "jp";
  if (locale === "ko-KR") return "kr";
  return "en";
}

/** The server a setting stands for: `auto` follows the site language. */
export function resolveGameServer(setting: GameServerSetting, locale: AppLocale): GameServer {
  return setting === "auto" ? defaultGameServer(locale) : setting;
}

/** A Unix-seconds string of the game API as ms, or null. */
export function parseGameSeconds(value: string | undefined): number | null {
  const seconds = value ? Number(value) : Number.NaN;
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : null;
}

/**
 * The zone game API times are shown in: the reader's (these pages fetch in the browser), else the server's own.
 */
function shownTimeZone(server: GameServer): string {
  return browserTimeZone() ?? GAME_SERVER_TIME_ZONES[server];
}

/** Date and time in the reader's time zone; name the zone once next to it with serverTimeZoneName. */
export function formatServerTime(time: number, server: GameServer, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: shownTimeZone(server),
  }).format(time);
}

/** The zone formatServerTime shows `time` in, e.g. "GMT+8" or "UTC". */
export function serverTimeZoneName(time: number, server: GameServer, locale: AppLocale): string {
  return new Intl.DateTimeFormat(locale, { timeZone: shownTimeZone(server), timeZoneName: "short" })
    .formatToParts(time)
    .find((part) => part.type === "timeZoneName")?.value ?? "";
}

/** "12 minutes ago"-style age; `now` should be rankd's clock (`X-Server-Time`). */
export function formatAge(time: number, now: number, locale: AppLocale): string {
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  const format = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (seconds < 60) return format.format(0, "second");
  if (seconds < 3600) return format.format(-Math.floor(seconds / 60), "minute");
  if (seconds < 86_400) return format.format(-Math.floor(seconds / 3600), "hour");
  return format.format(-Math.floor(seconds / 86_400), "day");
}

/** One time with its zone named, e.g. "2026/09/29 20:30 (GMT+9)". */
export function formatServerTimeInZone(time: number, server: GameServer, locale: AppLocale): string {
  return t(locale, "gameServer.inZone", { time: formatServerTime(time, server, locale), zone: serverTimeZoneName(time, server, locale) });
}

/** "start – end", or "from start" without an end, with the zone named once. */
export function formatServerSchedule(start: number, end: number | null, server: GameServer, locale: AppLocale): string {
  const format = (time: number) => formatServerTime(time, server, locale);
  const range = end !== null ? t(locale, "schedule.range", { start: format(start), end: format(end) }) : t(locale, "schedule.from", { start: format(start) });
  return t(locale, "gameServer.inZone", { time: range, zone: serverTimeZoneName(start, server, locale) });
}

import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { CalendarData, CalendarEntry, CalendarBirthday } from "@/lib/calendar/data";
import { buildCalendarEntries } from "@/lib/calendar/data";
import { eventsOn, gachasOn, getBuildCharacters, getBuildBandNames, rewardEntriesOn } from "@/lib/masterdata/build-data";
import { memo, mergedValue, table } from "@/lib/masterdata/build-core";
import type { ServerFacetedValue } from "@/lib/servers/facets";

/**
 * MasterRealLiveSchedule: the in-game broadcasts of real concerts (`_id _bandIds _readyAt _startAt _endAt`).
 * A minimal reader until the real-lives page's own selector lands (src/lib/real-lives/data.ts); a server whose table
 * is missing or broken has none.
 */
export interface RawRealLiveSchedule {
  id: number;
  bandIds?: number[];
  bandIDs?: number[];
  readyAt?: string;
  startAt: string;
  endAt: string;
}

export function realLiveSchedulesOn(server: GameServer): Promise<RawRealLiveSchedule[]> {
  return memo(`calendar-real-lives:${server}`, async () => {
    try {
      return (await table<RawRealLiveSchedule>("MasterRealLiveSchedule.json", server))._allData.filter((row) => row && typeof row.id === "number");
    } catch {
      return [];
    }
  });
}

/** Everything with a date on one server, for the calendar. */
export function calendarEntriesOn(server: GameServer, locale: AppLocale): Promise<CalendarEntry[]> {
  return memo(`calendar:${server}:${locale}`, async () => {
    const [events, gachas, rewards, realLives, bandNames] = await Promise.all([
      eventsOn(server, locale).catch(() => []),
      gachasOn(server, locale).catch(() => []),
      rewardEntriesOn(server, locale).catch(() => []),
      realLiveSchedulesOn(server),
      getBuildBandNames(locale).catch(() => [] as Array<[number, string]>),
    ]);
    return buildCalendarEntries({ events, gachas, rewards, realLives, bandNames: new Map(bandNames) }, locale);
  });
}

/** Character birthdays (every server has the same characters; the merged list covers server-only ones too). */
export function getBuildCalendarBirthdays(locale: AppLocale): Promise<CalendarBirthday[]> {
  return memo(`calendar-birthdays:${locale}`, async () => {
    const { characters } = await getBuildCharacters(locale);
    return characters
      .filter((character) => character.birthdayMonth >= 1 && character.birthdayMonth <= 12 && character.birthdayDay >= 1)
      .map((character) => ({
        characterId: character.id,
        name: character.name,
        bandId: character.bandId,
        month: character.birthdayMonth,
        day: character.birthdayDay,
        color: character.mainColor,
      }));
  });
}

/** The calendar page's data: each server's dated entries, and the birthdays. */
export async function getBuildCalendar(locale: AppLocale): Promise<{ data: ServerFacetedValue<CalendarData>; birthdays: CalendarBirthday[] }> {
  const [data, birthdays] = await Promise.all([
    mergedValue(`calendar:${locale}`, async (server) => ({ entries: await calendarEntriesOn(server, locale) })),
    getBuildCalendarBirthdays(locale).catch(() => []),
  ]);
  return { data: data ?? { value: { entries: [] }, servers: [] }, birthdays };
}

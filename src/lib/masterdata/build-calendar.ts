import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { CalendarData, CalendarEntry, CalendarBirthday } from "@/lib/calendar/data";
import { buildCalendarEntries } from "@/lib/calendar/data";
import { eventsOn, gachasOn, getBuildCharacters, rewardEntriesOn } from "@/lib/masterdata/build-data";
import { memo, mergedValue } from "@/lib/masterdata/build-core";
import { realLivesOn } from "@/lib/masterdata/build-real-lives";
import type { ServerFacetedValue } from "@/lib/servers/facets";

/** Everything with a date on one server, for the calendar. */
export function calendarEntriesOn(server: GameServer, locale: AppLocale): Promise<CalendarEntry[]> {
  return memo(`calendar:${server}:${locale}`, async () => {
    const [events, gachas, rewards, realLives] = await Promise.all([
      eventsOn(server, locale).catch(() => []),
      gachasOn(server, locale).catch(() => []),
      rewardEntriesOn(server, locale).catch(() => []),
      realLivesOn(server, locale).catch(() => []),
    ]);
    return buildCalendarEntries({ events, gachas, rewards, realLives }, locale);
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

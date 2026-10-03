import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  calendarDaysBetween,
  scheduleDays,
  yearlyOccurrences,
  type CalendarDate,
  type DaySpan,
} from "@/lib/calendar/model";
import type { EventViewModel } from "@/lib/events/data";
import type { GachaViewModel } from "@/lib/gacha/data";
import type { RewardEntrySummary } from "@/lib/rewards/data";
import type { EntityLink } from "@/lib/route/entity-link";
import { parseMasterDate } from "@/lib/schedule";

/** What a calendar entry is; also the type filter and the color of its bar. */
export const CALENDAR_KINDS = ["event", "gacha", "loginBonus", "seasonPass", "mission", "realLive", "birthday"] as const;
export type CalendarKind = (typeof CALENDAR_KINDS)[number];

/** Semantic colors of the kinds (CSS variables of the design tokens); birthdays use the character's color. */
export const CALENDAR_KIND_COLORS: Readonly<Record<CalendarKind, string>> = {
  event: "var(--mn-accent)",
  gacha: "var(--mn-pink)",
  loginBonus: "var(--mn-mint)",
  seasonPass: "var(--mn-amber)",
  mission: "var(--mn-cyan)",
  realLive: "var(--mn-rose)",
  birthday: "var(--mn-peach)",
};

/** Something dated on one server, as the build hands it to the page (MasterData timestamps, server time). */
export interface CalendarEntry {
  /** Unique within the server: `<kind>:<id>`. */
  id: string;
  kind: Exclude<CalendarKind, "birthday">;
  title: string;
  startAt: string;
  endAt: string;
  link?: EntityLink;
  /** Banner artwork (release URL, server neutral) for the list view; empty when none. */
  image?: string;
  characterIds: number[];
}

export interface CalendarData {
  entries: CalendarEntry[];
}

/** A character's yearly birthday; the page lays it out on every year it shows. */
export interface CalendarBirthday {
  characterId: number;
  name: string;
  bandId: number;
  month: number;
  day: number;
  /** The character's main color (MasterCharacter.mainColorCode). */
  color: string;
}

export interface CalendarSources {
  events: readonly EventViewModel[];
  gachas: readonly GachaViewModel[];
  rewards: readonly RewardEntrySummary[];
  realLives: ReadonlyArray<{ id: number; bandIds?: number[] | undefined; bandIDs?: number[] | undefined; startAt: string; endAt: string }>;
  bandNames: ReadonlyMap<number, string>;
}

/** One server's dated entries: events, gacha, passes, login bonuses, limited missions and real live broadcasts. */
export function buildCalendarEntries(sources: CalendarSources, locale: AppLocale): CalendarEntry[] {
  const dated = (startAt: string) => parseMasterDate(startAt) !== null;
  const entries: CalendarEntry[] = [];
  for (const event of sources.events) {
    if (!dated(event.startAt)) continue;
    entries.push({
      id: `event:${event.id}`,
      kind: "event",
      title: event.name,
      startAt: event.startAt,
      endAt: event.endAt,
      link: { routeId: "events", detailId: event.id },
      image: event.bannerUrl,
      characterIds: event.characters.map((character) => character.id),
    });
  }
  for (const gacha of sources.gachas) {
    if (!dated(gacha.startAt)) continue;
    entries.push({
      id: `gacha:${gacha.id}`,
      kind: "gacha",
      title: gacha.name,
      startAt: gacha.startAt,
      endAt: gacha.endAt,
      link: { routeId: "gacha", detailId: gacha.id },
      characterIds: gacha.pickupCharacters.map((character) => character.id),
    });
  }
  for (const reward of sources.rewards) {
    // Permanent entries (the daily login bonus, beginner missions) have no place on a calendar.
    if (!dated(reward.startAt) || parseMasterDate(reward.endAt) === null) continue;
    entries.push({
      id: `${reward.kind}:${reward.id}`,
      kind: reward.kind,
      title: reward.title,
      startAt: reward.startAt,
      endAt: reward.endAt,
      link: { routeId: "rewards", detailId: reward.slug },
      image: reward.bannerUrl,
      characterIds: [],
    });
  }
  for (const live of sources.realLives) {
    if (!dated(live.startAt)) continue;
    const bands = (live.bandIds ?? live.bandIDs ?? []).map((id) => sources.bandNames.get(id)).filter(Boolean);
    entries.push({
      id: `realLive:${live.id}`,
      kind: "realLive",
      title: bands.length ? t(locale, "calendar.realLiveTitle", { bands: bands.join(t(locale, "collectionView.nameSeparator")) }) : t(locale, "calendar.kinds.realLive"),
      startAt: live.startAt,
      endAt: live.endAt,
      link: { routeId: "real-lives" },
      characterIds: [],
    });
  }
  return entries;
}

/** An entry laid out on days of the reader's time zone. */
export interface CalendarItem extends DaySpan {
  kind: CalendarKind;
  title: string;
  color: string;
  link?: EntityLink | undefined;
  image?: string | undefined;
  characterIds: number[];
  /** MasterData timestamps (empty for birthdays, which are whole days). */
  startAt: string;
  endAt: string;
  /** The schedule has no real end (open or a placeholder years away): the bar covers its start day only. */
  openEnded: boolean;
}

/**
 * The entries and birthdays covering `first`…`last` as day spans in `timeZone`: entries by their schedule, birthdays
 * on each year's date. Sorted by start, then longest first.
 */
export function calendarItems(entries: readonly CalendarEntry[], birthdays: readonly CalendarBirthday[], first: CalendarDate, last: CalendarDate, timeZone: string): CalendarItem[] {
  const items: CalendarItem[] = [];
  for (const entry of entries) {
    const days = scheduleDays(parseMasterDate(entry.startAt), parseMasterDate(entry.endAt), timeZone);
    if (!days || days.start > last || days.end < first) continue;
    items.push({
      id: entry.id,
      kind: entry.kind,
      title: entry.title,
      color: CALENDAR_KIND_COLORS[entry.kind],
      link: entry.link,
      image: entry.image,
      characterIds: entry.characterIds,
      start: days.start,
      end: days.end,
      startAt: entry.startAt,
      endAt: entry.endAt,
      openEnded: days.openEnded,
    });
  }
  for (const birthday of birthdays) {
    for (const date of yearlyOccurrences(birthday.month, birthday.day, first, last)) {
      items.push({
        id: `birthday:${birthday.characterId}:${date.slice(0, 4)}`,
        kind: "birthday",
        title: birthday.name,
        color: birthday.color || CALENDAR_KIND_COLORS.birthday,
        link: { routeId: "characters", detailId: birthday.characterId },
        characterIds: [birthday.characterId],
        start: date,
        end: date,
        startAt: "",
        endAt: "",
        openEnded: false,
      });
    }
  }
  return items.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0) || calendarDaysBetween(b.start, b.end) - calendarDaysBetween(a.start, a.end) || (a.id < b.id ? -1 : 1));
}

export interface CalendarFilter {
  kinds: readonly CalendarKind[];
  characterIds: readonly number[];
}

/** Items of the chosen kinds (none chosen: all) involving one of the chosen characters (none chosen: any). */
export function filterCalendarItems<T extends Pick<CalendarItem, "kind" | "characterIds">>(items: readonly T[], filter: CalendarFilter): T[] {
  return items.filter((item) => {
    if (filter.kinds.length > 0 && !filter.kinds.includes(item.kind)) return false;
    if (filter.characterIds.length > 0 && !item.characterIds.some((id) => filter.characterIds.includes(id))) return false;
    return true;
  });
}

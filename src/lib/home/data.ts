import { addCalendarDays, calendarDayAt, calendarDaysBetween, nextYearly, zonedDayStart } from "@/lib/calendar/model";
import type { CardViewModel } from "@/lib/cards/data";
import type { CharacterViewModel } from "@/lib/characters/data";
import type { EventViewModel } from "@/lib/events/data";
import type { GachaDetailViewModel, GachaViewModel } from "@/lib/gacha/data";
import type { MusicViewModel } from "@/lib/music/data";
import type { RewardEntryKind, RewardEntrySummary } from "@/lib/rewards/data";
import type { EntityLink } from "@/lib/route/entity-link";
import { compareByStartDesc, parseMasterDate } from "@/lib/schedule";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export interface RawHomeBanner {
  id: number;
  imageAsset: string;
  displayType: number;
  contentId: number;
  displayOrder: number;
  startAt: string;
  endAt: string;
}

export type HomeSlideKind = "event" | "gacha" | "live" | "mission" | "seasonPass" | "exchange" | "story";

/** Where a banner or a home module links: a route, optionally one entity's detail page (src/lib/route/entity-link.ts). */
export type HomeLink = EntityLink;

export interface HomeSlide {
  id: number;
  kind: HomeSlideKind;
  /** Empty when MasterData has no name for the banner target; the UI falls back to the kind label. */
  title: string;
  imagePath: string;
  startAt: string;
  endAt: string;
  link?: HomeLink;
}

/** A banner target the home page can name and link: an exchange shop or a story chapter. */
export interface HomeBannerTarget {
  id: number;
  title: string;
  link: HomeLink;
}

export interface HomeBannerTargets {
  /** Exchange shops by id (displayType 3 and 11). */
  exchanges?: ReadonlyMap<number, HomeBannerTarget> | undefined;
  /** Story chapters (displayType 1) with their banner asset name (MasterStoryChapter.banner). */
  chapters?: ReadonlyArray<{ id: number; banner: string; title: string }> | undefined;
}

/** The events the "current event" card picks from: running or upcoming at build time, the browser picks the one shown. */
export type HomeEvent = Pick<EventViewModel, "id" | "name" | "startAt" | "endAt" | "bannerUrl" | "logoUrl" | "backgroundUrl" | "characters">;

export interface HomeBirthdayCard {
  id: number;
  title: string;
  assetId: number;
  startAt: string;
}

export interface HomeBirthdayGacha {
  id: number;
  name: string;
  bannerPath: string;
  startAt: string;
  endAt: string;
}

/**
 * One character's birthday with what the game released for it. Cards and gacha are every candidate (BD cards of the
 * character, gacha picking one up): which belong to the coming birthday depends on the reader's today, so the browser
 * picks them with {@link birthdayCardFor} / {@link birthdayGachaFor}.
 */
export interface HomeBirthday {
  characterId: number;
  name: string;
  color: string;
  bandName: string;
  month: number;
  day: number;
  cards: HomeBirthdayCard[];
  gachas: HomeBirthdayGacha[];
  /** The birthday story's ADV id, once the birthday story list exists (filled in by the story pack). */
  birthdayStoryAdvId?: number;
}

export interface HomeData {
  slides: HomeSlide[];
  /** Time-limited passes, missions and login bonuses, newest first. */
  rewards: RewardEntrySummary[];
  latestMusic: MusicViewModel[];
  latestCards: CardViewModel[];
  latestSupportCards: SupportCardViewModel[];
  /** Events not yet ended at build time, soonest end first. */
  events: HomeEvent[];
  birthdays: HomeBirthday[];
}

// MasterHomeBanner.displayType names the screen a banner opens (the TW/JP/EN/KR tables of 2026-10 agree):
// 1 a story chapter, 2 a gacha, 3 and 11 an exchange shop (contentId = MasterExchange id), 24 limited missions,
// 25 the season pass.
const bannerKinds: Record<number, HomeSlideKind> = { 1: "story", 2: "gacha", 3: "exchange", 11: "exchange", 24: "mission", 25: "seasonPass" };
// Shop packs and the placeholder banner are not promotions of game content.
const hiddenBannerTypes = new Set([4, 17]);
const rewardKindBySlide: Partial<Record<HomeSlideKind, RewardEntryKind>> = { mission: "mission", seasonPass: "seasonPass" };

const LATEST_LIMIT = 6;
/** BD member cards (CardRarity 20). */
export const BIRTHDAY_RARITY = 20;
/** A BD card or birthday gacha belongs to the birthday it is released within this many days of (haneoka's rule). */
export const BIRTHDAY_WINDOW_DAYS = 45;
const DAY_MS = 86_400_000;

export interface HomeSources {
  banners: RawHomeBanner[];
  gachas: GachaViewModel[];
  rewards: RewardEntrySummary[];
  music: MusicViewModel[];
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  events?: EventViewModel[] | undefined;
  characters?: CharacterViewModel[] | undefined;
  /** Gacha pickups (member card ids) for the birthday gacha; the summaries do not carry them. */
  gachaPickups?: ReadonlyArray<Pick<GachaDetailViewModel, "id" | "pickupMemberIds">> | undefined;
  targets?: HomeBannerTargets | undefined;
}

export function buildHomeData(
  banners: RawHomeBanner[],
  gachas: GachaViewModel[],
  rewards: RewardEntrySummary[],
  music: MusicViewModel[],
  cards: CardViewModel[],
  supportCards: SupportCardViewModel[],
  now = Date.now(),
  extra: Pick<HomeSources, "events" | "characters" | "gachaPickups" | "targets"> = {},
): HomeData {
  const gachaMap = new Map(gachas.map((gacha) => [gacha.id, gacha]));
  const rewardMap = new Map(rewards.map((entry) => [`${entry.kind}:${entry.id}`, entry]));
  const { targets = {} } = extra;

  const slides = banners
    .filter((banner) => !hiddenBannerTypes.has(banner.displayType))
    // Ended banners are dropped at build time; the carousel re-checks the window in the browser.
    .filter((banner) => (parseMasterDate(banner.endAt) ?? Infinity) >= now)
    .sort((a, b) => b.displayOrder - a.displayOrder || a.id - b.id)
    .map((banner): HomeSlide => {
      const kind = bannerKinds[banner.displayType] ?? "event";
      const slide: HomeSlide = { id: banner.id, kind, title: "", imagePath: banner.imageAsset, startAt: banner.startAt, endAt: banner.endAt };
      const rewardKind = rewardKindBySlide[kind];
      if (kind === "gacha") {
        const gacha = gachaMap.get(banner.contentId);
        if (gacha) {
          slide.title = gacha.name;
          slide.link = { routeId: "gacha", detailId: gacha.id };
        }
      } else if (kind === "exchange") {
        const exchange = targets.exchanges?.get(banner.contentId);
        if (exchange) {
          slide.title = exchange.title;
          slide.link = exchange.link;
        } else {
          slide.link = { routeId: "exchange" };
        }
      } else if (kind === "story") {
        // contentId is not the chapter (TW 2026-10: contentId 1 on chapter 6's banner); the artwork names it.
        const chapter = storyChapterOf(banner, targets.chapters ?? []);
        if (chapter) slide.title = chapter.title;
        // The chapter may open after its banner (a teaser), so the list of main chapters rather than an episode.
        slide.link = { routeId: "main-story" };
      } else if (rewardKind) {
        const entry = rewardMap.get(`${rewardKind}:${banner.contentId}`);
        if (entry) {
          slide.title = entry.title;
          slide.link = { routeId: "rewards", detailId: entry.slug };
        }
      }
      return slide;
    });

  return {
    slides,
    // Permanent entries (daily login bonus, beginner missions) are not news.
    rewards: rewards.filter((entry) => parseMasterDate(entry.endAt) !== null).sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestMusic: [...music].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestCards: [...cards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    latestSupportCards: [...supportCards].sort(compareByStartDesc).slice(0, LATEST_LIMIT),
    events: homeEvents(extra.events ?? [], now),
    birthdays: homeBirthdays(extra.characters ?? [], cards, gachas, extra.gachaPickups ?? []),
  };
}

/** The chapter a story banner shows: by its artwork's asset name, else by contentId. */
export function storyChapterOf(banner: RawHomeBanner, chapters: ReadonlyArray<{ id: number; banner: string; title: string }>) {
  const asset = banner.imageAsset.split("/").at(-1) ?? "";
  return chapters.find((chapter) => chapter.banner && chapter.banner === asset) ?? chapters.find((chapter) => chapter.id === banner.contentId) ?? null;
}

/** Events that had not ended at build time (the browser re-checks), ending soonest first. */
export function homeEvents(events: readonly EventViewModel[], now: number): HomeEvent[] {
  return events
    .filter((event) => {
      const start = parseMasterDate(event.startAt);
      const end = parseMasterDate(event.endAt);
      return start !== null && end !== null && end >= now;
    })
    .sort((a, b) => (parseMasterDate(a.startAt)! - parseMasterDate(b.startAt)!) || a.id - b.id)
    .map(({ id, name, startAt, endAt, bannerUrl, logoUrl, backgroundUrl, characters }) => ({ id, name, startAt, endAt, bannerUrl, logoUrl, backgroundUrl, characters }));
}

/** The event the home page features at `now`: the running one ending soonest, else the next to start. */
export function currentHomeEvent(events: readonly HomeEvent[], now: number): HomeEvent | null {
  let running: HomeEvent | null = null;
  let upcoming: HomeEvent | null = null;
  for (const event of events) {
    const start = parseMasterDate(event.startAt);
    const end = parseMasterDate(event.endAt);
    if (start === null || end === null || end < now) continue;
    if (start <= now) {
      if (!running || end < parseMasterDate(running.endAt)!) running = event;
    } else if (!upcoming || start < parseMasterDate(upcoming.startAt)!) {
      upcoming = event;
    }
  }
  return running ?? upcoming;
}

/** Every character with a birthday, with their BD cards and the gacha picking those cards up. */
export function homeBirthdays(
  characters: readonly CharacterViewModel[],
  cards: readonly CardViewModel[],
  gachas: readonly GachaViewModel[],
  pickups: ReadonlyArray<Pick<GachaDetailViewModel, "id" | "pickupMemberIds">>,
): HomeBirthday[] {
  const birthdayCards = cards.filter((card) => card.rarity === BIRTHDAY_RARITY && parseMasterDate(card.startAt) !== null);
  const cardCharacter = new Map(birthdayCards.map((card) => [card.id, card.characterId]));
  const gachaMap = new Map(gachas.map((gacha) => [gacha.id, gacha]));
  const gachasByCharacter = new Map<number, HomeBirthdayGacha[]>();
  for (const pickup of pickups) {
    const gacha = gachaMap.get(pickup.id);
    if (!gacha || parseMasterDate(gacha.startAt) === null) continue;
    const characterIds = new Set(pickup.pickupMemberIds.flatMap((id) => cardCharacter.get(id) ?? []));
    for (const characterId of characterIds) {
      const list = gachasByCharacter.get(characterId) ?? [];
      list.push({ id: gacha.id, name: gacha.name, bannerPath: gacha.bannerPath, startAt: gacha.startAt, endAt: gacha.endAt });
      gachasByCharacter.set(characterId, list);
    }
  }
  return characters
    .filter((character) => character.birthdayMonth >= 1 && character.birthdayMonth <= 12 && character.birthdayDay >= 1)
    .map((character) => ({
      characterId: character.id,
      name: character.name,
      color: character.mainColor,
      bandName: character.bandName,
      month: character.birthdayMonth,
      day: character.birthdayDay,
      cards: birthdayCards
        .filter((card) => card.characterId === character.id)
        .map((card) => ({ id: card.id, title: card.title, assetId: card.assetId, startAt: card.startAt })),
      gachas: gachasByCharacter.get(character.id) ?? [],
    }));
}

/** The BD card released closest to a birthday (`birthday`: the day's start, ms), within the window. */
export function birthdayCardFor(birthday: HomeBirthday, birthdayAt: number): HomeBirthdayCard | null {
  let best: HomeBirthdayCard | null = null;
  let bestDistance = Infinity;
  for (const card of birthday.cards) {
    const start = parseMasterDate(card.startAt);
    if (start === null) continue;
    const distance = Math.abs(start - birthdayAt);
    if (distance <= BIRTHDAY_WINDOW_DAYS * DAY_MS && distance < bestDistance) {
      best = card;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The birthday gacha of a birthday: picking up the character's BD card and starting within the window. Running gacha
 * come before upcoming ones and those before ended ones, then the closest start.
 */
export function birthdayGachaFor(birthday: HomeBirthday, birthdayAt: number, now: number): HomeBirthdayGacha | null {
  const state = (gacha: HomeBirthdayGacha) => {
    const start = parseMasterDate(gacha.startAt) ?? 0;
    const end = parseMasterDate(gacha.endAt);
    return end !== null && end < now ? 2 : start > now ? 1 : 0;
  };
  const candidates = birthday.gachas
    .map((gacha) => ({ gacha, distance: Math.abs((parseMasterDate(gacha.startAt) ?? Infinity) - birthdayAt) }))
    .filter((entry) => entry.distance <= BIRTHDAY_WINDOW_DAYS * DAY_MS)
    .sort((a, b) => state(a.gacha) - state(b.gacha) || a.distance - b.distance || a.gacha.id - b.gacha.id);
  return candidates[0]?.gacha ?? null;
}

/** Birthdays this many days ahead are listed on the home page (today included). */
export const BIRTHDAY_LOOKAHEAD_DAYS = 30;

export interface UpcomingBirthday {
  birthday: HomeBirthday;
  /** The coming birthday's date (YYYY-MM-DD) in the display zone. */
  date: string;
  daysLeft: number;
  /** The instant the birthday begins in the display zone, for matching cards and gacha. */
  at: number;
}

/** Birthdays from today (in `timeZone`) through the next `days` days, soonest first. */
export function upcomingBirthdays(birthdays: readonly HomeBirthday[], now: number, timeZone: string, days = BIRTHDAY_LOOKAHEAD_DAYS): UpcomingBirthday[] {
  const today = calendarDayAt(now, timeZone);
  const last = addCalendarDays(today, days - 1);
  return birthdays
    .flatMap((birthday) => {
      const date = nextYearly(birthday.month, birthday.day, today);
      if (!date || date > last) return [];
      return [{ birthday, date, daysLeft: calendarDaysBetween(today, date), at: zonedDayStart(date, timeZone) }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.birthday.characterId - b.birthday.characterId);
}

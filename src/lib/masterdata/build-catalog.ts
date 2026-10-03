import type { AppLocale } from "@/config/locales";
import {
  getBuildBackgrounds,
  getBuildBandItems,
  getBuildCards,
  getBuildCharacters,
  getBuildComics,
  getBuildDegrees,
  getBuildEvents,
  getBuildExchangeSummaries,
  getBuildGachas,
  getBuildItems,
  getBuildMusic,
  getBuildRewardEntries,
  getBuildStamps,
  getBuildStories,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";
import { memo } from "@/lib/masterdata/build-core";

type Counter = (locale: AppLocale) => Promise<number>;

const length = <T>(load: (locale: AppLocale) => Promise<readonly T[]>): Counter => async (locale) => (await load(locale)).length;
const stories = (category: string): Counter => async (locale) => new Set((await getBuildStories(locale)).filter((story) => story.category === category).map((story) => story.advId)).size;

/**
 * How many entries each collection page lists, merged over the servers (an entity some servers lack counts once).
 * Pages without a countable data source (tools, news, trackers) are absent; a route another feature pack adds can be
 * added here once its build selector exists.
 */
const COUNTERS: Readonly<Record<string, Counter>> = {
  characters: async (locale) => (await getBuildCharacters(locale)).characters.length,
  cards: length(getBuildCards),
  "support-cards": length(getBuildSupportCards),
  stamps: length(getBuildStamps),
  titles: length(getBuildDegrees),
  backgrounds: length(getBuildBackgrounds),
  comics: length(getBuildComics),
  items: length(getBuildItems),
  "band-items": length(getBuildBandItems),
  music: length(getBuildMusic),
  "event-list": length(getBuildEvents),
  rewards: length(getBuildRewardEntries),
  exchange: length(getBuildExchangeSummaries),
  gacha: length(getBuildGachas),
  "main-story": stories("main"),
  "event-story": stories("event"),
  "friendship-story": stories("friendship"),
};

/** Entry counts by route id; a counter whose tables fail to load is left out rather than failing the page. */
export function getBuildCatalogCounts(locale: AppLocale): Promise<Record<string, number>> {
  return memo(`catalog-counts:${locale}`, async () => {
    const counts = await Promise.all(Object.entries(COUNTERS).map(async ([routeId, count]) => {
      try {
        return [routeId, await count(locale)] as const;
      } catch {
        return null;
      }
    }));
    return Object.fromEntries(counts.filter((entry): entry is readonly [string, number] => entry !== null));
  });
}

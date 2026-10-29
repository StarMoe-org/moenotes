import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { serverAssetUrl } from "@/lib/assets/release";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getCardThumbnailUrl, getCharacterThumbnailUrl } from "@/lib/cards/assets";
import { getItemIconUrl } from "@/lib/items/assets";
import { getBandItemIconUrl } from "@/lib/band-items/assets";
import { latestStarted } from "@/lib/schedule";
import { entityServer } from "@/lib/servers/facets";
import { getStoryArtworkUrl } from "@/lib/story/assets";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import { getBuildShops } from "@/lib/masterdata/build-shop";
import { getBuildSkillDictionaries } from "@/lib/masterdata/build-skill-dictionary";
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
  skills: async (locale) => {
    const dicts = await getBuildSkillDictionaries(locale);
    const keys = new Set(Object.values(dicts).flatMap((dict) => (dict?.entries ?? []).map((e) => e.key)));
    return keys.size;
  },
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
  "birthday-story": stories("birthday"),
  "other-story": stories("other"),
  shop: length(getBuildShops),
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

/** A collection page's picture on its group's landing page: art fills the tile, icons and stickers sit whole in it. */
export interface CatalogCover {
  url: string;
  fit: "cover" | "contain";
}

type CoverPicker = (locale: AppLocale, now: number) => Promise<CatalogCover | null>;

/** The entry's file in the catalog of a server that has it. */
function cover(entry: { servers: readonly GameServer[] } | undefined, url: string | undefined, fit: CatalogCover["fit"] = "cover"): CatalogCover | null {
  return entry && url ? { url: serverAssetUrl(url, entityServer(entry, PRIMARY_SERVER)), fit } : null;
}

const newestStory = (category: string): CoverPicker => async (locale, now) => {
  const story = latestStarted((await getBuildStories(locale)).filter((entry) => entry.category === category && getStoryArtworkUrl(entry, locale)), now);
  return cover(story, story && getStoryArtworkUrl(story, locale));
};

const COVERS: Readonly<Record<string, CoverPicker>> = {
  characters: async (locale, now) => {
    // The character of the newest card, so the tile changes with releases.
    const card = latestStarted(await getBuildCards(locale), now);
    return cover(card, card && getCharacterThumbnailUrl(card.characterId));
  },
  cards: async (locale, now) => {
    const card = latestStarted(await getBuildCards(locale), now);
    return cover(card, card && getCardThumbnailUrl(card.assetId));
  },
  "support-cards": async (locale, now) => {
    const card = latestStarted(await getBuildSupportCards(locale), now);
    return cover(card, card && getSupportCardThumbnailUrl(card.assetId));
  },
  skills: async (locale) => {
    const dicts = await getBuildSkillDictionaries(locale);
    const server = (Object.keys(dicts)[0] as GameServer | undefined) ?? PRIMARY_SERVER;
    const entry = dicts[server]?.entries.find((e) => Boolean(e.iconUrl));
    return entry?.iconUrl ? { url: serverAssetUrl(entry.iconUrl, server), fit: "contain" } : null;
  },
  stamps: async (locale, now) => {
    const stamp = latestStarted(await getBuildStamps(locale), now);
    return cover(stamp, stamp?.imageUrl, "contain");
  },
  titles: async (locale, now) => {
    const title = latestStarted(await getBuildDegrees(locale), now);
    return cover(title, title?.imageUrl, "contain");
  },
  backgrounds: async (locale, now) => {
    const background = latestStarted(await getBuildBackgrounds(locale), now);
    return cover(background, background?.thumbnailUrl);
  },
  comics: async (locale, now) => {
    const comic = latestStarted(await getBuildComics(locale), now);
    return cover(comic, comic?.imageUrl);
  },
  "band-items": async (locale, now) => {
    const item = latestStarted(await getBuildBandItems(locale), now);
    return cover(item, item && getBandItemIconUrl(item, locale), "contain");
  },
  items: async (locale) => {
    // Star gems, the currency every player knows.
    const item = (await getBuildItems(locale)).find((entry) => entry.id === 1);
    return cover(item, item && getItemIconUrl(item.imagePath, locale), "contain");
  },
  music: async (locale, now) => {
    const song = latestStarted(await getBuildMusic(locale), now);
    return cover(song, song?.jacketUrl);
  },
  "event-list": async (locale, now) => {
    const event = latestStarted(await getBuildEvents(locale), now);
    return cover(event, event && (event.bannerUrl || event.backgroundUrl));
  },
  rewards: async (locale, now) => {
    const entry = latestStarted((await getBuildRewardEntries(locale)).filter((reward) => reward.bannerUrl), now);
    return cover(entry, entry?.bannerUrl);
  },
  exchange: async (locale, now) => {
    const exchange = latestStarted((await getBuildExchangeSummaries(locale)).filter((entry) => entry.bannerUrl), now);
    return cover(exchange, exchange?.bannerUrl);
  },
  shop: async (locale, now) => {
    const pack = latestStarted((await getBuildShops(locale)).filter((entry) => entry.thumbnailUrl), now);
    return cover(pack, pack?.thumbnailUrl);
  },
  gacha: async (locale, now) => {
    const gacha = latestStarted((await getBuildGachas(locale)).filter((entry) => entry.bannerPath), now);
    return cover(gacha, gacha && getImageAssetUrl(gacha.bannerPath, locale));
  },
  "main-story": newestStory("main"),
  "event-story": newestStory("event"),
  "friendship-story": newestStory("friendship"),
  "birthday-story": newestStory("birthday"),
  "other-story": newestStory("other"),
};

/** Covers by route id for the group landing pages; a picker whose tables fail to load is left out. */
export function getBuildCatalogCovers(locale: AppLocale): Promise<Record<string, CatalogCover>> {
  return memo(`catalog-covers:${locale}`, async () => {
    const now = Date.now();
    const covers = await Promise.all(Object.entries(COVERS).map(async ([routeId, pick]) => {
      try {
        const found = await pick(locale, now);
        return found ? ([routeId, found] as const) : null;
      } catch {
        return null;
      }
    }));
    return Object.fromEntries(covers.filter((entry): entry is readonly [string, CatalogCover] => entry !== null));
  });
}

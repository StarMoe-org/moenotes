import type { AppLocale } from "@/config/locales";
import { GAME_SERVER_PROFILES, PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { serverReleaseFetcher } from "@/lib/assets/release";
import { buildFetch } from "@/lib/build/fetch";
import { getBuildMasterData, getBuildTableKey } from "@/lib/masterdata/build-snapshot";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { mergeServerLists, mergeServerValues, type ServerFaceted, type ServerFacetedValue } from "@/lib/servers/facets";
import {
  normalizeCards,
  validateMasterTable,
  type CardViewModel,
  type MasterTable,
  type RawBand,
  type RawCharacter,
  type RawMemberCard,
  type RawText,
} from "@/lib/cards/data";
import {
  normalizeSkill,
  type RawSkillCondition,
  type RawSkillConditionSet,
  type RawSkillCumulativeCondition,
  type RawSkillDefinition,
  type RawSkillEffect,
  type RawSkillIcon,
  type RawSkillTarget,
  type SkillViewModel,
} from "@/lib/cards/skills";
import {
  buildMemberCardGrowth,
  type MemberCardGrowth,
  type RawCardLevel,
  type RawMemberCardAwake,
  type RawMemberCardLevelLimit,
  type RawMemberCardRank,
} from "@/lib/cards/growth";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import { buildSupportCardGrowth, type RawSupportCardRank, type SupportCardGrowth } from "@/lib/support-cards/growth";
import { normalizeCharacters, type CharacterViewModel, type RawCharacter as RawCharacterDetail } from "@/lib/characters/data";
import { normalizeSupportCards, type RawSupportCard, type SupportCardViewModel } from "@/lib/support-cards/data";
import { normalizeSupportSkill, type RawSupportSkillEffect } from "@/lib/support-cards/skills";
import {
  normalizeMusic,
  type MusicViewModel,
  type RawBand as RawMusicBand,
  type RawCharacter as RawMusicCharacter,
  type RawMusic,
  type RawMusicScore,
} from "@/lib/music/data";
import { normalizeItems, type ItemViewModel, type RawItem } from "@/lib/items/data";
import { normalizeStamps, type RawStamp, type StampViewModel } from "@/lib/stamps/data";
import { normalizeComics, type ComicViewModel, type RawComic } from "@/lib/comics/data";
import { MASTER_TEXT_FIELDS, isUsableMasterText, localizeMasterText, masterTextFieldOrder } from "@/lib/masterdata/localize-text";
import {
  normalizeStories,
  storyNeighbors,
  type RawAdv,
  type RawAdvChat,
  type RawAnimeStillSubtitle,
  type RawCharacterFriendship,
  type RawHomeSpot,
  type RawStoryChapter,
  type RawStoryCharacter,
  type RawStoryEpisode,
  type RawStoryFriendshipEpisode,
  type RawStoryHomeSpotTapTalkEpisode,
  type RawStoryLiveResultEpisode,
  type StoryNeighbor,
  type StoryViewModel,
} from "@/lib/story/data";
import { fetchAndParseStory, type ParsedStoryScript, type StoryScriptLookups } from "@/lib/story/parser";
import { plainRichText } from "@/lib/story/rich-text";
import { MASTER_UTC_OFFSET, isUntaggedMasterDate } from "@/lib/schedule";
import {
  normalizeGachas,
  toGachaSummary,
  type GachaDetailViewModel,
  type GachaViewModel,
  type RawGacha,
  type RawGachaLot,
  type RawGachaPrize,
  type RawGachaProduct,
  type RawGachaView,
} from "@/lib/gacha/data";
import { buildHomeData, type HomeData, type RawHomeBanner } from "@/lib/home/data";
import { normalizeDegrees, type DegreeViewModel, type RawDegree } from "@/lib/degrees/data";
import { normalizeBackgrounds, type BackgroundViewModel, type RawBackground } from "@/lib/backgrounds/data";
import { createRewardResolver, type RawHomeSpot as RawRewardHomeSpot, type RewardResolver } from "@/lib/rewards/resources";
import {
  normalizeRewardEntries,
  toRewardEntrySummary,
  type RawLimitedMission,
  type RawLimitedMissionGroup,
  type RawLoginBonus,
  type RawLoginBonusSlot,
  type RawRewardRow,
  type RawSeasonPass,
  type RawSeasonPassLevel,
  type RawSeasonPassLevelReward,
  type RawSeasonPassMission,
  type RewardEntryDetail,
  type RewardEntrySummary,
} from "@/lib/rewards/data";
import {
  normalizeEvents,
  toEventSummary,
  type EventDetailViewModel,
  type EventViewModel,
  type RawEvent,
  type RawEventAchievementLoopReward,
  type RawEventAchievementReward,
  type RawEventEffect,
  type RawEventPickUpCard,
  type RawLiveEventPoint,
  type RawLiveEventReward,
} from "@/lib/events/data";

/*
 * Build-time view models of the merged catalog (docs/servers.md). Every `…On(server, locale)` selector computes one
 * server's view from its own MasterData; the exported `getBuild…` selectors merge the build's servers by id, so an
 * entity carries the servers that have it and what differs between them (ServerFaceted). A merged entity is a
 * superset of the plain view model, so pages that do not tell servers apart keep working with the base fields.
 */

interface BuildDataState {
  tables: Map<string, Promise<MasterTable<unknown>>>;
  selectors: Map<string, Promise<unknown>>;
}

export interface CharacterBandModel {
  id: number;
  name: string;
  description: string;
  color: string;
}

export interface CardDetailData {
  card: CardViewModel | null;
  skills: SkillViewModel[];
  growth: MemberCardGrowth;
}

export interface SupportCardDetailData {
  card: SupportCardViewModel | null;
  skills: SkillViewModel[];
  growth: SupportCardGrowth;
}

export interface CharacterDetailData {
  character: CharacterViewModel | null;
  cards: CardViewModel[];
}

export interface StoryDetailData {
  title: string;
  script: ParsedStoryScript | null;
  characters: RawStoryCharacter[];
  texts: RawText[];
  /** The story list entry (episode numbering, chapter, artwork); null for an ADV no story list refers to. */
  story: ServerFaceted<StoryViewModel> | null;
  previous: StoryNeighbor | null;
  next: StoryNeighbor | null;
  /** Servers whose MasterData has the ADV. */
  servers: GameServer[];
  /** The server the script was read from (and whose files it plays): the first of `servers`. */
  server: GameServer;
}

export interface StoryReaderLookup {
  characters: RawStoryCharacter[];
  texts: RawText[];
}

// Versioned: a dev server keeps this state across reloads, and the merged selectors reuse the earlier keys.
const buildDataKey = Symbol.for("moenotes.masterdata.build-data.v2");
const globalState = globalThis as typeof globalThis & { [buildDataKey]?: BuildDataState };
const state = globalState[buildDataKey] ??= { tables: new Map(), selectors: new Map() };

/**
 * A server's table, shared with every server serving the same bytes in the same time zone. Timestamps of a server
 * whose MasterData is not timed in UTC+8 get its offset appended, so parseMasterDate reads them right everywhere.
 */
async function table<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  const offset = GAME_SERVER_PROFILES[server].masterdataUtcOffset;
  const tagged = offset !== MASTER_UTC_OFFSET && path !== "MasterText.json";
  const key = `${await getBuildTableKey(server, path)}${tagged ? `@${offset}` : ""}`;
  let request = state.tables.get(key);
  if (!request) {
    request = getBuildMasterData(path, validateMasterTable<unknown>, server).then((loaded) => tagged ? tagMasterDates(loaded, offset) : loaded);
    state.tables.set(key, request);
  }
  return request as Promise<MasterTable<T>>;
}

function tagMasterDates(loaded: MasterTable<unknown>, offset: string): MasterTable<unknown> {
  return {
    _allData: loaded._allData.map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return row;
      return Object.fromEntries(Object.entries(row).map(([field, value]) => [field, typeof value === "string" && isUntaggedMasterDate(value) ? `${value.trim()}${offset}` : value]));
    }),
  };
}

function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let request = state.selectors.get(key);
  if (!request) {
    request = load();
    state.selectors.set(key, request);
  }
  return request as Promise<T>;
}

async function eachServer<T>(load: (server: GameServer) => Promise<T>): Promise<Array<readonly [GameServer, T]>> {
  const servers = await getBuildServers();
  return Promise.all(servers.map(async (server) => [server, await load(server)] as const));
}

function mergedList<T>(key: string, load: (server: GameServer) => Promise<T[]>, idOf: (item: T) => string | number): Promise<ServerFaceted<T>[]> {
  return memo(key, async () => mergeServerLists(await eachServer(load), idOf));
}

function mergedValue<T>(key: string, load: (server: GameServer) => Promise<T | null>): Promise<ServerFacetedValue<T> | null> {
  return memo(key, async () => mergeServerValues(await eachServer(load)));
}

/**
 * A server's MasterText, with each cell it leaves without copy taken from the other servers' row of the same id (the
 * JP tables carry Japanese only, the international ones miss some Japanese), and CRLF line ends as LF. The servers'
 * views of the entities they share therefore agree, and JP-only entities read in Japanese.
 */
function texts(server: GameServer): Promise<MasterTable<RawText>> {
  return memo(`texts:${server}`, async () => {
    const servers = await getBuildServers();
    const [own, ...donors] = await Promise.all([server, ...servers.filter((other) => other !== server)].map((source) => table<RawText>("MasterText.json", source)));
    const donorRows = donors.map((donor) => new Map(donor._allData.map((row) => [row.id, row])));
    return {
      _allData: own!._allData.map((row) => {
        const filled = { ...row };
        for (const field of MASTER_TEXT_FIELDS) {
          let value = filled[field];
          if (!isUsableMasterText(value, row.id)) {
            for (const rows of donorRows) {
              const candidate = rows.get(row.id)?.[field];
              if (isUsableMasterText(candidate, row.id)) {
                value = candidate;
                break;
              }
            }
          }
          if (typeof value === "string") filled[field] = value.replace(/\r\n?/g, "\n");
        }
        return filled;
      }),
    };
  });
}

function cardsOn(server: GameServer, locale: AppLocale): Promise<CardViewModel[]> {
  return memo(`cards:${server}:${locale}`, async () => {
    const [cards, characters, bands, textTable] = await Promise.all([
      table<RawMemberCard>("MasterMemberCard.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
      texts(server),
    ]);
    return normalizeCards(cards._allData, characters._allData, bands._allData, textTable._allData, locale);
  });
}

export function getBuildCards(locale: AppLocale): Promise<ServerFaceted<CardViewModel>[]> {
  return mergedList(`cards:${locale}`, (server) => cardsOn(server, locale), (card) => card.id);
}

function supportCardsOn(server: GameServer, locale: AppLocale): Promise<SupportCardViewModel[]> {
  return memo(`support-cards:${server}:${locale}`, async () => {
    const [cards, characters, bands, textTable] = await Promise.all([
      table<RawSupportCard>("MasterSupportCard.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
      texts(server),
    ]);
    return normalizeSupportCards(cards._allData, characters._allData, bands._allData, textTable._allData, locale);
  });
}

export function getBuildSupportCards(locale: AppLocale): Promise<ServerFaceted<SupportCardViewModel>[]> {
  return mergedList(`support-cards:${locale}`, (server) => supportCardsOn(server, locale), (card) => card.id);
}

function charactersOn(server: GameServer, locale: AppLocale): Promise<{ characters: CharacterViewModel[]; bands: CharacterBandModel[] }> {
  return memo(`characters:${server}:${locale}`, async () => {
    const [characters, bands, textTable] = await Promise.all([
      table<RawCharacterDetail>("MasterCharacter.json", server),
      table<RawBand & { descriptionTextID?: string; descriptionTextId?: string }>("MasterBand.json", server),
      texts(server),
    ]);
    const normalized = normalizeCharacters(characters._allData, bands._allData, textTable._allData, locale)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
    const resolvedBands = bands._allData.map((band) => ({
      id: band.id,
      name: localizeMasterText(textMap.get(band.nameTextID), locale) || band.nameTextID,
      description: localizeMasterText(textMap.get(band.descriptionTextID || band.descriptionTextId || ""), locale),
      color: band.mainColorCode?.trim() || "var(--mn-accent)",
    }));
    return { characters: normalized, bands: resolvedBands };
  });
}

export function getBuildCharacters(locale: AppLocale): Promise<{ characters: ServerFaceted<CharacterViewModel>[]; bands: ServerFaceted<CharacterBandModel>[] }> {
  return memo(`characters:${locale}`, async () => {
    const perServer = await eachServer((server) => charactersOn(server, locale));
    return {
      characters: mergeServerLists(perServer.map(([server, data]) => [server, data.characters] as const), (character) => character.id),
      bands: mergeServerLists(perServer.map(([server, data]) => [server, data.bands] as const), (band) => band.id),
    };
  });
}

function musicOn(server: GameServer, locale: AppLocale): Promise<MusicViewModel[]> {
  return memo(`music:${server}:${locale}`, async () => {
    const [music, scores, characters, bands, textTable, sounds, cueSheets] = await Promise.all([
      table<RawMusic>("MasterLiveMusic.json", server),
      table<RawMusicScore>("MasterLiveMusicScore.json", server),
      table<RawMusicCharacter>("MasterCharacter.json", server),
      table<RawMusicBand>("MasterBand.json", server),
      texts(server),
      table<{ id: number; cueName: string; soundCueSheetID: number }>("MasterSound.json", server),
      table<{ id: number; cueSheetName: string }>("MasterSoundCueSheet.json", server),
    ]);
    const sheetNames = new Map(cueSheets._allData.map((sheet) => [sheet.id, sheet.cueSheetName]));
    const soundCues = sounds._allData.map((sound) => ({ id: sound.id, cueName: sound.cueName, cueSheetName: sheetNames.get(sound.soundCueSheetID) ?? "" }));
    return normalizeMusic(music._allData, scores._allData, characters._allData, bands._allData, textTable._allData, locale, soundCues);
  });
}

export function getBuildMusic(locale: AppLocale): Promise<ServerFaceted<MusicViewModel>[]> {
  return mergedList(`music:${locale}`, (server) => musicOn(server, locale), (song) => song.id);
}

function itemsOn(server: GameServer, locale: AppLocale): Promise<ItemViewModel[]> {
  return memo(`items:${server}:${locale}`, async () => {
    const [items, textTable] = await Promise.all([
      table<RawItem>("MasterItem.json", server),
      texts(server),
    ]);
    return normalizeItems(items._allData, textTable._allData, locale);
  });
}

export function getBuildItems(locale: AppLocale): Promise<ServerFaceted<ItemViewModel>[]> {
  return mergedList(`items:${locale}`, (server) => itemsOn(server, locale), (item) => item.id);
}

function gachaDetailsOn(server: GameServer, locale: AppLocale): Promise<GachaDetailViewModel[]> {
  return memo(`gacha-details:${server}:${locale}`, async () => {
    const [gachas, lots, prizes, views, products, cards, supportCards, items, textTable] = await Promise.all([
      table<RawGacha>("MasterGacha.json", server),
      table<RawGachaLot>("MasterGachaLot.json", server),
      table<RawGachaPrize>("MasterGachaPrize.json", server),
      table<RawGachaView>("MasterGachaView.json", server),
      table<RawGachaProduct>("MasterGachaProduct.json", server),
      cardsOn(server, locale),
      supportCardsOn(server, locale),
      itemsOn(server, locale),
      texts(server),
    ]);
    return normalizeGachas(gachas._allData, lots._allData, prizes._allData, views._allData, products._allData, cards, supportCards, items, textTable._allData, locale);
  });
}

function gachasOn(server: GameServer, locale: AppLocale): Promise<GachaViewModel[]> {
  return memo(`gachas:${server}:${locale}`, async () => (await gachaDetailsOn(server, locale)).map(toGachaSummary));
}

export function getBuildGachas(locale: AppLocale): Promise<ServerFaceted<GachaViewModel>[]> {
  return mergedList(`gachas:${locale}`, (server) => gachasOn(server, locale), (gacha) => gacha.id);
}

export function getBuildGachaDetail(locale: AppLocale, gachaId: number): Promise<ServerFacetedValue<GachaDetailViewModel> | null> {
  return mergedValue(`gacha-detail:${locale}:${gachaId}`, async (server) => (await gachaDetailsOn(server, locale)).find((gacha) => gacha.id === gachaId) ?? null);
}

function homeOn(server: GameServer, locale: AppLocale): Promise<HomeData> {
  return memo(`home:${server}:${locale}`, async () => {
    const [banners, gachas, rewards, music, cards, supportCards] = await Promise.all([
      table<RawHomeBanner>("MasterHomeBanner.json", server),
      gachasOn(server, locale),
      rewardEntriesOn(server, locale),
      musicOn(server, locale),
      cardsOn(server, locale),
      supportCardsOn(server, locale),
    ]);
    return buildHomeData(banners._allData, gachas, rewards, music, cards, supportCards);
  });
}

/** Every build server has a home page; the primary server's supplies the base. */
export async function getBuildHomeData(locale: AppLocale): Promise<ServerFacetedValue<HomeData>> {
  return (await mergedValue(`home:${locale}`, (server) => homeOn(server, locale)))!;
}

function degreesOn(server: GameServer, locale: AppLocale): Promise<DegreeViewModel[]> {
  return memo(`degrees:${server}:${locale}`, async () => {
    const [degrees, characters, textTable] = await Promise.all([
      table<RawDegree>("MasterDegree.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      texts(server),
    ]);
    return normalizeDegrees(degrees._allData, characters._allData, textTable._allData, locale);
  });
}

export function getBuildDegrees(locale: AppLocale): Promise<ServerFaceted<DegreeViewModel>[]> {
  return mergedList(`degrees:${locale}`, (server) => degreesOn(server, locale), (degree) => degree.id);
}

function backgroundsOn(server: GameServer, locale: AppLocale): Promise<BackgroundViewModel[]> {
  return memo(`backgrounds:${server}:${locale}`, async () => {
    const [backgrounds, textTable] = await Promise.all([
      table<RawBackground>("MasterBackground.json", server),
      texts(server),
    ]);
    return normalizeBackgrounds(backgrounds._allData, textTable._allData, locale);
  });
}

export function getBuildBackgrounds(locale: AppLocale): Promise<ServerFaceted<BackgroundViewModel>[]> {
  return mergedList(`backgrounds:${locale}`, (server) => backgroundsOn(server, locale), (background) => background.id);
}

/** Names and artwork of the resources a server's rewards hand out (MasterData resourceType / resourceId). */
function rewardResolverOn(server: GameServer, locale: AppLocale): Promise<RewardResolver> {
  return memo(`reward-resolver:${server}:${locale}`, async () => {
    const [items, cards, supportCards, music, stamps, degrees, spots, textTable] = await Promise.all([
      itemsOn(server, locale),
      cardsOn(server, locale),
      supportCardsOn(server, locale),
      musicOn(server, locale),
      stampsOn(server, locale),
      degreesOn(server, locale),
      table<RawRewardHomeSpot>("MasterHomeSpot.json", server),
      texts(server),
    ]);
    return createRewardResolver({ items, cards, supportCards, music, stamps, degrees, spots: spots._allData, texts: textTable._allData }, locale);
  });
}

function rewardEntryDetailsOn(server: GameServer, locale: AppLocale): Promise<RewardEntryDetail[]> {
  return memo(`reward-entries:${server}:${locale}`, async () => {
    const [
      resolve, music, textTable,
      seasonPasses, seasonPassLevels, seasonPassLevelRewards, seasonPassRewards, seasonPassMissions,
      missionGroups, missions, missionRewards, loginBonuses, loginBonusSlots,
      exchanges, chapters, episodes, advs, bands, characters,
    ] = await Promise.all([
      rewardResolverOn(server, locale),
      musicOn(server, locale),
      texts(server),
      table<RawSeasonPass>("MasterSeasonPass.json", server),
      table<RawSeasonPassLevel>("MasterSeasonPassLevel.json", server),
      table<RawSeasonPassLevelReward>("MasterSeasonPassLevelReward.json", server),
      table<RawRewardRow>("MasterSeasonPassReward.json", server),
      table<RawSeasonPassMission>("MasterSeasonPassMission.json", server),
      table<RawLimitedMissionGroup>("MasterLimitedMissionGroup.json", server),
      table<RawLimitedMission>("MasterLimitedMission.json", server),
      table<RawRewardRow>("MasterMissionReward.json", server),
      table<RawLoginBonus>("MasterLoginBonus.json", server),
      table<RawLoginBonusSlot>("MasterLoginBonusSlot.json", server),
      table<{ id: number; nameTextId: string }>("MasterExchange.json", server),
      table<{ id: number; nameTextId: string }>("MasterStoryChapter.json", server),
      table<{ id: number; episodeNumber: number; advId: number }>("MasterStoryEpisode.json", server),
      table<{ id: number; titleTextId: string }>("MasterAdv.json", server),
      table<RawBand>("MasterBand.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
    ]);
    return normalizeRewardEntries({
      seasonPasses: seasonPasses._allData,
      seasonPassLevels: seasonPassLevels._allData,
      seasonPassLevelRewards: seasonPassLevelRewards._allData,
      seasonPassRewards: seasonPassRewards._allData,
      seasonPassMissions: seasonPassMissions._allData,
      missionGroups: missionGroups._allData,
      missions: missions._allData,
      missionRewards: missionRewards._allData,
      loginBonuses: loginBonuses._allData,
      loginBonusSlots: loginBonusSlots._allData,
      exchanges: exchanges._allData,
      chapters: chapters._allData,
      episodes: episodes._allData,
      advs: advs._allData,
      bands: bands._allData,
      characters: characters._allData,
      music: music.map((song) => ({ id: song.id, title: song.title })),
      texts: textTable._allData,
    }, resolve, locale);
  });
}

function rewardEntriesOn(server: GameServer, locale: AppLocale): Promise<RewardEntrySummary[]> {
  return memo(`reward-summaries:${server}:${locale}`, async () => (await rewardEntryDetailsOn(server, locale)).map(toRewardEntrySummary));
}

export function getBuildRewardEntries(locale: AppLocale): Promise<ServerFaceted<RewardEntrySummary>[]> {
  return mergedList(`reward-summaries:${locale}`, (server) => rewardEntriesOn(server, locale), (entry) => entry.slug);
}

export function getBuildRewardEntryDetail(locale: AppLocale, slug: string): Promise<ServerFacetedValue<RewardEntryDetail> | null> {
  return mergedValue(`reward-entry:${locale}:${slug}`, async (server) => (await rewardEntryDetailsOn(server, locale)).find((entry) => entry.slug === slug) ?? null);
}

function eventDetailsOn(server: GameServer, locale: AppLocale): Promise<EventDetailViewModel[]> {
  return memo(`event-details:${server}:${locale}`, async () => {
    const [
      events, effects, pickUpCards, achievementRewards, loopRewards, livePoints, liveRewards, challengePoints, challengeRewards, rewards,
      characters, bands, textTable, resolve, cards, supportCards, music, stories,
    ] = await Promise.all([
      table<RawEvent>("MasterEvent.json", server),
      table<RawEventEffect>("MasterEventEffect.json", server),
      table<RawEventPickUpCard>("MasterEventPickUpCard.json", server),
      table<RawEventAchievementReward>("MasterEventAchievementReward.json", server),
      table<RawEventAchievementLoopReward>("MasterEventAchievementLoopReward.json", server),
      table<RawLiveEventPoint>("MasterLiveEventPoint.json", server),
      table<RawLiveEventReward>("MasterLiveEventReward.json", server),
      table<RawLiveEventPoint>("MasterChallengeLiveEventPoint.json", server),
      table<RawLiveEventReward>("MasterChallengeLiveEventReward.json", server),
      table<RawRewardRow>("MasterReward.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
      texts(server),
      rewardResolverOn(server, locale),
      cardsOn(server, locale),
      supportCardsOn(server, locale),
      musicOn(server, locale),
      storiesOn(server, locale),
    ]);
    return normalizeEvents({
      events: events._allData,
      effects: effects._allData,
      pickUpCards: pickUpCards._allData,
      achievementRewards: achievementRewards._allData,
      loopRewards: loopRewards._allData,
      livePoints: livePoints._allData,
      liveRewards: liveRewards._allData,
      challengePoints: challengePoints._allData,
      challengeRewards: challengeRewards._allData,
      rewards: rewards._allData,
      characters: characters._allData,
      bands: bands._allData,
      texts: textTable._allData,
    }, { cards, supportCards, music, stories }, resolve, locale);
  });
}

function eventsOn(server: GameServer, locale: AppLocale): Promise<EventViewModel[]> {
  return memo(`events:${server}:${locale}`, async () => (await eventDetailsOn(server, locale)).map(toEventSummary));
}

export function getBuildEvents(locale: AppLocale): Promise<ServerFaceted<EventViewModel>[]> {
  return mergedList(`events:${locale}`, (server) => eventsOn(server, locale), (event) => event.id);
}

export function getBuildEventDetail(locale: AppLocale, eventId: number): Promise<ServerFacetedValue<EventDetailViewModel> | null> {
  return mergedValue(`event-detail:${locale}:${eventId}`, async (server) => (await eventDetailsOn(server, locale)).find((event) => event.id === eventId) ?? null);
}

function stampsOn(server: GameServer, locale: AppLocale): Promise<StampViewModel[]> {
  return memo(`stamps:${server}:${locale}`, async () => {
    const [stamps, characters, textTable] = await Promise.all([
      table<RawStamp>("MasterStamp.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      texts(server),
    ]);
    return normalizeStamps(stamps._allData, characters._allData, textTable._allData, locale);
  });
}

export function getBuildStamps(locale: AppLocale): Promise<ServerFaceted<StampViewModel>[]> {
  return mergedList(`stamps:${locale}`, (server) => stampsOn(server, locale), (stamp) => stamp.id);
}

function comicsOn(server: GameServer, locale: AppLocale): Promise<ComicViewModel[]> {
  return memo(`comics:${server}:${locale}`, async () => {
    const [comics, characters, textTable] = await Promise.all([
      table<RawComic>("MasterLoadingComics.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      texts(server),
    ]);
    return normalizeComics(comics._allData, characters._allData, textTable._allData, locale);
  });
}

export function getBuildComics(locale: AppLocale): Promise<ServerFaceted<ComicViewModel>[]> {
  return mergedList(`comics:${locale}`, (server) => comicsOn(server, locale), (comic) => comic.id);
}

/** Band names of every server (the base name where they differ). */
export function getBuildBandNames(locale: AppLocale): Promise<Array<[number, string]>> {
  return memo(`band-names:${locale}`, async () => {
    const perServer = await eachServer(async (server) => {
      const [bands, textTable] = await Promise.all([
        table<RawBand>("MasterBand.json", server),
        texts(server),
      ]);
      const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
      return bands._allData.map((band) => ({ id: band.id, name: localizeMasterText(textMap.get(band.nameTextID), locale) || `Band ${band.id}` }));
    });
    return mergeServerLists(perServer, (band) => band.id).map((band): [number, string] => [band.id, band.name]);
  });
}

function storiesOn(server: GameServer, locale: AppLocale): Promise<StoryViewModel[]> {
  return memo(`stories:${server}:${locale}`, async () => {
    const [chapters, episodes, friendshipEpisodes, homeTapEpisodes, liveResultEpisodes, advs, homeSpots, friendships, characters, bands, textTable, events] = await Promise.all([
      table<RawStoryChapter>("MasterStoryChapter.json", server),
      table<RawStoryEpisode>("MasterStoryEpisode.json", server),
      table<RawStoryFriendshipEpisode>("MasterStoryFriendshipEpisode.json", server),
      table<RawStoryHomeSpotTapTalkEpisode>("MasterStoryHomeSpotTapTalkEpisode.json", server),
      table<RawStoryLiveResultEpisode>("MasterStoryLiveResultEpisode.json", server),
      table<RawAdv>("MasterAdv.json", server),
      table<RawHomeSpot>("MasterHomeSpot.json", server),
      table<RawCharacterFriendship>("MasterCharacterFriendship.json", server),
      table<RawStoryCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
      texts(server),
      table<RawEvent>("MasterEvent.json", server),
    ]);
    return normalizeStories({
      eventChapters: events._allData.map((event) => ({ chapterId: event.storyChapterId, eventId: event.id })).filter((entry) => entry.chapterId > 0),
      chapters: chapters._allData,
      episodes: episodes._allData,
      friendshipEpisodes: friendshipEpisodes._allData,
      homeTapEpisodes: homeTapEpisodes._allData,
      liveResultEpisodes: liveResultEpisodes._allData,
      advs: advs._allData,
      homeSpots: homeSpots._allData,
      friendships: friendships._allData,
      characters: characters._allData,
      bands: bands._allData,
      texts: textTable._allData,
    }, locale);
  });
}

export function getBuildStories(locale: AppLocale): Promise<ServerFaceted<StoryViewModel>[]> {
  return mergedList(`stories:${locale}`, (server) => storiesOn(server, locale), (story) => story.id);
}

/** Character names for the story readers; every server has the same characters. */
export function getBuildStoryReaderLookup(): Promise<StoryReaderLookup> {
  return memo("story-reader-lookup", async () => {
    const [characters, textTable] = await Promise.all([
      table<RawStoryCharacter>("MasterCharacter.json", PRIMARY_SERVER),
      texts(PRIMARY_SERVER),
    ]);
    const characterTextIds = new Set(characters._allData.flatMap((entry) => [entry.nameTextID, entry.shortNameTextID]));
    return {
      characters: characters._allData,
      texts: textTable._allData.filter((entry) => characterTextIds.has(entry.id)),
    };
  });
}

const EMPTY_CARD_DETAIL: CardDetailData = { card: null, skills: [], growth: { levelCurve: [], awakeSteps: [], rankSteps: [] } };

function cardDetailOn(server: GameServer, locale: AppLocale, cardId: number): Promise<CardDetailData | null> {
  return memo(`card-detail:${server}:${locale}:${cardId}`, async () => {
    const [
      cards,
      rawCards,
      levels,
      levelLimits,
      awakes,
      ranks,
      liveSkills,
      liveEffects,
      leaderSkills,
      leaderEffects,
      gekisouSkills,
      gekisouEffects,
      icons,
      conditionSets,
      conditions,
      cumulativeConditions,
      targets,
      characters,
      bands,
      textTable,
    ] = await Promise.all([
      cardsOn(server, locale),
      table<RawMemberCard>("MasterMemberCard.json", server),
      table<RawCardLevel>("MasterMemberCardLevel.json", server),
      table<RawMemberCardLevelLimit>("MasterMemberCardLevelLimit.json", server),
      table<RawMemberCardAwake>("MasterMemberCardAwake.json", server),
      table<RawMemberCardRank>("MasterMemberCardRank.json", server),
      table<RawSkillDefinition>("MasterLiveSkill.json", server),
      table<RawSkillEffect>("MasterLiveSkillEffect.json", server),
      table<RawSkillDefinition>("MasterLeaderSkill.json", server),
      table<RawSkillEffect>("MasterLeaderSkillEffect.json", server),
      table<RawSkillDefinition>("MasterGekisouSkill.json", server),
      table<RawSkillEffect>("MasterGekisouSkillEffect.json", server),
      table<RawSkillIcon>("MasterSkillIcon.json", server),
      table<RawSkillConditionSet>("MasterSkillConditionSet.json", server),
      table<RawSkillCondition>("MasterSkillCondition.json", server),
      table<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition.json", server),
      table<RawSkillTarget>("MasterSkillTarget.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
      texts(server),
    ]);
    const card = cards.find((entry) => entry.id === cardId) ?? null;
    const rawCard = rawCards._allData.find((entry) => entry.id === cardId);
    if (!card || !rawCard) return null;
    const growth = buildMemberCardGrowth(rawCard, levels._allData, levelLimits._allData, awakes._allData, ranks._allData);
    const characterMap = new Map(characters._allData.map((entry) => [entry.id, entry]));
    const bandMap = new Map(bands._allData.map((entry) => [entry.id, entry]));
    const skills = [
      normalizeSkill("leader", card.leaderSkillId, leaderSkills._allData, leaderEffects._allData, icons._allData, textTable._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, targets._allData, characterMap, bandMap),
      normalizeSkill("live", card.liveSkillId, liveSkills._allData, liveEffects._allData, icons._allData, textTable._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, targets._allData, characterMap, bandMap),
      normalizeSkill("gekisou", card.gekisouSkillId, gekisouSkills._allData, gekisouEffects._allData, icons._allData, textTable._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, targets._allData, characterMap, bandMap),
    ].filter((entry): entry is SkillViewModel => entry !== null);
    return { card, skills, growth };
  });
}

/** The card as every server has it; `servers` is empty when none has it. */
export async function getBuildCardDetail(locale: AppLocale, cardId: number): Promise<ServerFacetedValue<CardDetailData>> {
  return await mergedValue(`card-detail:${locale}:${cardId}`, (server) => cardDetailOn(server, locale, cardId)) ?? { value: EMPTY_CARD_DETAIL, servers: [] };
}

const EMPTY_SUPPORT_CARD_DETAIL: SupportCardDetailData = { card: null, skills: [], growth: { levelCurve: [], rankSteps: [] } };

function supportCardDetailOn(server: GameServer, locale: AppLocale, cardId: number): Promise<SupportCardDetailData | null> {
  return memo(`support-card-detail:${server}:${locale}:${cardId}`, async () => {
    const [
      cards,
      rawCards,
      levels,
      ranks,
      supportSkills,
      supportEffects,
      gekisouSkills,
      gekisouEffects,
      icons,
      conditionSets,
      conditions,
      cumulativeConditions,
      targets,
      textTable,
      characters,
      bands,
    ] = await Promise.all([
      supportCardsOn(server, locale),
      table<RawSupportCard>("MasterSupportCard.json", server),
      table<RawCardLevel>("MasterSupportCardLevel.json", server),
      table<RawSupportCardRank>("MasterSupportCardRank.json", server),
      table<RawSkillDefinition>("MasterSupportSkill.json", server),
      table<RawSupportSkillEffect>("MasterSupportSkillEffect.json", server),
      table<RawSkillDefinition>("MasterGekisouSupportSkill.json", server),
      table<RawSupportSkillEffect>("MasterGekisouSupportSkillEffect.json", server),
      table<RawSkillIcon>("MasterSkillIcon.json", server),
      table<RawSkillConditionSet>("MasterSkillConditionSet.json", server),
      table<RawSkillCondition>("MasterSkillCondition.json", server),
      table<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition.json", server),
      table<RawSkillTarget>("MasterSkillTarget.json", server),
      texts(server),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawBand>("MasterBand.json", server),
    ]);
    const card = cards.find((entry) => entry.id === cardId) ?? null;
    const rawCard = rawCards._allData.find((entry) => entry.id === cardId);
    if (!card || !rawCard) return null;
    const growth = buildSupportCardGrowth(rawCard, levels._allData, ranks._allData);
    const characterMap = new Map(characters._allData.map((entry) => [entry.id, entry]));
    const bandMap = new Map(bands._allData.map((entry) => [entry.id, entry]));
    const skills = [
      normalizeSupportSkill("support", card.supportSkillId01, supportSkills._allData, supportEffects._allData, icons._allData, textTable._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, characterMap, bandMap, targets._allData),
      normalizeSupportSkill("gekisou-support", card.gekisouSupportSkillId01, gekisouSkills._allData, gekisouEffects._allData, icons._allData, textTable._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, characterMap, bandMap, targets._allData),
    ].filter((entry): entry is SkillViewModel => entry !== null);
    return { card, skills, growth };
  });
}

export async function getBuildSupportCardDetail(locale: AppLocale, cardId: number): Promise<ServerFacetedValue<SupportCardDetailData>> {
  return await mergedValue(`support-card-detail:${locale}:${cardId}`, (server) => supportCardDetailOn(server, locale, cardId)) ?? { value: EMPTY_SUPPORT_CARD_DETAIL, servers: [] };
}

export async function getBuildCharacterDetail(locale: AppLocale, characterId: number): Promise<ServerFacetedValue<CharacterDetailData>> {
  const merged = await mergedValue(`character-detail:${locale}:${characterId}`, async (server): Promise<CharacterDetailData | null> => {
    const [{ characters }, cards] = await Promise.all([charactersOn(server, locale), cardsOn(server, locale)]);
    const character = characters.find((entry) => entry.id === characterId);
    return character ? { character, cards: cards.filter((entry) => entry.characterId === characterId) } : null;
  });
  return merged ?? { value: { character: null, cards: [] }, servers: [] };
}

export async function getBuildMusicDetail(locale: AppLocale, songId: number): Promise<ServerFaceted<MusicViewModel> | null> {
  return (await getBuildMusic(locale)).find((entry) => entry.id === songId) ?? null;
}

function deckCardLookupOn(server: GameServer, locale: AppLocale): Promise<DeckCardLookup> {
  return memo(`deck-cards:${server}:${locale}`, async () => {
    const [cards, supportCards, rawCards, rawSupportCards, memberLevels, supportLevels] = await Promise.all([
      cardsOn(server, locale),
      supportCardsOn(server, locale),
      table<RawMemberCard>("MasterMemberCard.json", server),
      table<RawSupportCard>("MasterSupportCard.json", server),
      table<RawCardLevel & { exp: number }>("MasterMemberCardLevel.json", server),
      table<RawCardLevel & { exp: number }>("MasterSupportCardLevel.json", server),
    ]);
    const memberGroups = new Map(rawCards._allData.map((card) => [card.id, card.memberCardLevelGroup]));
    const supportGroups = new Map(rawSupportCards._allData.map((card) => [card.id, card.supportCardLevelGroup]));
    // Total exp per level of each group, index `level - 1`.
    const levelExp = (rows: Array<RawCardLevel & { exp: number }>) => {
      const groups: Record<string, number[]> = {};
      for (const row of [...rows].sort((a, b) => a.level - b.level)) (groups[String(row.group)] ??= [])[row.level - 1] = row.exp;
      return groups;
    };
    return {
      member: Object.fromEntries(cards.map((card) => [String(card.id), [card.assetId, card.characterId, card.rarity, card.cardType, card.title, memberGroups.get(card.id) ?? 0]])),
      support: Object.fromEntries(supportCards.map((card) => [String(card.id), [card.assetId, card.rarity, card.cardType, card.title, supportGroups.get(card.id) ?? 0]])),
      levelExp: { member: levelExp(memberLevels._allData), support: levelExp(supportLevels._allData) },
    } satisfies DeckCardLookup;
  });
}

/**
 * The cards a music ranking's decks can name, in the compact form the ranking block ships with: every server's cards,
 * the earlier server's entry where two have the same id.
 */
export function getBuildDeckCardLookup(locale: AppLocale): Promise<DeckCardLookup> {
  return memo(`deck-cards:${locale}`, async () => {
    const lookups = (await eachServer((server) => deckCardLookupOn(server, locale))).map(([, lookup]) => lookup).reverse();
    return {
      member: Object.assign({}, ...lookups.map((lookup) => lookup.member)),
      support: Object.assign({}, ...lookups.map((lookup) => lookup.support)),
      levelExp: {
        member: Object.assign({}, ...lookups.map((lookup) => lookup.levelExp.member)),
        support: Object.assign({}, ...lookups.map((lookup) => lookup.levelExp.support)),
      },
    } satisfies DeckCardLookup;
  });
}

/**
 * A story reader page. Scripts are large, so the page carries one: the first server's with the ADV, read from that
 * server's asset catalog; its files play from there too.
 */
export function getBuildStoryDetail(locale: AppLocale, advId: number): Promise<StoryDetailData> {
  return memo(`story-detail:${locale}:${advId}`, async () => {
    const servers = await getBuildServers();
    const advTables = await Promise.all(servers.map((server) => table<RawAdv>("MasterAdv.json", server)));
    const available = servers.filter((_, index) => advTables[index]!._allData.some((entry) => entry.id === advId));
    const server = available[0] ?? PRIMARY_SERVER;
    const [advs, textTable, characters] = await Promise.all([
      table<RawAdv>("MasterAdv.json", server),
      texts(server),
      table<RawStoryCharacter>("MasterCharacter.json", server),
    ]);
    const adv = advs._allData.find((entry) => entry.id === advId);
    if (!adv) return { title: `ADV ${advId}`, script: null, characters: [], texts: [], story: null, previous: null, next: null, servers: [], server };
    const title = localizeMasterText(textTable._allData.find((entry) => entry.id === adv.titleTextId), locale) || `ADV ${advId}`;
    const characterTextIds = new Set(characters._allData.flatMap((entry) => [entry.nameTextID, entry.shortNameTextID]));
    const characterTexts = textTable._allData.filter((entry) => characterTextIds.has(entry.id));
    const fetcher = serverReleaseFetcher(server, buildFetch as typeof fetch);
    const [script, stories] = await Promise.all([
      getBuildStoryScriptLookups(server, locale).then((lookups) => fetchAndParseStory(adv.advEpisodeAsset, { locale, lookups, fetcher })),
      getBuildStories(locale),
    ]);
    return {
      title,
      script,
      characters: characters._allData,
      texts: characterTexts,
      story: stories.find((entry) => entry.advId === advId) ?? null,
      ...storyNeighbors(stories, advId),
      servers: available,
      server,
    };
  });
}

/** Chat avatars/sides and anime-still captions for story scripts. The caption table only exists in newer data, so it is optional. */
function getBuildStoryScriptLookups(server: GameServer, locale: AppLocale): Promise<StoryScriptLookups> {
  return memo(`story-script-lookups:${server}:${locale}`, async () => {
    const [chats, subtitles, textTable] = await Promise.all([
      table<RawAdvChat>("MasterAdvChat.json", server),
      table<RawAnimeStillSubtitle>("MasterBiliAnimeStillSubTitle.json", server).catch(() => ({ _allData: [] as RawAnimeStillSubtitle[] })),
      texts(server),
    ]);
    const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
    // Captions translate the Japanese drawn in the still, so Japanese readers do not need them.
    const captioned = masterTextFieldOrder(locale)[0] !== "japanese";
    return {
      chatIcons: Object.fromEntries(chats._allData.filter((chat) => chat.chatIconAssetName).map((chat) => [String(chat.id), chat.chatIconAssetName])),
      stillCaptions: !captioned ? [] : subtitles._allData.flatMap((subtitle) => {
        const text = plainRichText(localizeMasterText(textMap.get(subtitle.textID), locale)).trim();
        return text ? [{ assetName: subtitle.episodeAssetName, open: subtitle.episodeIndexOpen, close: subtitle.episodeIndexClose, text }] : [];
      }),
    };
  });
}

import type { AppLocale } from "@/config/locales";
import { getBuildMasterData } from "@/lib/masterdata/build-snapshot";
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
import { buildSupportCardGrowth, type RawSupportCardRank, type SupportCardGrowth } from "@/lib/support-cards/growth";
import { normalizeCharacters, type CharacterViewModel, type RawCharacter as RawCharacterDetail } from "@/lib/characters/data";
import { normalizeSupportCards, type RawSupportCard, type SupportCardViewModel } from "@/lib/support-cards/data";
import { normalizeSupportSkill, type RawSupportSkillEffect } from "@/lib/support-cards/skills";
import {
  getMusicCueSheets,
  normalizeMusic,
  type MusicViewModel,
  type RawBand as RawMusicBand,
  type RawCharacter as RawMusicCharacter,
  type RawMusic,
  type RawMusicScore,
  type RawText as RawMusicText,
} from "@/lib/music/data";
import { normalizeItems, type ItemViewModel, type RawItem } from "@/lib/items/data";
import { normalizeStamps, type RawStamp, type StampViewModel } from "@/lib/stamps/data";
import { normalizeComics, type ComicViewModel, type RawComic } from "@/lib/comics/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import {
  normalizeStories,
  type RawAdv,
  type RawCharacterFriendship,
  type RawHomeSpot,
  type RawStoryChapter,
  type RawStoryCharacter,
  type RawStoryEpisode,
  type RawStoryFriendshipEpisode,
  type RawStoryHomeSpotTapTalkEpisode,
  type RawStoryLiveResultEpisode,
  type StoryViewModel,
} from "@/lib/story/data";
import { fetchAndParseStory, type ParsedStoryScript } from "@/lib/story/parser";
import { loadReleaseAudio } from "@/lib/story/release-audio";
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
import { createRewardResolver, type RawHomeSpot as RawRewardHomeSpot } from "@/lib/rewards/resources";
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
}

export interface StoryReaderLookup {
  characters: RawStoryCharacter[];
  texts: RawText[];
}

const buildDataKey = Symbol.for("moenotes.masterdata.build-data");
const globalState = globalThis as typeof globalThis & { [buildDataKey]?: BuildDataState };
const state = globalState[buildDataKey] ??= { tables: new Map(), selectors: new Map() };

function table<T>(path: string): Promise<MasterTable<T>> {
  let request = state.tables.get(path);
  if (!request) {
    request = getBuildMasterData(path, validateMasterTable<unknown>);
    state.tables.set(path, request);
  }
  return request as Promise<MasterTable<T>>;
}

function memo<T>(key: string, load: () => Promise<T>): Promise<T> {
  let request = state.selectors.get(key);
  if (!request) {
    request = load();
    state.selectors.set(key, request);
  }
  return request as Promise<T>;
}

export function getBuildCards(locale: AppLocale): Promise<CardViewModel[]> {
  return memo(`cards:${locale}`, async () => {
    const [cards, characters, bands, texts] = await Promise.all([
      table<RawMemberCard>("MasterMemberCard.json"),
      table<RawCharacter>("MasterCharacter.json"),
      table<RawBand>("MasterBand.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeCards(cards._allData, characters._allData, bands._allData, texts._allData, locale);
  });
}

export function getBuildSupportCards(locale: AppLocale): Promise<SupportCardViewModel[]> {
  return memo(`support-cards:${locale}`, async () => {
    const [cards, characters, bands, texts] = await Promise.all([
      table<RawSupportCard>("MasterSupportCard.json"),
      table<RawCharacter>("MasterCharacter.json"),
      table<RawBand>("MasterBand.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeSupportCards(cards._allData, characters._allData, bands._allData, texts._allData, locale);
  });
}

export function getBuildCharacters(locale: AppLocale): Promise<{ characters: CharacterViewModel[]; bands: CharacterBandModel[] }> {
  return memo(`characters:${locale}`, async () => {
    const [characters, bands, texts] = await Promise.all([
      table<RawCharacterDetail>("MasterCharacter.json"),
      table<RawBand & { descriptionTextID?: string; descriptionTextId?: string }>("MasterBand.json"),
      table<RawText>("MasterText.json"),
    ]);
    const normalized = normalizeCharacters(characters._allData, bands._allData, texts._allData, locale)
      .sort((a, b) => a.displayOrder - b.displayOrder);
    const textMap = new Map(texts._allData.map((entry) => [entry.id, entry]));
    const resolvedBands = bands._allData.map((band) => ({
      id: band.id,
      name: localizeMasterText(textMap.get(band.nameTextID), locale) || band.nameTextID,
      description: localizeMasterText(textMap.get(band.descriptionTextID || band.descriptionTextId || ""), locale),
      color: band.mainColorCode?.trim() || "var(--mn-accent)",
    }));
    return { characters: normalized, bands: resolvedBands };
  });
}

export function getBuildMusic(locale: AppLocale): Promise<MusicViewModel[]> {
  return memo(`music:${locale}`, async () => {
    const [music, scores, characters, bands, texts, sounds, cueSheets] = await Promise.all([
      table<RawMusic>("MasterLiveMusic.json"),
      table<RawMusicScore>("MasterLiveMusicScore.json"),
      table<RawMusicCharacter>("MasterCharacter.json"),
      table<RawMusicBand>("MasterBand.json"),
      table<RawMusicText>("MasterText.json"),
      table<{ id: number; cueName: string; soundCueSheetID: number }>("MasterSound.json"),
      table<{ id: number; cueSheetName: string }>("MasterSoundCueSheet.json"),
    ]);
    const sheetNames = new Map(cueSheets._allData.map((sheet) => [sheet.id, sheet.cueSheetName]));
    const soundCues = sounds._allData.map((sound) => ({ id: sound.id, cueName: sound.cueName, cueSheetName: sheetNames.get(sound.soundCueSheetID) ?? "" }));
    const audio = await loadReleaseAudio(getMusicCueSheets(music._allData, soundCues), locale);
    return normalizeMusic(music._allData, scores._allData, characters._allData, bands._allData, texts._allData, locale, soundCues, audio);
  });
}

export function getBuildItems(locale: AppLocale): Promise<ItemViewModel[]> {
  return memo(`items:${locale}`, async () => {
    const [items, texts] = await Promise.all([
      table<RawItem>("MasterItem.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeItems(items._allData, texts._allData, locale);
  });
}

function getBuildGachaDetails(locale: AppLocale): Promise<GachaDetailViewModel[]> {
  return memo(`gacha-details:${locale}`, async () => {
    const [gachas, lots, prizes, views, products, cards, supportCards, items, texts] = await Promise.all([
      table<RawGacha>("MasterGacha.json"),
      table<RawGachaLot>("MasterGachaLot.json"),
      table<RawGachaPrize>("MasterGachaPrize.json"),
      table<RawGachaView>("MasterGachaView.json"),
      table<RawGachaProduct>("MasterGachaProduct.json"),
      getBuildCards(locale),
      getBuildSupportCards(locale),
      getBuildItems(locale),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeGachas(gachas._allData, lots._allData, prizes._allData, views._allData, products._allData, cards, supportCards, items, texts._allData, locale);
  });
}

export function getBuildGachas(locale: AppLocale): Promise<GachaViewModel[]> {
  return memo(`gachas:${locale}`, async () => (await getBuildGachaDetails(locale)).map(toGachaSummary));
}

export async function getBuildGachaDetail(locale: AppLocale, gachaId: number): Promise<GachaDetailViewModel | null> {
  return (await getBuildGachaDetails(locale)).find((gacha) => gacha.id === gachaId) ?? null;
}

export function getBuildHomeData(locale: AppLocale): Promise<HomeData> {
  return memo(`home:${locale}`, async () => {
    const [banners, gachas, rewards, music, cards, supportCards] = await Promise.all([
      table<RawHomeBanner>("MasterHomeBanner.json"),
      getBuildGachas(locale),
      getBuildRewardEntries(locale),
      getBuildMusic(locale),
      getBuildCards(locale),
      getBuildSupportCards(locale),
    ]);
    return buildHomeData(banners._allData, gachas, rewards, music, cards, supportCards);
  });
}

export function getBuildDegrees(locale: AppLocale): Promise<DegreeViewModel[]> {
  return memo(`degrees:${locale}`, async () => {
    const [degrees, characters, texts] = await Promise.all([
      table<RawDegree>("MasterDegree.json"),
      table<RawCharacter>("MasterCharacter.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeDegrees(degrees._allData, characters._allData, texts._allData, locale);
  });
}

export function getBuildBackgrounds(locale: AppLocale): Promise<BackgroundViewModel[]> {
  return memo(`backgrounds:${locale}`, async () => {
    const [backgrounds, texts] = await Promise.all([
      table<RawBackground>("MasterBackground.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeBackgrounds(backgrounds._allData, texts._allData, locale);
  });
}

function getBuildRewardEntryDetails(locale: AppLocale): Promise<RewardEntryDetail[]> {
  return memo(`reward-entries:${locale}`, async () => {
    const [
      items, cards, supportCards, music, stamps, degrees, spots, texts,
      seasonPasses, seasonPassLevels, seasonPassLevelRewards, seasonPassRewards, seasonPassMissions,
      missionGroups, missions, missionRewards, loginBonuses, loginBonusSlots,
      exchanges, chapters, episodes, advs, bands, characters,
    ] = await Promise.all([
      getBuildItems(locale),
      getBuildCards(locale),
      getBuildSupportCards(locale),
      getBuildMusic(locale),
      getBuildStamps(locale),
      getBuildDegrees(locale),
      table<RawRewardHomeSpot>("MasterHomeSpot.json"),
      table<RawText>("MasterText.json"),
      table<RawSeasonPass>("MasterSeasonPass.json"),
      table<RawSeasonPassLevel>("MasterSeasonPassLevel.json"),
      table<RawSeasonPassLevelReward>("MasterSeasonPassLevelReward.json"),
      table<RawRewardRow>("MasterSeasonPassReward.json"),
      table<RawSeasonPassMission>("MasterSeasonPassMission.json"),
      table<RawLimitedMissionGroup>("MasterLimitedMissionGroup.json"),
      table<RawLimitedMission>("MasterLimitedMission.json"),
      table<RawRewardRow>("MasterMissionReward.json"),
      table<RawLoginBonus>("MasterLoginBonus.json"),
      table<RawLoginBonusSlot>("MasterLoginBonusSlot.json"),
      table<{ id: number; nameTextId: string }>("MasterExchange.json"),
      table<{ id: number; nameTextId: string }>("MasterStoryChapter.json"),
      table<{ id: number; episodeNumber: number; advId: number }>("MasterStoryEpisode.json"),
      table<{ id: number; titleTextId: string }>("MasterAdv.json"),
      table<RawBand>("MasterBand.json"),
      table<RawCharacter>("MasterCharacter.json"),
    ]);
    const resolve = createRewardResolver({ items, cards, supportCards, music, stamps, degrees, spots: spots._allData, texts: texts._allData }, locale);
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
      texts: texts._allData,
    }, resolve, locale);
  });
}

export function getBuildRewardEntries(locale: AppLocale): Promise<RewardEntrySummary[]> {
  return memo(`reward-summaries:${locale}`, async () => (await getBuildRewardEntryDetails(locale)).map(toRewardEntrySummary));
}

export async function getBuildRewardEntryDetail(locale: AppLocale, slug: string): Promise<RewardEntryDetail | null> {
  return (await getBuildRewardEntryDetails(locale)).find((entry) => entry.slug === slug) ?? null;
}

export function getBuildStamps(locale: AppLocale): Promise<StampViewModel[]> {
  return memo(`stamps:${locale}`, async () => {
    const [stamps, characters, texts] = await Promise.all([
      table<RawStamp>("MasterStamp.json"),
      table<RawCharacter>("MasterCharacter.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeStamps(stamps._allData, characters._allData, texts._allData, locale);
  });
}

export function getBuildComics(locale: AppLocale): Promise<ComicViewModel[]> {
  return memo(`comics:${locale}`, async () => {
    const [comics, characters, texts] = await Promise.all([
      table<RawComic>("MasterLoadingComics.json"),
      table<RawCharacter>("MasterCharacter.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeComics(comics._allData, characters._allData, texts._allData, locale);
  });
}

export function getBuildBandNames(locale: AppLocale): Promise<Array<[number, string]>> {
  return memo(`band-names:${locale}`, async () => {
    const [bands, texts] = await Promise.all([
      table<RawBand>("MasterBand.json"),
      table<RawText>("MasterText.json"),
    ]);
    const textMap = new Map(texts._allData.map((entry) => [entry.id, entry]));
    return bands._allData.map((band) => [
      band.id,
      localizeMasterText(textMap.get(band.nameTextID), locale) || `Band ${band.id}`,
    ]);
  });
}

export function getBuildStories(locale: AppLocale): Promise<StoryViewModel[]> {
  return memo(`stories:${locale}`, async () => {
    const [chapters, episodes, friendshipEpisodes, homeTapEpisodes, liveResultEpisodes, advs, homeSpots, friendships, characters, bands, texts] = await Promise.all([
      table<RawStoryChapter>("MasterStoryChapter.json"),
      table<RawStoryEpisode>("MasterStoryEpisode.json"),
      table<RawStoryFriendshipEpisode>("MasterStoryFriendshipEpisode.json"),
      table<RawStoryHomeSpotTapTalkEpisode>("MasterStoryHomeSpotTapTalkEpisode.json"),
      table<RawStoryLiveResultEpisode>("MasterStoryLiveResultEpisode.json"),
      table<RawAdv>("MasterAdv.json"),
      table<RawHomeSpot>("MasterHomeSpot.json"),
      table<RawCharacterFriendship>("MasterCharacterFriendship.json"),
      table<RawStoryCharacter>("MasterCharacter.json"),
      table<RawBand>("MasterBand.json"),
      table<RawText>("MasterText.json"),
    ]);
    return normalizeStories({
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
      texts: texts._allData,
    }, locale);
  });
}

export function getBuildStoryReaderLookup(): Promise<StoryReaderLookup> {
  return memo("story-reader-lookup", async () => {
    const [characters, texts] = await Promise.all([
      table<RawStoryCharacter>("MasterCharacter.json"),
      table<RawText>("MasterText.json"),
    ]);
    const characterTextIds = new Set(characters._allData.flatMap((entry) => [entry.nameTextID, entry.shortNameTextID]));
    return {
      characters: characters._allData,
      texts: texts._allData.filter((entry) => characterTextIds.has(entry.id)),
    };
  });
}

export function getBuildCardDetail(locale: AppLocale, cardId: number): Promise<CardDetailData> {
  return memo(`card-detail:${locale}:${cardId}`, async () => {
    const [cards, rawCards, levels, levelLimits, awakes, ranks, liveSkills, liveEffects, leaderSkills, leaderEffects, gekisouSkills, gekisouEffects, icons, conditionSets, conditions, cumulativeConditions, texts] = await Promise.all([
      getBuildCards(locale),
      table<RawMemberCard>("MasterMemberCard.json"),
      table<RawCardLevel>("MasterMemberCardLevel.json"),
      table<RawMemberCardLevelLimit>("MasterMemberCardLevelLimit.json"),
      table<RawMemberCardAwake>("MasterMemberCardAwake.json"),
      table<RawMemberCardRank>("MasterMemberCardRank.json"),
      table<RawSkillDefinition>("MasterLiveSkill.json"),
      table<RawSkillEffect>("MasterLiveSkillEffect.json"),
      table<RawSkillDefinition>("MasterLeaderSkill.json"),
      table<RawSkillEffect>("MasterLeaderSkillEffect.json"),
      table<RawSkillDefinition>("MasterGekisouSkill.json"),
      table<RawSkillEffect>("MasterGekisouSkillEffect.json"),
      table<RawSkillIcon>("MasterSkillIcon.json"),
      table<RawSkillConditionSet>("MasterSkillConditionSet.json"),
      table<RawSkillCondition>("MasterSkillCondition.json"),
      table<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition.json"),
      table<RawText>("MasterText.json"),
    ]);
    const card = cards.find((entry) => entry.id === cardId) ?? null;
    const rawCard = rawCards._allData.find((entry) => entry.id === cardId);
    if (!card || !rawCard) return { card: null, skills: [], growth: { levelCurve: [], awakeSteps: [], rankSteps: [] } };
    const growth = buildMemberCardGrowth(rawCard, levels._allData, levelLimits._allData, awakes._allData, ranks._allData);
    const skills = [
      normalizeSkill("leader", card.leaderSkillId, leaderSkills._allData, leaderEffects._allData, icons._allData, texts._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData),
      normalizeSkill("live", card.liveSkillId, liveSkills._allData, liveEffects._allData, icons._allData, texts._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData),
      normalizeSkill("gekisou", card.gekisouSkillId, gekisouSkills._allData, gekisouEffects._allData, icons._allData, texts._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData),
    ].filter((entry): entry is SkillViewModel => entry !== null);
    return { card, skills, growth };
  });
}

export function getBuildSupportCardDetail(locale: AppLocale, cardId: number): Promise<SupportCardDetailData> {
  return memo(`support-card-detail:${locale}:${cardId}`, async () => {
    const [cards, rawCards, levels, ranks, supportSkills, supportEffects, gekisouSkills, gekisouEffects, icons, conditionSets, conditions, cumulativeConditions, texts, characters] = await Promise.all([
      getBuildSupportCards(locale),
      table<RawSupportCard>("MasterSupportCard.json"),
      table<RawCardLevel>("MasterSupportCardLevel.json"),
      table<RawSupportCardRank>("MasterSupportCardRank.json"),
      table<RawSkillDefinition>("MasterSupportSkill.json"),
      table<RawSupportSkillEffect>("MasterSupportSkillEffect.json"),
      table<RawSkillDefinition>("MasterGekisouSupportSkill.json"),
      table<RawSupportSkillEffect>("MasterGekisouSupportSkillEffect.json"),
      table<RawSkillIcon>("MasterSkillIcon.json"),
      table<RawSkillConditionSet>("MasterSkillConditionSet.json"),
      table<RawSkillCondition>("MasterSkillCondition.json"),
      table<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition.json"),
      table<RawText>("MasterText.json"),
      table<RawCharacter>("MasterCharacter.json"),
    ]);
    const card = cards.find((entry) => entry.id === cardId) ?? null;
    const rawCard = rawCards._allData.find((entry) => entry.id === cardId);
    if (!card || !rawCard) return { card: null, skills: [], growth: { levelCurve: [], rankSteps: [] } };
    const growth = buildSupportCardGrowth(rawCard, levels._allData, ranks._allData);
    const characterMap = new Map(characters._allData.map((entry) => [entry.id, entry]));
    const skills = [
      normalizeSupportSkill("support", card.supportSkillId01, supportSkills._allData, supportEffects._allData, icons._allData, texts._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, characterMap),
      normalizeSupportSkill("gekisou-support", card.gekisouSupportSkillId01, gekisouSkills._allData, gekisouEffects._allData, icons._allData, texts._allData, locale, conditionSets._allData, conditions._allData, cumulativeConditions._allData, characterMap),
    ].filter((entry): entry is SkillViewModel => entry !== null);
    return { card, skills, growth };
  });
}

export function getBuildCharacterDetail(locale: AppLocale, characterId: number): Promise<CharacterDetailData> {
  return memo(`character-detail:${locale}:${characterId}`, async () => {
    const [{ characters }, cards] = await Promise.all([getBuildCharacters(locale), getBuildCards(locale)]);
    return {
      character: characters.find((entry) => entry.id === characterId) ?? null,
      cards: cards.filter((entry) => entry.characterId === characterId),
    };
  });
}

export async function getBuildMusicDetail(locale: AppLocale, songId: number): Promise<MusicViewModel | null> {
  return (await getBuildMusic(locale)).find((entry) => entry.id === songId) ?? null;
}

export function getBuildStoryDetail(locale: AppLocale, advId: number): Promise<StoryDetailData> {
  return memo(`story-detail:${locale}:${advId}`, async () => {
    const [advs, texts, characters] = await Promise.all([
      table<RawAdv>("MasterAdv.json"),
      table<RawText>("MasterText.json"),
      table<RawStoryCharacter>("MasterCharacter.json"),
    ]);
    const adv = advs._allData.find((entry) => entry.id === advId);
    if (!adv) return { title: `ADV ${advId}`, script: null, characters: [], texts: [] };
    const title = localizeMasterText(texts._allData.find((entry) => entry.id === adv.titleTextId), locale) || `ADV ${advId}`;
    const characterTextIds = new Set(characters._allData.flatMap((entry) => [entry.nameTextID, entry.shortNameTextID]));
    const characterTexts = texts._allData.filter((entry) => characterTextIds.has(entry.id));
    const script = await fetchAndParseStory(adv.advEpisodeAsset, { locale });
    return { title, script, characters: characters._allData, texts: characterTexts };
  });
}

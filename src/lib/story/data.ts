import type { AppLocale } from "@/config/locales";
import { bandIdByAssetName } from "@/config/asset-names";
import {
  validateMasterTable as validateSharedMasterTable,
  type MasterTable,
  type RawBand,
  type RawText,
} from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export type StoryCategory = "main" | "friendship" | "live-result" | "home" | "tutorial";
export type HomeStoryKind = "tap-talk" | "spot-intro";

export interface RawStoryChapter {
  id: number;
  bandId: number;
  banner: string;
  descriptionTextId: string;
  endAt: string;
  eventId: number;
  icon: string;
  image: string;
  isSpecialStory: boolean;
  mainCharacterIds: number[];
  musicId: number;
  nameTextId: string;
  startAt: string;
}

export interface RawStoryEpisode {
  id: number;
  advId: number;
  banner: string;
  chapterId: number;
  characterId: number;
  characterRank: number;
  descriptionTextId: string;
  episodeNumber: number;
  eventPoint: number;
  eventStoryRewardGroupId: number;
  image: string;
  isAnotherEpisode: boolean;
  isEventSecondHalfEpisode: boolean;
  isExtraEpisode: boolean;
  storyFriendshipEpisodeId: number;
  storyRewardGroupId: number;
  thumbnail: string;
  unlockEpisodeNumber: number;
  playerRank: number;
  bandRank: number;
}

export interface RawStoryFriendshipEpisode {
  id: number;
  advId: number;
  banner: string;
  characterFriendshipId: number;
  episodeNumber: number;
  storyRewardGroupId: number;
  thumbnail: string;
  unlockCharacterFriendshipLevel: number;
}

export interface RawStoryHomeSpotTapTalkEpisode {
  id: number;
  advId: number;
  characterId: number;
  spotId: number;
}

export interface RawStoryLiveResultEpisode {
  id: number;
  advId: number;
  characterIds: number[];
  unlockCharacterFriendshipLevel: number;
}

export interface RawAdv {
  id: number;
  advEpisodeAsset: string;
  playbackMode: number;
  sheetName: string;
  titleTextId: string;
}

export interface RawHomeSpot {
  id: number;
  advId: number;
  advNameTextId: string;
  ambientSoundId: number;
  backgroundAssetPath: string;
  bandId: number;
  characterIds: number[];
  introSoundId: number;
  releaseBandRank: number;
  releaseStoryChapterId: number;
  releaseStoryEpisodeId: number;
  situationAssetPath: string;
  startAt: string;
}

export interface RawCharacterFriendship {
  id: number;
  masterCharacterIdA: number;
  masterCharacterIdB: number;
  storyBanner: string;
}

export interface RawStoryCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  shortNameTextID: string;
  mainColorCode: string;
}

export interface StoryMasterData {
  chapters: RawStoryChapter[];
  episodes: RawStoryEpisode[];
  friendshipEpisodes: RawStoryFriendshipEpisode[];
  homeTapEpisodes: RawStoryHomeSpotTapTalkEpisode[];
  liveResultEpisodes: RawStoryLiveResultEpisode[];
  advs: RawAdv[];
  homeSpots: RawHomeSpot[];
  friendships: RawCharacterFriendship[];
  characters: RawStoryCharacter[];
  bands: RawBand[];
  texts: RawText[];
}

export interface StoryUnlockCondition {
  episodeNumber: number;
  playerRank: number;
  characterRank: number;
  friendshipLevel: number;
  eventPoint: number;
  bandRank: number;
  releaseChapterId: number;
  releaseEpisodeId: number;
}

export interface StoryAssetRefs {
  advEpisodeAsset: string;
  sheetName: string;
  banner: string;
  image: string;
  thumbnail: string;
  backgroundAssetPath: string;
  situationAssetPath: string;
}

export interface StoryViewModel {
  id: string;
  sourceId: number;
  category: StoryCategory;
  homeKind: HomeStoryKind | null;
  advId: number;
  playbackMode: number;
  title: string;
  description: string;
  episodeNumber: number | null;
  chapterId: number | null;
  chapterName: string;
  chapterDescription: string;
  chapterBanner: string;
  chapterImage: string;
  groupId: string;
  groupTitle: string;
  bandId: number;
  bandName: string;
  characterIds: number[];
  characterNames: string[];
  friendshipId: number | null;
  spotId: number | null;
  rewardGroupId: number;
  eventRewardGroupId: number;
  unlock: StoryUnlockCondition;
  startAt: string;
  endAt: string;
  assets: StoryAssetRefs;
  searchText: string;
  sortOrder: number;
}

export function validateMasterTable<T>(raw: unknown): MasterTable<T> {
  return validateSharedMasterTable<T>(raw);
}

export function normalizeStories(data: StoryMasterData, locale: AppLocale): StoryViewModel[] {
  const textMap = new Map(data.texts.map((entry) => [entry.id, entry]));
  const advMap = new Map(data.advs.map((entry) => [entry.id, entry]));
  const chapterMap = new Map(data.chapters.map((entry) => [entry.id, entry]));
  const friendshipMap = new Map(data.friendships.map((entry) => [entry.id, entry]));
  const characterMap = new Map(data.characters.map((entry) => [entry.id, entry]));
  const bandMap = new Map(data.bands.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;
  const characterNames = (ids: number[]) => ids.map((id) => resolveText(characterMap.get(id)?.nameTextID ?? ""));
  const bandName = (id: number) => resolveText(bandMap.get(id)?.nameTextID ?? "");
  const stories: StoryViewModel[] = [];
  const referencedAdvIds = new Set<number>();

  for (const episode of data.episodes) {
    const adv = advMap.get(episode.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const chapter = chapterMap.get(episode.chapterId);
    const ids = chapter?.mainCharacterIds ?? (episode.characterId ? [episode.characterId] : []);
    stories.push(buildStory({
      sourceId: episode.id,
      category: "main",
      adv,
      title: resolveText(adv.titleTextId),
      description: resolveText(episode.descriptionTextId),
      episodeNumber: episode.episodeNumber,
      chapterId: episode.chapterId,
      chapterName: chapter ? resolveText(chapter.nameTextId) : "",
      chapterDescription: chapter ? resolveText(chapter.descriptionTextId) : "",
      chapterBanner: chapter?.banner ?? "",
      chapterImage: chapter?.image ?? "",
      groupId: `chapter:${episode.chapterId}`,
      groupTitle: chapter ? resolveText(chapter.nameTextId) : "",
      bandId: chapter?.bandId ?? characterMap.get(episode.characterId)?.bandID ?? 0,
      bandName: bandName(chapter?.bandId ?? 0),
      characterIds: ids,
      characterNames: characterNames(ids),
      rewardGroupId: episode.storyRewardGroupId,
      eventRewardGroupId: episode.eventStoryRewardGroupId,
      unlock: {
        episodeNumber: episode.unlockEpisodeNumber,
        characterRank: episode.characterRank,
        friendshipLevel: 0,
        eventPoint: episode.eventPoint,
        playerRank: episode.playerRank ?? 0,
        bandRank: episode.bandRank ?? 0,
        releaseChapterId: 0,
        releaseEpisodeId: 0,
      },
      startAt: chapter?.startAt ?? "",
      endAt: chapter?.endAt ?? "",
      banner: episode.banner,
      image: episode.image,
      thumbnail: episode.thumbnail,
      sortOrder: 100_000_000 + episode.chapterId * 10_000 + episode.episodeNumber,
    }));
  }

  for (const episode of data.friendshipEpisodes) {
    const adv = advMap.get(episode.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const friendship = friendshipMap.get(episode.characterFriendshipId);
    const ids = friendship
      ? [friendship.masterCharacterIdA, friendship.masterCharacterIdB]
      : [];
    const names = characterNames(ids);
    const title = resolveText(adv.titleTextId);
    stories.push(buildStory({
      sourceId: episode.id,
      category: "friendship",
      adv,
      title,
      episodeNumber: episode.episodeNumber,
      groupId: `friendship:${episode.characterFriendshipId}`,
      groupTitle: names.join(" & "),
      bandId: characterMap.get(ids[0] ?? 0)?.bandID ?? 0,
      bandName: bandName(characterMap.get(ids[0] ?? 0)?.bandID ?? 0),
      characterIds: ids,
      characterNames: names,
      friendshipId: episode.characterFriendshipId,
      rewardGroupId: episode.storyRewardGroupId,
      unlock: emptyUnlock({ friendshipLevel: episode.unlockCharacterFriendshipLevel }),
      banner: episode.banner || friendship?.storyBanner || "",
      thumbnail: episode.thumbnail,
      sortOrder: 200_000_000 + episode.characterFriendshipId * 1_000 + episode.episodeNumber,
    }));
  }

  for (const episode of data.liveResultEpisodes) {
    const adv = advMap.get(episode.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const ids = episode.characterIds;
    const names = characterNames(ids);
    const firstBandId = characterMap.get(ids[0] ?? 0)?.bandID ?? 0;
    stories.push(buildStory({
      sourceId: episode.id,
      category: "live-result",
      adv,
      title: resolveText(adv.titleTextId),
      groupId: `live-result:${ids.join("-")}`,
      groupTitle: names.join(" & "),
      bandId: firstBandId,
      bandName: bandName(firstBandId),
      characterIds: ids,
      characterNames: names,
      unlock: emptyUnlock({ friendshipLevel: episode.unlockCharacterFriendshipLevel }),
      sortOrder: 300_000_000 + episode.id,
    }));
  }

  for (const episode of data.homeTapEpisodes) {
    const adv = advMap.get(episode.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const spot = data.homeSpots.find((entry) => entry.id === episode.spotId);
    const ids = [episode.characterId];
    const resolvedBandId = spot?.bandId ?? characterMap.get(episode.characterId)?.bandID ?? 0;
    stories.push(buildStory({
      sourceId: episode.id,
      category: "home",
      homeKind: "tap-talk",
      adv,
      title: resolveText(adv.titleTextId),
      groupId: `home:${episode.spotId}`,
      groupTitle: spot ? resolveText(spot.advNameTextId) : "",
      bandId: resolvedBandId,
      bandName: bandName(resolvedBandId),
      characterIds: ids,
      characterNames: characterNames(ids),
      spotId: episode.spotId,
      startAt: spot?.startAt ?? "",
      backgroundAssetPath: spot?.backgroundAssetPath ?? "",
      situationAssetPath: spot?.situationAssetPath ?? "",
      sortOrder: 400_000_000 + episode.spotId * 1_000 + episode.id,
    }));
  }

  for (const spot of data.homeSpots) {
    if (!spot.advId) continue;
    const adv = advMap.get(spot.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const names = characterNames(spot.characterIds);
    stories.push(buildStory({
      sourceId: spot.id,
      category: "home",
      homeKind: "spot-intro",
      adv,
      title: resolveText(adv.titleTextId),
      groupId: `home:${spot.id}`,
      groupTitle: resolveText(spot.advNameTextId),
      bandId: spot.bandId,
      bandName: bandName(spot.bandId),
      characterIds: spot.characterIds,
      characterNames: names,
      spotId: spot.id,
      unlock: emptyUnlock({
        bandRank: spot.releaseBandRank,
        releaseChapterId: spot.releaseStoryChapterId,
        releaseEpisodeId: spot.releaseStoryEpisodeId,
      }),
      startAt: spot.startAt,
      backgroundAssetPath: spot.backgroundAssetPath,
      situationAssetPath: spot.situationAssetPath,
      sortOrder: 410_000_000 + spot.id,
    }));
  }

  for (const adv of data.advs) {
    if (referencedAdvIds.has(adv.id) || classifyAdv(adv) !== "tutorial") continue;
    stories.push(buildStory({
      sourceId: adv.id,
      category: "tutorial",
      adv,
      title: resolveText(adv.titleTextId),
      groupId: "tutorial",
      groupTitle: "",
      sortOrder: 500_000_000 + adv.id,
    }));
  }

  return stories.sort((a, b) => a.sortOrder - b.sortOrder || a.advId - b.advId);
}

export function classifyAdv(adv: RawAdv): StoryCategory | null {
  const asset = adv.advEpisodeAsset.toLowerCase();
  if (asset.startsWith("adv_script_tutorial_")) return "tutorial";
  if (asset.startsWith("adv_script_afterlive_")) return "live-result";
  if (asset.startsWith("adv_script_home_")) return "home";
  if (asset.includes("_linkstory_")) return "friendship";
  if (Object.keys(bandIdByAssetName).some((name) => asset.startsWith(`adv_script_${name}_`))) return "main";
  return null;
}

export { localizeMasterText } from "@/lib/masterdata/localize-text";

interface BuildStoryInput {
  sourceId: number;
  category: StoryCategory;
  homeKind?: HomeStoryKind;
  adv: RawAdv;
  title: string;
  description?: string;
  episodeNumber?: number;
  chapterId?: number;
  chapterName?: string;
  chapterDescription?: string;
  chapterBanner?: string;
  chapterImage?: string;
  groupId: string;
  groupTitle: string;
  bandId?: number;
  bandName?: string;
  characterIds?: number[];
  characterNames?: string[];
  friendshipId?: number;
  spotId?: number;
  rewardGroupId?: number;
  eventRewardGroupId?: number;
  unlock?: StoryUnlockCondition;
  startAt?: string;
  endAt?: string;
  banner?: string;
  image?: string;
  thumbnail?: string;
  backgroundAssetPath?: string;
  situationAssetPath?: string;
  sortOrder: number;
}

function buildStory(input: BuildStoryInput): StoryViewModel {
  const characterIds = input.characterIds ?? [];
  const names = input.characterNames ?? [];
  const story: StoryViewModel = {
    id: `${input.category}:${input.homeKind ?? "episode"}:${input.sourceId}`,
    sourceId: input.sourceId,
    category: input.category,
    homeKind: input.homeKind ?? null,
    advId: input.adv.id,
    playbackMode: input.adv.playbackMode,
    title: input.title,
    description: input.description ?? "",
    episodeNumber: input.episodeNumber ?? null,
    chapterId: input.chapterId ?? null,
    chapterName: input.chapterName ?? "",
    chapterDescription: input.chapterDescription ?? "",
    chapterBanner: input.chapterBanner ?? "",
    chapterImage: input.chapterImage ?? "",
    groupId: input.groupId,
    groupTitle: input.groupTitle,
    bandId: input.bandId ?? 0,
    bandName: input.bandName ?? "",
    characterIds,
    characterNames: names,
    friendshipId: input.friendshipId ?? null,
    spotId: input.spotId ?? null,
    rewardGroupId: input.rewardGroupId ?? 0,
    eventRewardGroupId: input.eventRewardGroupId ?? 0,
    unlock: input.unlock ?? emptyUnlock(),
    startAt: input.startAt ?? "",
    endAt: input.endAt ?? "",
    assets: {
      advEpisodeAsset: input.adv.advEpisodeAsset,
      sheetName: input.adv.sheetName,
      banner: input.banner ?? "",
      image: input.image ?? "",
      thumbnail: input.thumbnail ?? "",
      backgroundAssetPath: input.backgroundAssetPath ?? "",
      situationAssetPath: input.situationAssetPath ?? "",
    },
    searchText: "",
    sortOrder: input.sortOrder,
  };
  story.searchText = [
    story.title,
    story.description,
    story.chapterName,
    story.groupTitle,
    story.bandName,
    ...names,
    story.advId,
  ].join(" ").toLocaleLowerCase();
  return story;
}

function emptyUnlock(overrides: Partial<StoryUnlockCondition> = {}): StoryUnlockCondition {
  return {
    episodeNumber: 0,
    playerRank: 0,
    characterRank: 0,
    friendshipLevel: 0,
    eventPoint: 0,
    bandRank: 0,
    releaseChapterId: 0,
    releaseEpisodeId: 0,
    ...overrides,
  };
}

import type { AppLocale } from "@/config/locales";
import { bandIdByAssetName } from "@/config/asset-names";
import {
  validateMasterTable as validateSharedMasterTable,
  type MasterTable,
  type RawBand,
  type RawText,
} from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

export type StoryCategory = "main" | "event" | "friendship" | "birthday" | "live-result" | "home" | "tutorial";
/** A chapter's main episodes, its per-character another episodes and its extra episodes each number from 1. */
export type StoryEpisodeKind = "main" | "another" | "extra";
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
  startAt?: string;
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

/**
 * What the game lands on at login on a given day (MasterStoryLoginLanding). A birthday's row points at the character's
 * special story chapter and episode, with a `Birthday/…` effect prefab.
 */
export interface RawStoryLoginLanding {
  id: number;
  storyChapterId: number;
  storyEpisodeId: number;
  startAt: string;
  endAt: string;
  contentPrefabAddress: string;
  characterId: number;
}

/** Length of an ADV's playback (MasterAdvPlayTime; id is the ADV id). */
export interface RawAdvPlayTime {
  id: number;
  playTime: number;
}

/** A story episode's clear reward (MasterStoryReward), by the episode's storyRewardGroupId. */
export interface RawStoryReward {
  group: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

export interface RawCharacterFriendship {
  id: number;
  masterCharacterIdA: number;
  masterCharacterIdB: number;
  storyBanner: string;
}

/** Phone-chat window and sender settings; story chat rows refer to them by targetChatID. */
export interface RawAdvChat {
  id: number;
  chatIconAssetName: string;
  chatWindowAssetName: string;
}

/** Translation of the text drawn in an anime still, shown while the still is up (episode row indices). */
export interface RawAnimeStillSubtitle {
  id: number;
  episodeAssetName: string;
  episodeIndexOpen: number;
  episodeIndexClose: number;
  textID: string;
}

export interface RawStoryCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  shortNameTextID: string;
  mainColorCode: string;
  birthdayMonth?: number;
  birthdayDay?: number;
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
  /** Event story chapters (MasterEvent._storyChapterId) and the event they belong to; other chapters are main story. */
  eventChapters?: Array<{ chapterId: number; eventId: number }>;
  /** Login landings; the `Birthday/` ones mark birthday chapters (with isSpecialStory chapters). */
  loginLandings?: RawStoryLoginLanding[];
  playTimes?: RawAdvPlayTime[];
  storyRewards?: RawStoryReward[];
  /** Names and artwork of the clear rewards; without it stories carry no rewards. */
  resolveReward?: RewardResolver;
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
  /** The ADV of `releaseEpisodeId` (the episode to read first), when the build knows it; 0 otherwise. */
  releaseAdvId?: number;
}

/** The character whose birthday a birthday story celebrates. */
export interface StoryBirthday {
  characterId: number;
  characterName: string;
  month: number;
  day: number;
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
  /** The event the episode's chapter belongs to; null for every other story. */
  eventId: number | null;
  homeKind: HomeStoryKind | null;
  advId: number;
  playbackMode: number;
  title: string;
  description: string;
  episodeNumber: number | null;
  episodeKind: StoryEpisodeKind | null;
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
  /** Clear rewards (storyRewardGroupId resolved); empty when the episode has none. */
  rewards: RewardViewModel[];
  /** Playback length in seconds (MasterAdvPlayTime), or null when unknown. */
  playTime: number | null;
  /** Set for a birthday story. */
  birthday: StoryBirthday | null;
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
  const eventChapterMap = new Map((data.eventChapters ?? []).map((entry) => [entry.chapterId, entry.eventId]));
  const birthdayChapters = birthdayChapterCharacters(data.chapters, data.loginLandings ?? []);
  const playTimeMap = new Map((data.playTimes ?? []).filter((entry) => entry.playTime > 0).map((entry) => [entry.id, entry.playTime]));
  const rewardsByGroup = groupStoryRewards(data.storyRewards ?? [], data.resolveReward);
  const episodeAdvMap = new Map(data.episodes.map((entry) => [entry.id, entry.advId]));
  const stories: StoryViewModel[] = [];
  const referencedAdvIds = new Set<number>();
  const extras = (advId: number, rewardGroupId = 0) => ({ playTime: playTimeMap.get(advId) ?? null, rewards: rewardsByGroup.get(rewardGroupId) ?? [] });
  const birthdayOf = (characterId: number): StoryBirthday | null => {
    const character = characterMap.get(characterId);
    if (!character) return null;
    return { characterId, characterName: resolveText(character.nameTextID), month: character.birthdayMonth ?? 0, day: character.birthdayDay ?? 0 };
  };

  for (const episode of data.episodes) {
    const adv = advMap.get(episode.advId);
    if (!adv) continue;
    referencedAdvIds.add(adv.id);
    const chapter = chapterMap.get(episode.chapterId);
    const episodeKind: StoryEpisodeKind = episode.isAnotherEpisode ? "another" : episode.isExtraEpisode ? "extra" : "main";
    // An another episode follows one character.
    const ids = episodeKind === "another" && episode.characterId
      ? [episode.characterId]
      : chapter?.mainCharacterIds ?? (episode.characterId ? [episode.characterId] : []);
    const eventId = eventChapterMap.get(episode.chapterId) ?? null;
    // Birthday chapters are special chapters of their own, listed apart from the main story.
    const birthdayCharacter = eventId === null ? birthdayChapters.get(episode.chapterId) : undefined;
    stories.push(buildStory({
      sourceId: episode.id,
      category: birthdayCharacter !== undefined ? "birthday" : eventId === null ? "main" : "event",
      eventId,
      birthday: birthdayCharacter !== undefined ? birthdayOf(birthdayCharacter) : null,
      ...extras(adv.id, episode.storyRewardGroupId),
      adv,
      title: resolveText(adv.titleTextId),
      description: resolveText(episode.descriptionTextId),
      episodeNumber: episode.episodeNumber,
      episodeKind,
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
      startAt: episode.startAt || chapter?.startAt || "",
      endAt: chapter?.endAt ?? "",
      banner: episode.banner,
      image: episode.image,
      thumbnail: episode.thumbnail,
      // Main episodes, then another episodes, then extra episodes.
      sortOrder: 100_000_000 + episode.chapterId * 10_000 + EPISODE_KIND_ORDER[episodeKind] * 1_000 + episode.episodeNumber,
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
      ...extras(adv.id, episode.storyRewardGroupId),
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
      ...extras(adv.id),
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
      ...extras(adv.id),
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
      ...extras(adv.id),
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
        releaseAdvId: episodeAdvMap.get(spot.releaseStoryEpisodeId) ?? 0,
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
      ...extras(adv.id),
      title: resolveText(adv.titleTextId),
      groupId: "tutorial",
      groupTitle: "",
      sortOrder: 500_000_000 + adv.id,
    }));
  }

  return stories.sort((a, b) => a.sortOrder - b.sortOrder || a.advId - b.advId);
}

const EPISODE_KIND_ORDER: Readonly<Record<StoryEpisodeKind, number>> = { main: 0, another: 1, extra: 2 };

/**
 * Birthday chapters and whose birthday they are: the chapters a `Birthday/…` login landing opens (its character), and
 * the chapters MasterStoryChapter marks as special stories (their first main character). The JP server's landing table
 * may be empty; its special chapters still count.
 */
export function birthdayChapterCharacters(chapters: readonly RawStoryChapter[], landings: readonly RawStoryLoginLanding[]): Map<number, number> {
  const result = new Map<number, number>();
  for (const landing of landings) {
    const address = landing.contentPrefabAddress ?? "";
    if (!address.startsWith("Birthday/") || address.length <= "Birthday/".length || !landing.storyChapterId) continue;
    if (!result.has(landing.storyChapterId)) result.set(landing.storyChapterId, landing.characterId);
  }
  for (const chapter of chapters) {
    if (chapter.isSpecialStory && !result.has(chapter.id)) result.set(chapter.id, chapter.mainCharacterIds?.[0] ?? 0);
  }
  return result;
}

/** Clear rewards by reward group; nothing without a resolver. */
function groupStoryRewards(rows: readonly RawStoryReward[], resolve: RewardResolver | undefined): Map<number, RewardViewModel[]> {
  const groups = new Map<number, RewardViewModel[]>();
  if (!resolve) return groups;
  for (const row of rows) {
    if (!row.group) continue;
    const list = groups.get(row.group) ?? [];
    list.push(resolve(row));
    groups.set(row.group, list);
  }
  return groups;
}

/** The previous or next story of a detail page, in its category's reading order. */
export interface StoryNeighbor {
  advId: number;
  title: string;
  episodeKind: StoryEpisodeKind | null;
  episodeNumber: number | null;
  groupTitle: string;
}

export function storyNeighbors(stories: StoryViewModel[], advId: number): { previous: StoryNeighbor | null; next: StoryNeighbor | null } {
  const current = stories.find((story) => story.advId === advId);
  if (!current) return { previous: null, next: null };
  const seen = new Set<number>();
  // An event's episodes follow one another; the main story follows the whole run of chapters.
  const ordered = stories.filter((story) => story.category === current.category && (current.category !== "event" || story.eventId === current.eventId) && !seen.has(story.advId) && seen.add(story.advId));
  const index = ordered.findIndex((story) => story.advId === advId);
  const neighbor = (story: StoryViewModel | undefined): StoryNeighbor | null => story
    ? { advId: story.advId, title: story.title, episodeKind: story.episodeKind, episodeNumber: story.episodeNumber, groupTitle: story.groupTitle }
    : null;
  return { previous: neighbor(ordered[index - 1]), next: neighbor(ordered[index + 1]) };
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
  /** Set for an event story episode. */
  eventId?: number | null;
  homeKind?: HomeStoryKind;
  adv: RawAdv;
  title: string;
  description?: string;
  episodeNumber?: number;
  episodeKind?: StoryEpisodeKind;
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
  rewards?: RewardViewModel[];
  playTime?: number | null;
  birthday?: StoryBirthday | null;
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
    eventId: input.eventId ?? null,
    homeKind: input.homeKind ?? null,
    advId: input.adv.id,
    playbackMode: input.adv.playbackMode,
    title: input.title,
    description: input.description ?? "",
    episodeNumber: input.episodeNumber ?? null,
    episodeKind: input.episodeKind ?? null,
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
    rewards: input.rewards ?? [],
    playTime: input.playTime ?? null,
    birthday: input.birthday ?? null,
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
    story.birthday?.characterName ?? "",
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

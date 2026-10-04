import type { AppLocale } from "@/config/locales";
import { describeMission } from "@/lib/missions/describe";
import type { RewardViewModel } from "@/lib/rewards/resources";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { StoryCategory, StoryViewModel } from "@/lib/story/data";

/*
 * The character page's bonds, missions and related sections: plain data the build computes per server
 * (src/lib/masterdata/build-character-extras.ts) and the page shows for its server.
 */

/** A pair of MasterCharacterFriendship, from one character's side. */
export interface CharacterPartner {
  friendshipId: number;
  partnerId: number;
  /** Release URL of the pair's story banner (its first bond episode's), "" when it has none. */
  bannerUrl: string;
}

export interface CharacterFriendshipStory {
  advId: number;
  friendshipId: number;
  title: string;
  episodeNumber: number | null;
  unlockLevel: number;
}

export interface CharacterRelatedStory {
  advId: number;
  category: StoryCategory;
  title: string;
  groupTitle: string;
}

export interface CharacterRelatedSong {
  id: number;
  title: string;
  jacketUrl: string;
}

export interface CharacterRelatedStamp {
  id: number;
  name: string;
  imageUrl: string;
}

/**
 * MasterCharacterMission rows of one `missionType`, ordered by `priority`. The table holds templates every character
 * shares (no character id); `{CharacterId}` in the description is the character whose page shows it. Rows are packed
 * (packMissionRows) since every character page carries all of them.
 */
export interface CharacterMissionGroup {
  type: number;
  /** MasterText title of the type (fallback when the UI has no name for it). */
  title: string;
  /** Localized description template with its `{Key}` placeholders. */
  template: string;
  rows: string;
}

export interface CharacterMissionRow {
  achievementCount: number;
  value: number;
  rewardIds: number[];
}

export interface CharacterExtrasData {
  /** Every character's id, name and band, for names and links of partners and birthdays. */
  characters: Array<{ id: number; name: string; bandId: number }>;
  partners: CharacterPartner[];
  friendshipStories: CharacterFriendshipStory[];
  supportCards: SupportCardViewModel[];
  stamps: CharacterRelatedStamp[];
  /** Stories other than bond stories the character appears in. */
  stories: CharacterRelatedStory[];
  /** Songs of the character's band. */
  songs: CharacterRelatedSong[];
  missions: CharacterMissionGroup[];
  /** MasterMissionReward rows the missions hand out, by id. */
  missionRewards: Record<string, RewardViewModel>;
}

export const EMPTY_CHARACTER_EXTRAS: CharacterExtrasData = {
  characters: [], partners: [], friendshipStories: [], supportCards: [], stamps: [], stories: [], songs: [], missions: [], missionRewards: {},
};

/** The pairs a character belongs to, as A or as B, with the other character of each. */
export function characterPartners(
  friendships: ReadonlyArray<{ id: number; masterCharacterIdA: number; masterCharacterIdB: number }>,
  characterId: number,
): Array<{ friendshipId: number; partnerId: number }> {
  return friendships.flatMap((pair) => {
    if (pair.masterCharacterIdA === characterId && pair.masterCharacterIdB !== characterId) return [{ friendshipId: pair.id, partnerId: pair.masterCharacterIdB }];
    if (pair.masterCharacterIdB === characterId && pair.masterCharacterIdA !== characterId) return [{ friendshipId: pair.id, partnerId: pair.masterCharacterIdA }];
    return [];
  });
}

/** Bond stories of a character's pairs, by pair and episode. */
export function characterFriendshipStories(stories: readonly StoryViewModel[], friendshipIds: readonly number[]): StoryViewModel[] {
  const own = new Set(friendshipIds);
  return stories
    .filter((story) => story.category === "friendship" && story.friendshipId !== null && own.has(story.friendshipId))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/** Other stories the character appears in (one entry per ADV), in the story list's order. */
export function characterRelatedStories(stories: readonly StoryViewModel[], characterId: number): StoryViewModel[] {
  const seen = new Set<number>();
  return stories
    .filter((story) => story.category !== "friendship" && story.characterIds.includes(characterId))
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .filter((story) => (seen.has(story.advId) ? false : (seen.add(story.advId), true)));
}

/**
 * A character mission's description for one character: the shared template through describeMission, with
 * `{CharacterId}` read as `characterName` and `{AchievementCount}` / `{Value}` as the row's.
 */
export function characterMissionText(template: string, locale: AppLocale, characterName: string, row: { achievementCount: number; value: number }): string {
  const none = () => undefined;
  return describeMission(
    { descriptionTextId: "template", achievementCount: row.achievementCount, value: row.value, exchangeId: 0, characterId: 1, bandId: 0, musicId: 0, musicDifficulty: 0, scoreRank: 0, cardType: 0, storyChapterId: 0, episodeId: 0 },
    { locale, text: () => template, characterName: () => characterName, exchangeName: none, chapterName: none, episode: none, bandName: none, musicTitle: none, difficulty: () => "" },
  );
}

/** `count,value,reward+reward;…` */
export function packMissionRows(rows: readonly CharacterMissionRow[]): string {
  return rows.map((row) => `${row.achievementCount},${row.value},${row.rewardIds.join("+")}`).join(";");
}

export function unpackMissionRows(packed: string): CharacterMissionRow[] {
  if (!packed) return [];
  return packed.split(";").map((entry) => {
    const [count = "0", value = "0", rewards = ""] = entry.split(",");
    return { achievementCount: Number(count) || 0, value: Number(value) || 0, rewardIds: rewards ? rewards.split("+").map(Number).filter(Number.isFinite) : [] };
  });
}

export interface RawCharacterMission {
  id: number;
  titleTextId: string;
  descriptionTextId: string;
  missionType: number;
  achievementCount: number;
  value?: number;
  priority: number;
  missionRewardIds?: number[];
}

/** MasterCharacterMission grouped by type (ascending), each type's rows by priority then id. */
export function groupCharacterMissions(
  missions: readonly RawCharacterMission[],
  text: (textId: string) => string,
): CharacterMissionGroup[] {
  const byType = new Map<number, RawCharacterMission[]>();
  for (const mission of missions) {
    const list = byType.get(mission.missionType) ?? [];
    list.push(mission);
    byType.set(mission.missionType, list);
  }
  return [...byType.entries()].sort(([a], [b]) => a - b).map(([type, list]) => {
    const sorted = [...list].sort((a, b) => a.priority - b.priority || a.id - b.id);
    const first = sorted[0]!;
    return {
      type,
      title: text(first.titleTextId),
      template: text(first.descriptionTextId),
      rows: packMissionRows(sorted.map((mission) => ({ achievementCount: mission.achievementCount, value: mission.value ?? 0, rewardIds: mission.missionRewardIds ?? [] }))),
    };
  });
}

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { fillMissionTemplate, missionPlaceholderValues, type MissionDescribeContext, type MissionDescriptionFields } from "@/lib/missions/describe";
import type { MissionLookupSources, RawRewardRow } from "@/lib/rewards/data";
import type { RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

/** MasterMission: the standing missions (daily, normal, titles, song and home unlocks). */
export interface RawMission extends MissionDescriptionFields {
  id: number;
  missionCategory: number;
  missionType: number;
  priority: number;
  missionRewardIds: number[];
  startAt: string;
  endAt: string;
}

export interface MissionSources extends MissionLookupSources {
  missions: RawMission[];
  missionRewards: RawRewardRow[];
  texts: RawText[];
}

export interface RegularMissionViewModel {
  id: number;
  category: number;
  description: string;
  /** The count to reach (MasterData `_achievementCount`). */
  goal: number;
  rewards: RewardViewModel[];
  startAt: string;
  endAt: string;
}

export interface MissionCategoryViewModel {
  /** MasterMission `_missionCategory`. */
  id: number;
  missions: RegularMissionViewModel[];
}

/**
 * MasterMission `_missionCategory` values with a page label of their own (i18n `missions.categories.<key>`), in tab
 * order: 1 the daily rotation, 4 the standing missions, 9 the title missions, 15 the song unlocks (band rating), 16 the
 * home unlocks (band rank). Other values fall back to `missions.categories.other`.
 */
export const MISSION_CATEGORY_KEYS: Readonly<Record<number, string>> = { 1: "daily", 4: "normal", 9: "titles", 15: "songs", 16: "home" };
const CATEGORY_ORDER = [1, 4, 9, 15, 16];

export function missionCategoryKey(category: number): string {
  return MISSION_CATEGORY_KEYS[category] ?? "other";
}

// MasterLiveMusic difficulty index → the game's difficulty names (MasterText).
const difficultyTextIds = ["ui_difficulty_easy", "ui_difficulty_normal", "ui_difficulty_hard", "ui_difficulty_expert"];

/** The lookups a mission description's placeholders read, from a server's tables. */
export function createMissionDescribeContext(sources: MissionLookupSources & { texts: RawText[] }, locale: AppLocale): MissionDescribeContext {
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));
  const text = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");
  const nameMap = (rows: Array<{ id: number; nameTextId?: string; nameTextID?: string }>) => new Map(rows.map((row) => [row.id, text(row.nameTextId ?? row.nameTextID)]));
  const exchanges = nameMap(sources.exchanges);
  const chapters = nameMap(sources.chapters);
  const bands = nameMap(sources.bands);
  const characters = nameMap(sources.characters);
  const episodes = new Map(sources.episodes.map((episode) => [episode.id, episode]));
  const advTitles = new Map(sources.advs.map((adv) => [adv.id, adv.titleTextId]));
  const music = new Map(sources.music.map((song) => [song.id, song.title]));
  return {
    locale,
    text: (id) => text(id),
    exchangeName: (id) => exchanges.get(id),
    chapterName: (id) => chapters.get(id),
    episode: (id) => {
      const episode = episodes.get(id);
      return episode ? { number: episode.episodeNumber, title: text(advTitles.get(episode.advId)) } : undefined;
    },
    bandName: (id) => bands.get(id),
    characterName: (id) => characters.get(id),
    musicTitle: (id) => music.get(id),
    difficulty: (value) => text(difficultyTextIds[value]),
  };
}

/** The standing missions of a server by category, in the game's order (priority, then id) within each. */
export function normalizeRegularMissions(sources: MissionSources, resolve: RewardResolver, locale: AppLocale): MissionCategoryViewModel[] {
  const context = createMissionDescribeContext(sources, locale);
  const rewardRows = new Map(sources.missionRewards.map((row) => [row.id, row]));
  const byCategory = new Map<number, RegularMissionViewModel[]>();
  for (const mission of [...sources.missions].sort((a, b) => a.priority - b.priority || a.id - b.id)) {
    if (!Number.isSafeInteger(mission.id) || mission.id <= 0) continue;
    // "Clear {AchievementCount} {MissionCategory} Missions": the daily-clear mission names its own category.
    const description = fillMissionTemplate(context.text(mission.descriptionTextId), {
      ...missionPlaceholderValues(mission, context),
      MissionCategory: t(locale, `missions.categories.${missionCategoryKey(mission.missionCategory)}`),
    });
    const list = byCategory.get(mission.missionCategory) ?? [];
    list.push({
      id: mission.id,
      category: mission.missionCategory,
      description: description || `#${mission.id}`,
      goal: Math.max(0, mission.achievementCount),
      rewards: (mission.missionRewardIds ?? []).flatMap((id) => {
        const row = rewardRows.get(id);
        return row ? [resolve(row)] : [];
      }),
      startAt: mission.startAt === "null" ? "" : mission.startAt ?? "",
      endAt: mission.endAt === "null" ? "" : mission.endAt ?? "",
    });
    byCategory.set(mission.missionCategory, list);
  }
  const rank = (category: number) => {
    const index = CATEGORY_ORDER.indexOf(category);
    return index < 0 ? CATEGORY_ORDER.length + category : index;
  };
  return [...byCategory].sort(([a], [b]) => rank(a) - rank(b)).map(([id, missions]) => ({ id, missions }));
}

/** Deep link state of the missions page: `?mode=regular|limited&id=<mission or group id>`. */
export interface MissionsDeepLink {
  mode: "regular" | "limited" | null;
  id: number | null;
}

export function parseMissionsDeepLink(search: string): MissionsDeepLink {
  const params = new URLSearchParams(search);
  const rawMode = params.get("mode");
  const mode = rawMode === "regular" || rawMode === "limited" ? rawMode : null;
  const rawId = Number(params.get("id"));
  return { mode, id: Number.isSafeInteger(rawId) && rawId > 0 ? rawId : null };
}

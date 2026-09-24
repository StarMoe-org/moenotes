import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RawResource, RewardKind, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

export interface RawSeasonPass {
  id: number;
  nameTextId: string;
  descriptionTextId: string;
  levelGroup: number;
  startAt: string;
  endAt: string;
  recommendationLevelRewardIds: number[];
  bannerAsset: string;
}

export interface RawSeasonPassLevel {
  group: number;
  level: number;
  point: number;
}

export interface RawSeasonPassLevelReward {
  id: number;
  seasonPassId: number;
  level: number;
  isPremium: boolean;
  rewardIds: number[];
}

export interface RawRewardRow extends RawResource {
  id: number;
}

/** Fields shared by MasterSeasonPassMission and MasterLimitedMission that feed description placeholders. */
export interface RawMissionFields {
  id: number;
  descriptionTextId: string;
  achievementCount: number;
  value: number;
  exchangeId: number;
  characterId: number;
  bandId: number;
  musicId: number;
  musicDifficulty: number;
  scoreRank: number;
  cardType: number;
  storyChapterId: number;
  episodeId: number;
  priority: number;
}

export interface RawSeasonPassMission extends RawMissionFields {
  seasonPassId: number;
  missionCategory: number;
  seasonPassPoint: number;
}

export interface RawLimitedMissionGroup {
  id: number;
  nameTextID: string;
  completeRewardIds: number[];
  bannerAsset: string;
  startAt: string;
  endAt: string;
}

export interface RawLimitedMission extends RawMissionFields {
  limitedMissionGroupId: number;
  releaseDay: number;
  missionRewardIds: number[];
}

export interface RawLoginBonus {
  id: number;
  nameTextID: string;
  isLoop: boolean;
  startAt: string;
  endAt: string;
  sheetImageAsset: string;
  priority: number;
}

export interface RawLoginBonusSlot extends RawResource {
  loginBonusID: number;
  sheetNo: number;
  slotNo: number;
  isDecorated: boolean;
}

export interface MissionLookupSources {
  exchanges: Array<{ id: number; nameTextId: string }>;
  chapters: Array<{ id: number; nameTextId: string }>;
  episodes: Array<{ id: number; episodeNumber: number; advId: number }>;
  advs: Array<{ id: number; titleTextId: string }>;
  bands: Array<{ id: number; nameTextID: string }>;
  characters: Array<{ id: number; nameTextID: string }>;
  music: Array<{ id: number; title: string }>;
}

export interface RewardsMasterData extends MissionLookupSources {
  seasonPasses: RawSeasonPass[];
  seasonPassLevels: RawSeasonPassLevel[];
  seasonPassLevelRewards: RawSeasonPassLevelReward[];
  seasonPassRewards: RawRewardRow[];
  seasonPassMissions: RawSeasonPassMission[];
  missionGroups: RawLimitedMissionGroup[];
  missions: RawLimitedMission[];
  missionRewards: RawRewardRow[];
  loginBonuses: RawLoginBonus[];
  loginBonusSlots: RawLoginBonusSlot[];
  texts: RawText[];
}

export type RewardEntryKind = "seasonPass" | "loginBonus" | "mission";

export interface RewardEntrySummary {
  /** Route parameter, e.g. "season-pass-1". */
  slug: string;
  kind: RewardEntryKind;
  id: number;
  title: string;
  bannerUrl: string;
  startAt: string;
  endAt: string;
  /** The most notable distinct rewards, for list previews. */
  highlights: RewardViewModel[];
  searchText: string;
}

export interface MissionViewModel {
  id: number;
  description: string;
  points: number;
  rewards: RewardViewModel[];
}

export interface SeasonPassLevelViewModel {
  level: number;
  point: number;
  free: RewardViewModel[];
  premium: RewardViewModel[];
  /** Levels the game itself promotes on the pass screen. */
  featured: boolean;
}

export interface SeasonPassDetail extends RewardEntrySummary {
  kind: "seasonPass";
  description: string;
  levels: SeasonPassLevelViewModel[];
  missionGroups: Array<{ category: "daily" | "normal"; missions: MissionViewModel[] }>;
}

export interface LoginBonusDetail extends RewardEntrySummary {
  kind: "loginBonus";
  isLoop: boolean;
  sheets: Array<{ sheet: number; days: Array<{ day: number; decorated: boolean; rewards: RewardViewModel[] }> }>;
}

export interface MissionGroupDetail extends RewardEntrySummary {
  kind: "mission";
  days: Array<{ day: number; missions: MissionViewModel[] }>;
  completeRewards: RewardViewModel[];
}

export type RewardEntryDetail = SeasonPassDetail | LoginBonusDetail | MissionGroupDetail;

const slugPrefix: Record<RewardEntryKind, string> = { seasonPass: "season-pass", loginBonus: "login-bonus", mission: "missions" };

export function rewardEntrySlug(kind: RewardEntryKind, id: number): string {
  return `${slugPrefix[kind]}-${id}`;
}

// MasterSeasonPassMission.missionCategory: 1 is the daily rotation; the rest run for the whole pass.
const DAILY_MISSION_CATEGORY = 1;
// MasterLiveScoreRank.liveScoreRank 2–7, matching the D–SS rank icons.
const scoreRankLabels: Record<number, string> = { 2: "D", 3: "C", 4: "B", 5: "A", 6: "S", 7: "SS" };
const difficultyTextIds = ["ui_difficulty_easy", "ui_difficulty_normal", "ui_difficulty_hard", "ui_difficulty_expert"];
const highlightOrder: Record<RewardKind, number> = { member: 0, support: 1, music: 2, degree: 3, stamp: 4, spot: 5, item: 6, other: 7 };

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

function pickHighlights(rewards: RewardViewModel[], limit = 5): RewardViewModel[] {
  const seen = new Set<string>();
  return rewards
    .filter((reward) => {
      const key = `${reward.kind}:${reward.id}`;
      if (seen.has(key) || !reward.imageUrl) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => highlightOrder[a.kind] - highlightOrder[b.kind])
    .slice(0, limit);
}

export function normalizeRewardEntries(data: RewardsMasterData, resolve: RewardResolver, locale: AppLocale): RewardEntryDetail[] {
  const textMap = new Map(data.texts.map((row) => [row.id, row]));
  const text = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");
  const nameMap = (rows: Array<{ id: number; nameTextId?: string; nameTextID?: string }>) =>
    new Map(rows.map((row) => [row.id, text(row.nameTextId ?? row.nameTextID)]));
  const exchanges = nameMap(data.exchanges);
  const chapters = nameMap(data.chapters);
  const bands = nameMap(data.bands);
  const characters = nameMap(data.characters);
  const episodes = new Map(data.episodes.map((episode) => [episode.id, episode]));
  const advTitles = new Map(data.advs.map((adv) => [adv.id, adv.titleTextId]));
  const music = new Map(data.music.map((song) => [song.id, song.title]));

  const describe = (mission: RawMissionFields): string => {
    const episode = episodes.get(mission.episodeId);
    const values: Record<string, string> = {
      AchievementCount: mission.achievementCount.toLocaleString(locale),
      Value: String(mission.value),
      ExchangeId: exchanges.get(mission.exchangeId) ?? "",
      StoryChapterId: chapters.get(mission.storyChapterId) ?? "",
      // "Episode {EpisodeId.Value} \"{EpisodeId}\"": the number, then the episode's story title.
      EpisodeId: episode ? text(advTitles.get(episode.advId)) : "",
      "EpisodeId.Value": episode ? String(episode.episodeNumber) : "",
      BandId: bands.get(mission.bandId) ?? "",
      CharacterId: characters.get(mission.characterId) ?? "",
      MusicId: music.get(mission.musicId) ?? "",
      MusicDifficulty: text(difficultyTextIds[mission.musicDifficulty]),
      ScoreRank: scoreRankLabels[mission.scoreRank] ?? "",
      CardType: mission.cardType ? t(locale, `cards.attributes.${mission.cardType}`) : "",
    };
    // Unknown placeholders (e.g. {MissionCategory}) drop out; the sentence still reads naturally.
    return text(mission.descriptionTextId).replace(/\{([^}]+)\}/g, (_, key: string) => values[key] ?? "").replace(/[ \t]{2,}/g, " ").trim();
  };

  const resolveRows = (rowsById: Map<number, RawRewardRow>, ids: readonly number[]) =>
    ids.flatMap((id) => {
      const row = rowsById.get(id);
      return row ? [resolve(row)] : [];
    });

  const summary = (kind: RewardEntryKind, id: number, title: string, bannerUrl: string, startAt: string, endAt: string, rewards: RewardViewModel[]): RewardEntrySummary => ({
    slug: rewardEntrySlug(kind, id),
    kind,
    id,
    title,
    bannerUrl,
    startAt,
    endAt,
    highlights: pickHighlights(rewards),
    searchText: [title, ...rewards.map((reward) => reward.name), id].join(" ").toLocaleLowerCase(),
  });

  // Season passes
  const passRewardRows = new Map(data.seasonPassRewards.map((row) => [row.id, row]));
  const levelsByGroup = groupBy(data.seasonPassLevels, (level) => level.group);
  const levelRewardsByPass = groupBy(data.seasonPassLevelRewards, (reward) => reward.seasonPassId);
  const passMissions = groupBy(data.seasonPassMissions, (mission) => mission.seasonPassId);
  const seasonPasses = data.seasonPasses.map((pass): SeasonPassDetail => {
    const levelRewards = levelRewardsByPass.get(pass.id) ?? [];
    const featured = new Set(pass.recommendationLevelRewardIds ?? []);
    const levels = (levelsByGroup.get(pass.levelGroup) ?? [])
      .sort((a, b) => a.level - b.level)
      .map((level) => {
        const atLevel = levelRewards.filter((reward) => reward.level === level.level);
        const rewards = (premium: boolean) => atLevel.filter((reward) => reward.isPremium === premium).flatMap((reward) => resolveRows(passRewardRows, reward.rewardIds));
        return { level: level.level, point: level.point, free: rewards(false), premium: rewards(true), featured: atLevel.some((reward) => featured.has(reward.id)) };
      });
    const missionsByCategory = groupBy(
      [...(passMissions.get(pass.id) ?? [])].sort((a, b) => a.priority - b.priority || a.id - b.id),
      (mission) => (mission.missionCategory === DAILY_MISSION_CATEGORY ? "daily" as const : "normal" as const),
    );
    const allRewards = levels.flatMap((level) => [...level.free, ...level.premium]);
    return {
      ...summary("seasonPass", pass.id, text(pass.nameTextId) || `#${pass.id}`, pass.bannerAsset ? getImageAssetUrl(`SeasonPass/Banner/${pass.bannerAsset}`) : "", pass.startAt, pass.endAt, allRewards),
      kind: "seasonPass",
      description: text(pass.descriptionTextId),
      levels,
      missionGroups: (["daily", "normal"] as const).flatMap((category) => {
        const missions = missionsByCategory.get(category) ?? [];
        return missions.length ? [{ category, missions: missions.map((mission) => ({ id: mission.id, description: describe(mission), points: mission.seasonPassPoint, rewards: [] })) }] : [];
      }),
    };
  });

  // Login bonuses
  const slotsByBonus = groupBy(data.loginBonusSlots, (slot) => slot.loginBonusID);
  const loginBonuses = [...data.loginBonuses].sort((a, b) => a.priority - b.priority || a.id - b.id).map((bonus): LoginBonusDetail => {
    const slots = slotsByBonus.get(bonus.id) ?? [];
    const sheets = [...groupBy(slots, (slot) => slot.sheetNo)].sort(([a], [b]) => a - b).map(([sheet, sheetSlots]) => ({
      sheet,
      days: [...groupBy(sheetSlots, (slot) => slot.slotNo)].sort(([a], [b]) => a - b).map(([day, daySlots]) => ({
        day,
        decorated: daySlots.some((slot) => slot.isDecorated),
        rewards: daySlots.map((slot) => resolve(slot)),
      })),
    }));
    const allRewards = sheets.flatMap((sheet) => sheet.days.flatMap((day) => day.rewards));
    return {
      ...summary("loginBonus", bonus.id, text(bonus.nameTextID) || `#${bonus.id}`, getImageAssetUrl(bonus.sheetImageAsset), bonus.startAt, bonus.endAt, allRewards),
      kind: "loginBonus",
      isLoop: bonus.isLoop,
      sheets,
    };
  });

  // Limited missions
  const missionRewardRows = new Map(data.missionRewards.map((row) => [row.id, row]));
  const missionsByGroup = groupBy(data.missions, (mission) => mission.limitedMissionGroupId);
  const missionGroups = data.missionGroups.map((group): MissionGroupDetail => {
    const missions = [...(missionsByGroup.get(group.id) ?? [])].sort((a, b) => a.releaseDay - b.releaseDay || a.priority - b.priority || a.id - b.id);
    const days = [...groupBy(missions, (mission) => mission.releaseDay)].map(([day, dayMissions]) => ({
      day,
      missions: dayMissions.map((mission) => ({ id: mission.id, description: describe(mission), points: 0, rewards: resolveRows(missionRewardRows, mission.missionRewardIds ?? []) })),
    }));
    const completeRewards = resolveRows(missionRewardRows, group.completeRewardIds ?? []);
    const allRewards = [...completeRewards, ...days.flatMap((day) => day.missions.flatMap((mission) => mission.rewards))];
    return {
      ...summary("mission", group.id, text(group.nameTextID) || `#${group.id}`, group.bannerAsset ? getImageAssetUrl(`Image/Banner/${group.bannerAsset}`) : "", group.startAt, group.endAt, allRewards),
      kind: "mission",
      days,
      completeRewards,
    };
  });

  return [...seasonPasses, ...missionGroups, ...loginBonuses];
}

export function toRewardEntrySummary(entry: RewardEntryDetail): RewardEntrySummary {
  const { slug, kind, id, title, bannerUrl, startAt, endAt, highlights, searchText } = entry;
  return { slug, kind, id, title, bannerUrl, startAt, endAt, highlights, searchText };
}

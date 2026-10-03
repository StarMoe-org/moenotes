import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { describeMission, scoreRankLabel, type MissionDescribeContext } from "@/lib/missions/describe";
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

/** MasterMonthlyPass: a 30-day pass bought in the shop (MasterShopProduct resourceType 6 names it). */
export interface RawMonthlyPass {
  id: number;
  nameTextId: string;
  /** Passes of one group share their first-purchase and continuation rewards. */
  group: number;
  descriptionTextId: string;
  expireDays: number;
  /** Extra live skips a day while the pass runs. */
  addLiveSkip: number;
  /** Extra uses a day of "use all" (MasterData `_addConsumeAllUsageCount`). */
  addConsumeAllUsageCount: number;
  canSkipAd: boolean;
}

export interface RawMonthlyPassDailyReward extends RawResource {
  monthlyPassId: number;
  dayCount: number;
}

export interface RawMonthlyPassGroupReward extends RawResource {
  monthlyPassGroup: number;
  /** MasterMonthlyPassContinuationReward only: the purchase (2nd, 3rd, …) that grants it. */
  purchaseCount?: number;
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
  /** Monthly passes; optional so older fixtures (and servers without the tables) still normalize. */
  monthlyPasses?: RawMonthlyPass[];
  monthlyPassDailyRewards?: RawMonthlyPassDailyReward[];
  monthlyPassFirstTimeRewards?: RawMonthlyPassGroupReward[];
  monthlyPassContinuationRewards?: RawMonthlyPassGroupReward[];
  texts: RawText[];
}

export type RewardEntryKind = "seasonPass" | "loginBonus" | "mission" | "monthlyPass";

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

export interface MonthlyPassDetail extends RewardEntrySummary {
  kind: "monthlyPass";
  description: string;
  group: number;
  /** Days one purchase runs. */
  expireDays: number;
  addLiveSkip: number;
  addConsumeAllUsageCount: number;
  canSkipAd: boolean;
  /** Granted once, on the group's first purchase. */
  firstTimeRewards: RewardViewModel[];
  /** Granted on each login while the pass runs, by day of the pass. */
  dailyRewards: Array<{ day: number; rewards: RewardViewModel[] }>;
  /** Granted when the pass is bought again: the 2nd, 3rd, … purchase. */
  continuationRewards: Array<{ purchaseCount: number; rewards: RewardViewModel[] }>;
}

export type RewardEntryDetail = SeasonPassDetail | LoginBonusDetail | MissionGroupDetail | MonthlyPassDetail;

const slugPrefix: Record<RewardEntryKind, string> = { seasonPass: "season-pass", loginBonus: "login-bonus", mission: "missions", monthlyPass: "monthly-pass" };

export function rewardEntrySlug(kind: RewardEntryKind, id: number): string {
  return `${slugPrefix[kind]}-${id}`;
}

// MasterData resourceType of a pass handed out by a shop pack or a gacha product.
const RESOURCE_MONTHLY_PASS = 6;
const RESOURCE_SEASON_PASS = 10;
// MasterHomeBanner.displayType: 25 opens a season pass (contentId = its id), 4 a shop pack (contentId = MasterShop id).
const BANNER_SEASON_PASS = 25;
const BANNER_SHOP = 4;

/** The rewards page of a pass named as a resource (MasterShopProduct, gacha products): monthly 6, season 10; else null. */
export function passRewardSlug(resourceType: number, resourceId: number): string | null {
  if (!Number.isSafeInteger(resourceId) || resourceId <= 0) return null;
  if (resourceType === RESOURCE_MONTHLY_PASS) return rewardEntrySlug("monthlyPass", resourceId);
  if (resourceType === RESOURCE_SEASON_PASS) return rewardEntrySlug("seasonPass", resourceId);
  return null;
}

/**
 * The rewards page a home banner (MasterHomeBanner) promoting a pass leads to, or null. A season-pass banner
 * (displayType 25) names the pass by `contentId`; a shop banner (displayType 4) names a pack, whose MasterShopProduct
 * rows say which pass it sells (resourceType 6 monthly, 10 season). With `known` (the slugs the server's reward entries
 * have), a slug without a page is null as well.
 */
export function homeBannerPassSlug(
  banner: { displayType: number; contentId: number },
  shopProducts: ReadonlyArray<{ shopId: number; resourceType: number; resourceId: number }> = [],
  known?: ReadonlySet<string>,
): string | null {
  let slug: string | null = null;
  if (banner.displayType === BANNER_SEASON_PASS) slug = passRewardSlug(RESOURCE_SEASON_PASS, banner.contentId);
  else if (banner.displayType === BANNER_SHOP) {
    for (const product of shopProducts) {
      if (product.shopId !== banner.contentId) continue;
      slug = passRewardSlug(product.resourceType, product.resourceId);
      if (slug) break;
    }
  }
  return slug && (!known || known.has(slug)) ? slug : null;
}

/** Banner of a monthly pass: the client formats `Shop/Pass/Banner/{id:00000}`. */
export function monthlyPassBannerUrl(id: number, locale: AppLocale): string {
  return getImageAssetUrl(`Shop/Pass/Banner/${String(id).padStart(5, "0")}`, locale);
}

// MasterSeasonPassMission.missionCategory: 1 is the daily rotation; the rest run for the whole pass.
const DAILY_MISSION_CATEGORY = 1;
// MasterLiveScoreRank.liveScoreRank 2–7, matching the D–SS rank icons (labels live with the shared mission helper).
export { scoreRankLabel };
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

  const describeContext: MissionDescribeContext = {
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
  const describe = (mission: RawMissionFields): string => describeMission(mission, describeContext);

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
      ...summary("seasonPass", pass.id, text(pass.nameTextId) || `#${pass.id}`, pass.bannerAsset ? getImageAssetUrl(`SeasonPass/Banner/${pass.bannerAsset}`, locale) : "", pass.startAt, pass.endAt, allRewards),
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
      ...summary("loginBonus", bonus.id, text(bonus.nameTextID) || `#${bonus.id}`, getImageAssetUrl(bonus.sheetImageAsset, locale), bonus.startAt, bonus.endAt, allRewards),
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
      ...summary("mission", group.id, text(group.nameTextID) || `#${group.id}`, group.bannerAsset ? getImageAssetUrl(`Image/Banner/${group.bannerAsset}`, locale) : "", group.startAt, group.endAt, allRewards),
      kind: "mission",
      days,
      completeRewards,
    };
  });

  // Monthly passes: no window of their own (the shop pack selling them has one).
  const passDaily = groupBy(data.monthlyPassDailyRewards ?? [], (row) => row.monthlyPassId);
  const firstTimeByGroup = groupBy(data.monthlyPassFirstTimeRewards ?? [], (row) => row.monthlyPassGroup);
  const continuationByGroup = groupBy(data.monthlyPassContinuationRewards ?? [], (row) => row.monthlyPassGroup);
  const monthlyPasses = [...(data.monthlyPasses ?? [])].sort((a, b) => a.id - b.id).map((pass): MonthlyPassDetail => {
    const dailyRewards = [...groupBy(passDaily.get(pass.id) ?? [], (row) => row.dayCount)]
      .sort(([a], [b]) => a - b)
      .map(([day, rows]) => ({ day, rewards: rows.map((row) => resolve(row)) }));
    const firstTimeRewards = (firstTimeByGroup.get(pass.group) ?? []).map((row) => resolve(row));
    const continuationRewards = [...groupBy(continuationByGroup.get(pass.group) ?? [], (row) => row.purchaseCount ?? 0)]
      .sort(([a], [b]) => a - b)
      .map(([purchaseCount, rows]) => ({ purchaseCount, rewards: rows.map((row) => resolve(row)) }));
    const allRewards = [...firstTimeRewards, ...dailyRewards.flatMap((day) => day.rewards), ...continuationRewards.flatMap((entry) => entry.rewards)];
    return {
      ...summary("monthlyPass", pass.id, text(pass.nameTextId) || `#${pass.id}`, monthlyPassBannerUrl(pass.id, locale), "", "", allRewards),
      kind: "monthlyPass",
      description: text(pass.descriptionTextId),
      group: pass.group,
      expireDays: Math.max(0, pass.expireDays),
      addLiveSkip: Math.max(0, pass.addLiveSkip),
      addConsumeAllUsageCount: Math.max(0, pass.addConsumeAllUsageCount),
      canSkipAd: Boolean(pass.canSkipAd),
      firstTimeRewards,
      dailyRewards,
      continuationRewards,
    };
  });

  return [...seasonPasses, ...monthlyPasses, ...missionGroups, ...loginBonuses];
}

export function toRewardEntrySummary(entry: RewardEntryDetail): RewardEntrySummary {
  const { slug, kind, id, title, bannerUrl, startAt, endAt, highlights, searchText } = entry;
  return { slug, kind, id, title, bannerUrl, startAt, endAt, highlights, searchText };
}

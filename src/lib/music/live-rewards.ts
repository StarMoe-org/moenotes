import type { RawResource, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";
import { MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { SCORE_RANK_LABELS } from "@/lib/music/data";

/** MasterLiveMusicComboReward row: one reward of one combo tier of one difficulty in a reward group. */
export interface RawLiveMusicComboReward extends RawResource {
  id: number;
  group: number;
  /** 0 Easy, 1 Normal, 2 Hard, 3 Expert. */
  difficulty: number;
  /** 0 25 %, 1 50 %, 2 75 %, 3 100 % (full combo). */
  comboRateType: number;
}

/** MasterLiveMusicExpReward row: what a live pays per score rank (every song alike). */
export interface RawLiveMusicExpReward {
  id: number;
  liveScoreRank: number;
  playerExp?: number;
  memberCardExp?: number;
  friendshipExp?: number;
  eventPoint?: number;
  characterRankExp?: number;
  livePoint?: number;
  circlePoint?: number;
}

/** The combo share each `comboRateType` stands for. */
export const COMBO_RATE_PERCENTS: readonly number[] = [25, 50, 75, 100];

export interface MusicComboTierModel {
  /** 25, 50, 75 or 100. */
  percent: number;
  rewards: RewardViewModel[];
}

export interface MusicComboTiersModel {
  difficulty: MusicDifficulty;
  tiers: MusicComboTierModel[];
}

/**
 * The combo tier rewards of a song's reward group, per difficulty (in difficulty order) and tier (25 → 100 %). Rows of
 * other groups, unknown difficulties or tiers are skipped.
 */
export function buildComboTiers(rows: readonly RawLiveMusicComboReward[], group: number | null | undefined, resolve: RewardResolver): MusicComboTiersModel[] {
  if (typeof group !== "number" || group <= 0) return [];
  const byDifficulty = new Map<MusicDifficulty, Map<number, RewardViewModel[]>>();
  for (const row of rows) {
    if (row.group !== group) continue;
    const difficulty = MUSIC_DIFFICULTIES[row.difficulty];
    const percent = COMBO_RATE_PERCENTS[row.comboRateType];
    if (!difficulty || percent === undefined) continue;
    const tiers = byDifficulty.get(difficulty) ?? new Map<number, RewardViewModel[]>();
    byDifficulty.set(difficulty, tiers);
    const list = tiers.get(percent) ?? [];
    tiers.set(percent, list);
    list.push(resolve(row));
  }
  return MUSIC_DIFFICULTIES.flatMap((difficulty) => {
    const tiers = byDifficulty.get(difficulty);
    if (!tiers) return [];
    return [{ difficulty, tiers: [...tiers].sort(([a], [b]) => a - b).map(([percent, rewards]) => ({ percent, rewards })) }];
  });
}

/** The figures an exp reward row pays, in display order; zero figures are kept so that every rank lines up. */
export const EXP_REWARD_FIELDS = ["playerExp", "memberCardExp", "friendshipExp", "characterRankExp", "eventPoint", "livePoint", "circlePoint"] as const;
export type ExpRewardField = typeof EXP_REWARD_FIELDS[number];

export interface MusicExpRewardModel {
  /** "D" … "SS". */
  rank: string;
  liveScoreRank: number;
  values: Record<ExpRewardField, number>;
}

export interface MusicExpRewardsModel {
  /** Figures some rank pays (columns of an all-zero figure are left out). */
  fields: ExpRewardField[];
  ranks: MusicExpRewardModel[];
}

/** The exp reward ladder (D → SS), with the figures any rank pays. */
export function buildExpRewards(rows: readonly RawLiveMusicExpReward[]): MusicExpRewardsModel {
  const ranks = [...rows]
    .filter((row) => typeof row.liveScoreRank === "number")
    .sort((a, b) => a.liveScoreRank - b.liveScoreRank)
    .map((row) => ({
      rank: SCORE_RANK_LABELS[row.liveScoreRank] ?? String(row.liveScoreRank),
      liveScoreRank: row.liveScoreRank,
      values: Object.fromEntries(EXP_REWARD_FIELDS.map((field) => {
        const value = row[field];
        return [field, typeof value === "number" && Number.isFinite(value) ? value : 0];
      })) as Record<ExpRewardField, number>,
    }));
  const fields = EXP_REWARD_FIELDS.filter((field) => ranks.some((rank) => rank.values[field] !== 0));
  return { fields, ranks };
}

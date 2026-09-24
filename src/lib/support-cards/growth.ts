import { buildLevelCurve, type ParameterRates, type RawCardLevel } from "@/lib/cards/growth";

export interface RawSupportCardRank {
  group: number;
  rank: number;
  limitLevel: number;
  supportSkill01Level: number;
  gekisouSupportSkill01Level: number;
}

// Masterdata "rank" is the in-game "Limit Break": it raises the level cap and skill levels.
export interface SupportCardRankStep {
  rank: number;
  limitLevel: number;
  supportSkillLevel: number;
  gekisouSupportSkillLevel: number;
}

export interface SupportCardGrowth {
  /** Indexed by `level - 1`. */
  levelCurve: ParameterRates[];
  rankSteps: SupportCardRankStep[];
}

export function buildSupportCardGrowth(
  card: { supportCardLevelGroup: number; supportCardRankGroup: number },
  levels: RawCardLevel[],
  ranks: RawSupportCardRank[],
): SupportCardGrowth {
  const levelCurve = buildLevelCurve(levels, card.supportCardLevelGroup);
  return {
    levelCurve,
    rankSteps: ranks
      .filter((row) => row.group === card.supportCardRankGroup)
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({
        rank: row.rank,
        limitLevel: Math.min(row.limitLevel, levelCurve.length),
        supportSkillLevel: row.supportSkill01Level,
        gekisouSupportSkillLevel: row.gekisouSupportSkill01Level,
      })),
  };
}

export interface SupportCardBuild {
  level: number;
  rank: number;
}

export function maxSupportCardBuild(growth: SupportCardGrowth): SupportCardBuild {
  const step = growth.rankSteps[growth.rankSteps.length - 1];
  return { level: step?.limitLevel ?? growth.levelCurve.length, rank: step?.rank ?? 0 };
}

export function supportCardLevelLimit(growth: SupportCardGrowth, rank: number): number {
  return growth.rankSteps.find((step) => step.rank === rank)?.limitLevel ?? growth.levelCurve.length;
}

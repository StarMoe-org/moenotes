import type { SkillLevelViewModel, SkillViewModel } from "@/lib/cards/skills";

/** Masterdata rates are fixed-point with 10000 = 100%. */
const RATE_SCALE = 10000;
const NO_RATES: ParameterRates = [0, 0, 0];

/** [performance, technic, visual] rates in 1/10000. */
export type ParameterRates = [number, number, number];

export interface CardParameters {
  performancePower: number;
  technicPower: number;
  visualPower: number;
  totalPower: number;
}

type BaseParameters = Pick<CardParameters, "performancePower" | "technicPower" | "visualPower">;

export interface RawCardLevel {
  group: number;
  level: number;
  performanceRate: number;
  technicRate: number;
  visualRate: number;
}

export interface RawMemberCardLevelLimit {
  rarity: number;
  awakeCount: number;
  limitLevel: number;
}

export interface RawMemberCardAwake {
  group: number;
  awakeCount: number;
  performanceRate: number;
  technicRate: number;
  visualRate: number;
}

export interface RawMemberCardRank {
  group: number;
  rank: number;
  performanceRate: number;
  technicRate: number;
  visualRate: number;
  leaderSkillLevel: number;
}

// Masterdata "awake" is the in-game "Training" (tokkun): it raises the level cap and parameters.
export interface MemberCardAwakeStep {
  awakeCount: number;
  limitLevel: number;
  rates: ParameterRates;
}

// Masterdata "rank" is the in-game "Awaken" (kakusei): it raises parameters and the leader skill level.
export interface MemberCardRankStep {
  rank: number;
  leaderSkillLevel: number;
  rates: ParameterRates;
}

export interface MemberCardGrowth {
  /** Indexed by `level - 1`. */
  levelCurve: ParameterRates[];
  awakeSteps: MemberCardAwakeStep[];
  rankSteps: MemberCardRankStep[];
}

export interface MemberCardBuild {
  level: number;
  awakeCount: number;
  rank: number;
}

export function buildLevelCurve(rows: RawCardLevel[], group: number): ParameterRates[] {
  const byLevel = new Map<number, ParameterRates>();
  rows.forEach((row) => {
    if (row.group === group) byLevel.set(row.level, [row.performanceRate, row.technicRate, row.visualRate]);
  });
  const curve: ParameterRates[] = [];
  const maxLevel = Math.max(0, ...byLevel.keys());
  for (let level = 1; level <= maxLevel; level += 1) {
    curve.push(byLevel.get(level) ?? curve[curve.length - 1] ?? NO_RATES);
  }
  return curve;
}

export function buildMemberCardGrowth(
  card: { rarity: number; memberCardLevelGroup: number; memberCardAwakeGroup: number; memberCardRankGroup: number },
  levels: RawCardLevel[],
  levelLimits: RawMemberCardLevelLimit[],
  awakes: RawMemberCardAwake[],
  ranks: RawMemberCardRank[],
): MemberCardGrowth {
  const levelCurve = buildLevelCurve(levels, card.memberCardLevelGroup);
  const limitByAwake = new Map(
    levelLimits.filter((row) => row.rarity === card.rarity).map((row) => [row.awakeCount, row.limitLevel]),
  );
  return {
    levelCurve,
    awakeSteps: awakes
      .filter((row) => row.group === card.memberCardAwakeGroup)
      .sort((a, b) => a.awakeCount - b.awakeCount)
      .map((row) => ({
        awakeCount: row.awakeCount,
        limitLevel: Math.min(limitByAwake.get(row.awakeCount) ?? levelCurve.length, levelCurve.length),
        rates: [row.performanceRate, row.technicRate, row.visualRate],
      })),
    rankSteps: ranks
      .filter((row) => row.group === card.memberCardRankGroup)
      .sort((a, b) => a.rank - b.rank)
      .map((row) => ({
        rank: row.rank,
        leaderSkillLevel: row.leaderSkillLevel,
        rates: [row.performanceRate, row.technicRate, row.visualRate],
      })),
  };
}

export function maxMemberCardBuild(growth: MemberCardGrowth): MemberCardBuild {
  const awake = growth.awakeSteps[growth.awakeSteps.length - 1];
  return {
    level: awake?.limitLevel ?? growth.levelCurve.length,
    awakeCount: awake?.awakeCount ?? 0,
    rank: growth.rankSteps[growth.rankSteps.length - 1]?.rank ?? 0,
  };
}

export function memberCardLevelLimit(growth: MemberCardGrowth, awakeCount: number): number {
  return growth.awakeSteps.find((step) => step.awakeCount === awakeCount)?.limitLevel ?? growth.levelCurve.length;
}

/**
 * Mirrors the client's App.Local.MemberCard.get_Power: level, awake and rank terms are floored
 * separately in float32 and summed. Memory bonuses are not modelled.
 */
export function memberCardParameters(card: BaseParameters, growth: MemberCardGrowth, build: MemberCardBuild): CardParameters {
  const levelRates = levelRatesAt(growth.levelCurve, build.level);
  if (!levelRates) return withTotal(card);
  const awakeRates = growth.awakeSteps.find((step) => step.awakeCount === build.awakeCount)?.rates ?? NO_RATES;
  const rankRates = growth.rankSteps.find((step) => step.rank === build.rank)?.rates ?? NO_RATES;
  const scale = (max: number, index: 0 | 1 | 2) =>
    scaleByRate(max, levelRates[index]) + scaleByRateFactor(max, awakeRates[index]) + scaleByRate(max, rankRates[index]);
  return withTotal({
    performancePower: scale(card.performancePower, 0),
    technicPower: scale(card.technicPower, 1),
    visualPower: scale(card.visualPower, 2),
  });
}

export function levelParameters(card: BaseParameters, levelCurve: ParameterRates[], level: number): CardParameters {
  const rates = levelRatesAt(levelCurve, level);
  if (!rates) return withTotal(card);
  return withTotal({
    performancePower: scaleByRate(card.performancePower, rates[0]),
    technicPower: scaleByRate(card.technicPower, rates[1]),
    visualPower: scaleByRate(card.visualPower, rates[2]),
  });
}

/** Picks the highest defined skill level that does not exceed `level`. */
export function pickSkillLevel(skill: SkillViewModel, level: number): SkillLevelViewModel {
  let picked = skill.levels[0]!;
  for (const entry of skill.levels) {
    if (entry.level <= level) picked = entry;
  }
  return picked;
}

export function maxSkillLevel(skill: SkillViewModel): number {
  return skill.levels[skill.levels.length - 1]?.level ?? 1;
}

function levelRatesAt(curve: ParameterRates[], level: number): ParameterRates | undefined {
  return curve[Math.min(Math.max(level, 1), curve.length) - 1];
}

// FloorToInt((float)(rate * max) / 1e4f)
function scaleByRate(max: number, rate: number): number {
  return Math.floor(Math.fround(Math.fround(rate * max) / RATE_SCALE));
}

// FloorToInt(((float)rate / 1e4f) * max) — the client's awake term multiplies in this order.
function scaleByRateFactor(max: number, rate: number): number {
  return Math.floor(Math.fround(Math.fround(rate / RATE_SCALE) * Math.fround(max)));
}

function withTotal(parameters: BaseParameters): CardParameters {
  return {
    performancePower: parameters.performancePower,
    technicPower: parameters.technicPower,
    visualPower: parameters.visualPower,
    totalPower: parameters.performancePower + parameters.technicPower + parameters.visualPower,
  };
}

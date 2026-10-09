import type { SnapMeasuredRank, SnapMeasuredRow } from "./snap-client";
import type { SnapPowerDomain, SnapRankProgress, SnapRankResult } from "./snap-types";

export const SNAP_ORDER_MODEL = "uniformSkillOrder120" as const;
export const SNAP_POWER_DOMAIN: Readonly<SnapPowerDomain> = Object.freeze({ min: 1, max: 20000000 });
export interface SnapRankIdentity { scoreId: number; power: number; threshold: number; powerDomain: SnapPowerDomain }

/** Verify the native transport's result identity and exact integer statistics. */
export function parseSnapRankProgress(json: string, expected: SnapRankIdentity): SnapRankProgress {
  const value = JSON.parse(json) as SnapRankProgress;
  const invalid = (): never => { throw new Error("Replay rank returned an invalid or mismatched result"); };
  if (!value || value.format !== "ournotes.replay-rank-result/1" || value.totalOrders !== 120
    || !Number.isInteger(value.completedOrders) || value.completedOrders < 0 || value.completedOrders > 120) invalid();
  if (value.status === "running") {
    if (value.result !== null || value.completedOrders === 120) invalid();
  } else if (value.status === "unsupported") {
    if (value.result !== null || typeof value.code !== "string" || typeof value.reason !== "string") invalid();
  } else if (value.status === "complete") {
    const result = value.result;
    if (!result || value.completedOrders !== 120 || result.scoreId !== expected.scoreId || result.power !== expected.power
      || result.threshold !== expected.threshold || result.orderModel !== SNAP_ORDER_MODEL || result.orderCount !== 120
      || result.powerDomain?.min !== expected.powerDomain.min || result.powerDomain.max !== expected.powerDomain.max
      || !Array.isArray(result.orderScores) || result.orderScores.length !== 120
      || result.orderScores.some(score => !Number.isInteger(score) || score < -2147483648 || score > 2147483647)) invalid();
    const complete = result!;
    if (complete.scoreSum !== complete.orderScores.reduce((sum, score) => sum + score, 0)
      || complete.minScore !== Math.min(...complete.orderScores) || complete.maxScore !== Math.max(...complete.orderScores)
      || complete.targetHitCount !== complete.orderScores.filter(score => score >= expected.threshold).length) invalid();
    const need = complete.need;
    if (need?.status === "exact") {
      if (!Number.isInteger(need.power) || need.power < expected.powerDomain.min || need.power > expected.powerDomain.max
        || !Number.isSafeInteger(need.scoreSum) || need.scoreSum < expected.threshold * 120
        || (need.power === expected.powerDomain.min ? need.previousScoreSum !== null
          : !Number.isSafeInteger(need.previousScoreSum) || need.previousScoreSum! >= expected.threshold * 120)) invalid();
    } else if (need?.status === "unproven") {
      if (typeof need.reason !== "string") invalid();
    } else if (need?.status !== "outsideDomain") invalid();
  } else invalid();
  return value;
}

/** Select only the current target's complete distribution, even before a new Worker effect runs. */
export function currentSnapRank(row: SnapMeasuredRow | undefined, threshold: number | null, power: number): SnapMeasuredRank | { status: "pending" } {
  if (threshold === null) return { status: "no-threshold" };
  if (!row?.rank) return { status: "pending" };
  if (row.rank.status === "complete" && (row.rank.result.threshold !== threshold || row.rank.result.power !== power)) return { status: "pending" };
  return row.rank;
}

export function snapRankStatusKey(rank: ReturnType<typeof currentSnapRank>): string {
  if (rank.status === "complete") return "snap.rank.complete";
  if (rank.status === "unsupported") return rank.code === "engine-capability" ? "snap.rank.engineUnavailable" : "snap.rank.unsupported";
  return rank.status === "no-threshold" ? "snap.rank.noThreshold" : rank.status === "error" ? "snap.rank.error" : "snap.rank.pending";
}

/** Both ranking and detail views use the same complete-order metrics. */
export function snapRankFigures(result: SnapRankResult, cycleMs: number | null) {
  const chance = result.targetHitCount / result.orderCount;
  const perHour = cycleMs !== null && cycleMs > 0 ? 3600000 / cycleMs : null;
  return { score: result.scoreSum / result.orderCount, chance, perHour,
    goal: perHour === null ? null : chance * perHour,
    need: result.need.status === "exact" ? result.need.power : null };
}

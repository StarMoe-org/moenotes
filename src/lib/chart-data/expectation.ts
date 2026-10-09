import { BEST_BATTLE, clampRank, greatFactor, rankPercent, type Scenario } from "./scenario";
import type { ChartDeck, DeckExpectation, DeckRange, Estimate } from "./types";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
export const isEstimate = (v: unknown): v is Estimate => Array.isArray(v) && v.length === 2
  && finite(v[0]) && finite(v[1]) && v[1] >= 0 && finite(v[0] - v[1]) && finite(v[0] + v[1]);
export const hasNominalStatistics = (deck: ChartDeck | null | undefined): boolean => !!deck && typeof deck === "object"
  && ("expectation" in deck || "replaySeeds" in deck);

export interface ExpectationFigures {
  score: number;
  weights: number[];
  /** Available for the original measured endpoint; transformed scenarios retain their documented approximations. */
  scoreBounds: readonly [number, number] | null;
}

/** Nominal means have their own rank arithmetic: truncating a mean does not give the expected native bonus. */
export function scenarioExpectation(
  expected: DeckExpectation | null | undefined,
  ranges: readonly DeckRange[],
  kind: number,
  scenario: Scenario | null | undefined,
): ExpectationFigures | null {
  const sc = { ...BEST_BATTLE, ...(scenario ?? {}) };
  const row = expected?.weights?.[kind];
  if (!expected || sc.id === "free" || !Array.isArray(ranges) || ranges.some(r => !r || typeof r !== "object")
    || !Array.isArray(expected.ranges) || expected.ranges.length !== ranges.length
    || expected.ranges.some(r => !r || typeof r !== "object")
    || !isEstimate(expected.score) || !Array.isArray(row) || !row.every(isEstimate)) return null;
  const just = finite(sc.just) ? Math.max(0, Math.min(1, sc.just)) : 1;
  const great = greatFactor(sc.great);
  const ranks = ranges.map((_, i) => clampRank(sc.ranks?.[i]));
  const rank1 = ranks.every(r => r === 1);
  if (rank1 && just === 1) return {
    score: expected.score[0] * great,
    weights: row.map(v => v[0] * great),
    scoreBounds: great === 1 ? [expected.score[0] - expected.score[1], expected.score[0] + expected.score[1]] : null,
  };
  if (!isEstimate(expected.scorePerfect)) return null;
  const rw = expected.rangeWeights?.[kind];
  if (!Array.isArray(rw) || rw.length !== row.length || !rw.every(r => Array.isArray(r) && r.length === ranges.length && r.every(isEstimate))) return null;
  const p1 = ranges.map(r => rankPercent(r, 1));
  const pr = ranges.map((r, i) => rankPercent(r, ranks[i]!));
  if (p1.some(p => p === null) || pr.some(p => p === null)) return null;
  if (!expected.ranges.every(r => isEstimate(r.rangeScore) && isEstimate(r.rangeScorePerfect)
    && isEstimate(r.rankBonus) && isEstimate(r.rankBonusPerfect))) return null;
  const lerp = (perfect: number, best: number) => perfect + just * (best - perfect);
  let score = lerp(expected.scorePerfect[0], expected.score[0]);
  const weights = row.map(v => v[0]);
  expected.ranges.forEach((r, i) => {
    const rangeScore = lerp(r.rangeScorePerfect[0], r.rangeScore[0]);
    // At rank 1 retain the measured expectation, including its native truncation.
    if (ranks[i] !== 1) score += rangeScore * pr[i]! / 100 - lerp(r.rankBonusPerfect[0], r.rankBonus[0]);
    const ratio = r.rangeScore[0] > 0 ? rangeScore / r.rangeScore[0] : 1;
    weights.forEach((_, k) => {
      weights[k]! += ((pr[i]! - p1[i]!) / 100 + (ratio - 1) * (1 + pr[i]! / 100)) * rw[k]![i]![0];
    });
  });
  if (!finite(score) || !weights.every(finite)) return null;
  return { score: score * great, weights: weights.map(w => w * great), scoreBounds: null };
}

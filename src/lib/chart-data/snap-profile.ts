import type { ChartRow } from "./catalog";
import { DIFFICULTIES, rankThreshold } from "./ranking";
import { SNAP_ORDER_MODEL, SNAP_POWER_DOMAIN } from "./snap-rank";
import type { ChartDataState } from "./query";
import { snapMemberContext } from "./snap-catalogue";
import type { FiveSlots, SnapDeckData, SnapEvaluationProfile, SnapMemberContext } from "./snap-types";
import { emptySnapRanking, snapProfileKey, snapSourceKey, type SnapRankRequest, type SnapRankingSource, type SnapRankingState } from "./snap-client";
import { validateSnapFormation, type SnapLegalityContext, type SnapLegalityIssue } from "./snap-legality";

/** A reproducible standard profile. This is a measurement, not an ownership or shuffle model. */
export function chartSnapProfile(state: ChartDataState, data?: SnapDeckData, legality?: SnapLegalityContext): { profile: SnapEvaluationProfile; invalidMembers: number[]; issues: SnapLegalityIssue[] } {
  const invalidMembers: number[] = [];
  const pairedMembers = state.snapMembers.map((selection, slot) => {
    if (!selection || !data) return null;
    try { return snapMemberContext(data, selection.memberId, selection.gekisouLevel); }
    catch { invalidMembers.push(slot); return null; }
  }) as unknown as FiveSlots<SnapMemberContext | null>;
  return {
    invalidMembers,
    issues: legality ? validateSnapFormation(state, legality) : [],
    profile: {
      memberSkillPercent: state.skills.slice(0, 5) as unknown as FiveSlots<number>,
      selections: state.snapSkills,
      pairedMembers,
      power: state.power,
      mode: state.mode === "free" ? { kind: "normal" } : { kind: "fixedSoloGekisou", ranks: [state.ranks[0] ?? 1, state.ranks[1] ?? 1, state.ranks[2] ?? 1] },
      seed: 1,
      fps: 60,
      greatFraction: state.great / 100,
      justFraction: state.mode === "free" ? 0 : state.just / 100,
      skillOrder: [0, 1, 2, 3, 4],
    },
  };
}

/** Invalid URL member IDs must clear displayed rows before the Controller's next effect runs. */
export function snapDisplayedMeasurement(evaluation: ReturnType<typeof chartSnapProfile>, source: SnapRankingSource | null, measurement: SnapRankingState, analysis?: SnapRankRequest): SnapRankingState {
  return evaluation.invalidMembers.length || evaluation.issues.length ? { ...emptySnapRanking(snapProfileKey(evaluation.profile, analysis)),
    sourceKey: source ? snapSourceKey(source) : "", status: "needs-context",
    ...(evaluation.issues.length ? { error: { code: "invalid-selection", message: "" } } : {}) } : measurement;
}

/** Visible ranking measurements, with the open detail first and rank work limited to the visible rank scope. */
export function snapMeasurementPlan(rows: readonly ChartRow[], state: ChartDataState | null): { scoreIds: number[]; analysis?: SnapRankRequest } {
  if (!state) return { scoreIds: [] };
  const byScore = new Map(rows.map(row => [row.scoreId, row]));
  const detail = state.chart !== null && byScore.has(state.chart) ? [state.chart] : [];
  const pool = state.view === "rank" ? rows.filter(row => state.diffs.includes(row.difficulty as typeof DIFFICULTIES[number])
    && (!state.band || row.bandIds.map(String).includes(state.band))).map(row => row.scoreId) : [];
  const scoreIds = [...new Set([...detail, ...pool])];
  const targets = state.view === "rank" && state.rankBy === "event" ? scoreIds : detail;
  return { scoreIds, ...(targets.length ? { analysis: {
    model: SNAP_ORDER_MODEL, target: state.target, powerDomain: { ...SNAP_POWER_DOMAIN },
    targets: [...targets].sort((a, b) => a - b).map(scoreId => ({ scoreId, threshold: rankThreshold(byScore.get(scoreId)!, state.target, 0) })),
  } } : {}) };
}

import type { ChartDataState } from "./query";
import { snapMemberContext } from "./snap-catalogue";
import type { FiveSlots, SnapDeckData, SnapEvaluationProfile, SnapMemberContext } from "./snap-types";
import { emptySnapRanking, snapProfileKey, snapSourceKey, type SnapRankingSource, type SnapRankingState } from "./snap-client";

/** A reproducible standard profile. This is a measurement, not an ownership or shuffle model. */
export function chartSnapProfile(state: ChartDataState, data?: SnapDeckData): { profile: SnapEvaluationProfile; invalidMembers: number[] } {
  const invalidMembers: number[] = [];
  const pairedMembers = state.snapMembers.map((selection, slot) => {
    if (!selection || !data) return null;
    try { return snapMemberContext(data, selection.memberId, selection.gekisouLevel); }
    catch { invalidMembers.push(slot); return null; }
  }) as unknown as FiveSlots<SnapMemberContext | null>;
  return {
    invalidMembers,
    profile: {
      memberSkillPercent: state.skills.slice(0, 5) as unknown as FiveSlots<number>,
      selections: state.snapSkills,
      pairedMembers,
      power: state.snapPower,
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
export function snapDisplayedMeasurement(evaluation: ReturnType<typeof chartSnapProfile>, source: SnapRankingSource | null, measurement: SnapRankingState): SnapRankingState {
  return evaluation.invalidMembers.length ? { ...emptySnapRanking(snapProfileKey(evaluation.profile)),
    sourceKey: source ? snapSourceKey(source) : "", status: "needs-context" } : measurement;
}

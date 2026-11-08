import type { CardBox } from "@/lib/box/model";

export const MAX_GEKISO_COUNT = 2_147_483_647;

export function validGekisoCount(value: number, minimum: number): boolean {
  return Number.isSafeInteger(value) && value >= minimum && value <= MAX_GEKISO_COUNT;
}

export function validMissionMemberMinimums(counts: readonly [number, number, number]): boolean {
  return (
    counts.length === 3
    && counts.every((v) => Number.isSafeInteger(v) && v >= 0 && v <= 5)
    && counts[0] + counts[1] + counts[2] <= 5
  );
}

export interface FeasibilityMemberCard {
  readonly id: number;
  readonly characterId: number;
  readonly gekisouMissionType?: number;
}

export interface FeasibilityConstraints {
  readonly includeMembers: readonly string[];
  readonly excludeMembers: readonly string[];
  readonly leader?: string | null;
  readonly minMissionMembers?: readonly [number, number, number];
}

export type DeckFeasibilityIssue =
  | { readonly code: "invalid_gekiso_count"; readonly field: "minComboBonus" | "luckSamples" | "minJustWindowMs" }
  | { readonly code: "invalid_mission_member_sum"; readonly sum: number }
  | { readonly code: "mission_members_unreachable"; readonly missionIndex: 0 | 1 | 2; readonly required: number; readonly available: number }
  | { readonly code: "character_conflict_or_shortage"; readonly availableCharacters: number };

/**
 * Pre-submit conservative feasibility check for Gekisou member mission counts and character uniqueness (`5398de2`, `9b68b59`).
 * Returns `null` when feasible (or when Box state does not restrict the check).
 */
export function checkGekisoConstraintFeasibility(options: {
  readonly box: CardBox | null;
  readonly memberCatalog: ReadonlyMap<number, FeasibilityMemberCard>;
  readonly constraints: FeasibilityConstraints;
  readonly minComboBonus?: number;
  readonly luckSamples?: number;
  readonly minJustWindowMs?: number;
}): DeckFeasibilityIssue | null {
  const { box, memberCatalog, constraints, minComboBonus, luckSamples, minJustWindowMs } = options;

  if (minComboBonus !== undefined && !validGekisoCount(minComboBonus, 1)) {
    return { code: "invalid_gekiso_count", field: "minComboBonus" };
  }
  if (luckSamples !== undefined && !validGekisoCount(luckSamples, 0)) {
    return { code: "invalid_gekiso_count", field: "luckSamples" };
  }
  if (minJustWindowMs !== undefined && (!Number.isFinite(minJustWindowMs) || minJustWindowMs < 0 || minJustWindowMs > MAX_GEKISO_COUNT)) {
    return { code: "invalid_gekiso_count", field: "minJustWindowMs" };
  }

  const missionMinimums = constraints.minMissionMembers ?? [0, 0, 0];
  if (!validMissionMemberMinimums(missionMinimums)) {
    return { code: "invalid_mission_member_sum", sum: missionMinimums[0] + missionMinimums[1] + missionMinimums[2] };
  }

  if (!box) return null;

  const excludedIds = new Set(constraints.excludeMembers);
  const ownedMemberIds = new Set<string>();
  for (const card of box.cards) {
    if (card.kind !== "member" || !card.identity.value) continue;
    if (excludedIds.has(card.identity.value)) continue;
    ownedMemberIds.add(card.identity.value);
  }

  const fixedIds = new Set<string>(constraints.includeMembers);
  if (constraints.leader) fixedIds.add(constraints.leader);
  const fixedCharacters = new Set<number>();
  for (const idStr of fixedIds) {
    if (!ownedMemberIds.has(idStr)) {
      return { code: "character_conflict_or_shortage", availableCharacters: 0 };
    }
    const meta = memberCatalog.get(Number(idStr));
    if (meta) {
      if (fixedCharacters.has(meta.characterId)) {
        return { code: "character_conflict_or_shortage", availableCharacters: fixedCharacters.size };
      }
      fixedCharacters.add(meta.characterId);
    }
  }
  if (fixedIds.size > 5) {
    return { code: "character_conflict_or_shortage", availableCharacters: fixedCharacters.size };
  }

  const allCharacters = new Set<number>();
  // Mission types in MasterGekisouSkill: 1 = COMBO, 2 = LUCK, 3 = JUST, 4 = ALL (counts toward every mission type).
  const charsPerMission: [Set<number>, Set<number>, Set<number>] = [new Set(), new Set(), new Set()];
  let hasMissionMetadata = false;

  for (const idStr of ownedMemberIds) {
    const meta = memberCatalog.get(Number(idStr));
    if (!meta) continue;
    // If another card of this character is already fixed, only that fixed card can represent this character!
    if (fixedCharacters.has(meta.characterId) && !fixedIds.has(idStr)) continue;
    allCharacters.add(meta.characterId);
    if (typeof meta.gekisouMissionType === "number" && meta.gekisouMissionType > 0) {
      hasMissionMetadata = true;
      const mt = meta.gekisouMissionType;
      if (mt === 1 || mt === 4) charsPerMission[0].add(meta.characterId);
      if (mt === 2 || mt === 4) charsPerMission[1].add(meta.characterId);
      if (mt === 3 || mt === 4) charsPerMission[2].add(meta.characterId);
    }
  }

  if (memberCatalog.size > 0 && allCharacters.size < 5) {
    return { code: "character_conflict_or_shortage", availableCharacters: allCharacters.size };
  }

  if (hasMissionMetadata) {
    for (const idx of [0, 1, 2] as const) {
      const req = missionMinimums[idx];
      if (req > 0 && charsPerMission[idx].size < req) {
        return {
          code: "mission_members_unreachable",
          missionIndex: idx,
          required: req,
          available: charsPerMission[idx].size,
        };
      }
    }
  }

  return null;
}

import { buildSnapSkillCatalogue, snapChoiceKey, snapRows } from "./snap-catalogue";
import type { SnapMemberSelection } from "./snap-query";
import type { SnapDeckData, SnapSkillChoice, SnapSkillSelection } from "./snap-types";

export type SnapLegalityCode = "unknown-member" | "unknown-gk-level" | "duplicate-character" | "unknown-skill" | "unknown-skill-level"
  | "unsupported-skill" | "unknown-snap-card" | "ambiguous-snap-card" | "duplicate-snap-card" | "invalid-slots";
export interface SnapLegalityIssue { code: SnapLegalityCode; slot: number; otherSlot?: number }
export interface SnapLegalityState { snapSkills: readonly (SnapSkillSelection | null)[]; snapMembers: readonly (SnapMemberSelection | null)[] }
export interface SnapLegalityMember { id: number; characterId: number; gkLevels: readonly number[] }
export interface SnapLegalityContext { members: ReadonlyMap<number, SnapLegalityMember>; choices: readonly SnapSkillChoice[]; supportCardIds: ReadonlySet<number> }
const positive = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

/** Facts come from the same replay snapshot, never the merged site catalogue or artwork IDs. */
export function createSnapLegalityContext(data: SnapDeckData, choices: readonly SnapSkillChoice[] = buildSnapSkillCatalogue(data)): SnapLegalityContext {
  const effects = snapRows(data, "MasterGekisouSkillEffect");
  const members = new Map(snapRows(data, "MasterMemberCard").filter((row) => positive(row._id) && positive(row._characterID))
    .map((row) => [row._id as number, { id: row._id as number, characterId: row._characterID as number,
      gkLevels: [...new Set(effects.filter((effect) => effect._gekisouSkillID === row._gekisouSkillID && positive(effect._level)).map((effect) => effect._level as number))] }]));
  return { members, choices, supportCardIds: new Set(snapRows(data, "MasterSupportCard").map((row) => row._id).filter(positive)) };
}

function choiceFor(selection: SnapSkillSelection, choices: readonly SnapSkillChoice[]): SnapSkillChoice | undefined {
  return choices.find((choice) => choice.key === snapChoiceKey(selection.kind, selection.skillId, selection.level));
}
function boundCardIds(choice: SnapSkillChoice): number[] {
  return [...new Set(choice.rankBindings.map((binding) => binding.cardId).filter((id) => positive(id) && choice.cardIds.includes(id)))];
}

/** Legacy three-field URLs resolve only an unambiguous real card; ambiguous effects are never silently assigned. */
export function resolveSnapSupportCardId(selection: SnapSkillSelection | null | undefined, choices: readonly SnapSkillChoice[]): number | null {
  if (!selection) return null;
  const choice = choiceFor(selection, choices);
  if (!choice) return null;
  const ids = boundCardIds(choice);
  return selection.cardId === undefined ? ids.length === 1 ? ids[0]! : null : positive(selection.cardId) && ids.includes(selection.cardId) ? selection.cardId : null;
}

export function validateSnapMemberSelection(context: SnapLegalityContext, member: SnapMemberSelection | null, slot: number): SnapLegalityIssue | null {
  if (!member) return null;
  const entry = context.members.get(member.memberId);
  if (!entry) return { code: "unknown-member", slot };
  return member.gekisouLevel === null || entry.gkLevels.includes(member.gekisouLevel) ? null : { code: "unknown-gk-level", slot };
}
export function validateSnapSkillSelection(context: SnapLegalityContext, selection: SnapSkillSelection | null, slot: number): SnapLegalityIssue | null {
  if (!selection) return null;
  const choice = choiceFor(selection, context.choices);
  if (!choice) return { code: context.choices.some((entry) => entry.kind === selection.kind && entry.skillId === selection.skillId) ? "unknown-skill-level" : "unknown-skill", slot };
  if (choice.status === "unsupported") return { code: "unsupported-skill", slot };
  const ids = boundCardIds(choice).filter((id) => context.supportCardIds.has(id));
  if (selection.cardId === undefined) return ids.length === 1 ? null : { code: ids.length ? "ambiguous-snap-card" : "unknown-snap-card", slot };
  return positive(selection.cardId) && ids.includes(selection.cardId) ? null : { code: "unknown-snap-card", slot };
}

/** Native KeepCardIdConsistency (0x5a4e478) removes duplicate characters or supportCardIds.
 * The requested web UX rejects that replacement instead of moving the card out of another slot. */
export function validateSnapMemberReplacement(state: SnapLegalityState, context: SnapLegalityContext, slot: number, member: SnapMemberSelection | null): SnapLegalityIssue | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 5 || state.snapMembers.length !== 5) return { code: "invalid-slots", slot };
  const invalid = validateSnapMemberSelection(context, member, slot);
  if (invalid || !member) return invalid;
  const characterId = context.members.get(member.memberId)!.characterId;
  const otherSlot = state.snapMembers.findIndex((other, index) => index !== slot && other && context.members.get(other.memberId)?.characterId === characterId);
  return otherSlot < 0 ? null : { code: "duplicate-character", slot, otherSlot };
}
export function validateSnapSkillReplacement(state: SnapLegalityState, context: SnapLegalityContext, slot: number, selection: SnapSkillSelection | null): SnapLegalityIssue | null {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 5 || state.snapSkills.length !== 5) return { code: "invalid-slots", slot };
  const invalid = validateSnapSkillSelection(context, selection, slot);
  if (invalid || !selection) return invalid;
  const cardId = resolveSnapSupportCardId(selection, context.choices)!;
  const otherSlot = state.snapSkills.findIndex((other, index) => index !== slot && other && resolveSnapSupportCardId(other, context.choices) === cardId);
  return otherSlot < 0 ? null : { code: "duplicate-snap-card", slot, otherSlot };
}

/** Shared by URL/profile import and proposed UI changes. Existing selections in the same slot are legal. */
export function validateSnapFormation(state: SnapLegalityState, context: SnapLegalityContext): SnapLegalityIssue[] {
  if (state.snapMembers.length !== 5 || state.snapSkills.length !== 5) return [{ code: "invalid-slots", slot: -1 }];
  const issues: SnapLegalityIssue[] = [];
  state.snapMembers.forEach((member, slot) => { const issue = validateSnapMemberReplacement(state, context, slot, member); if (issue) issues.push(issue); });
  state.snapSkills.forEach((selection, slot) => { const issue = validateSnapSkillReplacement(state, context, slot, selection); if (issue) issues.push(issue); });
  return issues;
}

import type { FiveSlots, SnapSkillSelection } from "./snap-types";

export interface SnapMemberSelection { memberId: number; gekisouLevel: number | null }
export interface SnapQueryState {
  snapSkills: FiveSlots<SnapSkillSelection | null>;
  snapMembers: FiveSlots<SnapMemberSelection | null>;
  snapPower: number;
}
const integer = (value: string | undefined): number | null => value && /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= 2147483647 ? Number(value) : null;

/** IDs are revalidated against the loaded snapshot; the URL stores choices, not evaluation results. */
export function parseSnapQuery(query: URLSearchParams): SnapQueryState {
  const skills = (query.get("ss") ?? "").split(","), members = (query.get("sm") ?? "").split(",");
  const snapSkills = [0, 1, 2, 3, 4].map((i) => {
    const [kind, id, level, extra] = (skills[i] ?? "").split(":");
    const skillId = integer(id), skillLevel = integer(level);
    return (kind === "support" || kind === "gekisou-support") && skillId && skillLevel && extra === undefined ? { kind, skillId, level: skillLevel } : null;
  }) as unknown as FiveSlots<SnapSkillSelection | null>;
  const snapMembers = [0, 1, 2, 3, 4].map((i) => {
    const [id, level, extra] = (members[i] ?? "").split(":");
    const memberId = integer(id), gekisouLevel = level === "0" ? null : integer(level);
    return memberId && extra === undefined && (level === "0" || gekisouLevel !== null) ? { memberId, gekisouLevel } : null;
  }) as unknown as FiveSlots<SnapMemberSelection | null>;
  const power = integer(query.get("mp") ?? undefined);
  return { snapSkills, snapMembers, snapPower: power && power <= 20000000 ? power : 300000 };
}

export function writeSnapQuery(query: URLSearchParams, state: SnapQueryState): void {
  if (state.snapSkills.some(Boolean)) query.set("ss", state.snapSkills.map((skill) => skill ? `${skill.kind}:${skill.skillId}:${skill.level}` : "0").join(","));
  if (state.snapMembers.some(Boolean)) query.set("sm", state.snapMembers.map((member) => member ? `${member.memberId}:${member.gekisouLevel ?? 0}` : "0").join(","));
  if (state.snapPower !== 300000) query.set("mp", String(state.snapPower));
}

export function replaceSnapSlot<T>(slots: FiveSlots<T>, slot: number, value: T): FiveSlots<T> {
  if (!Number.isInteger(slot) || slot < 0 || slot >= 5) throw new Error("Invalid Snap slot");
  return slots.map((entry, i) => i === slot ? value : entry) as unknown as FiveSlots<T>;
}

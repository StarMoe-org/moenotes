import type { SnapDeckData, SnapMemberContext, SnapRequirement, SnapSkillChoice, SnapSkillKind } from "./snap-types";

type Row = Record<string, unknown>;
export function snapRows(data: SnapDeckData, name: string): Row[] {
  const table = data.master[name];
  if (!table || !Array.isArray(table.columns) || !Array.isArray(table.rows)) throw new Error(`Missing replay table: ${name}`);
  return table.rows.map((row) => Object.fromEntries(table.columns.map((key, i) => [key, row[i]])));
}
const number = (value: unknown): number => { if (!Number.isSafeInteger(value)) throw new Error("Invalid replay integer"); return value as number; };
const numbers = (value: unknown): number[] => { if (!Array.isArray(value)) throw new Error("Invalid replay integer array"); return value.map(number); };
export const snapChoiceKey = (kind: SnapSkillKind, skillId: number, level: number) => `${kind}:${skillId}:${level}`;
export type SnapLabeler = (kind: SnapSkillKind, skillId: number, level: number) => { name: string; description: string; iconUrl?: string } | undefined;

/** Only skills actually bound to cards/ranks in this verified replay snapshot are choices. */
export function buildSnapSkillCatalogue(data: SnapDeckData, label?: SnapLabeler): SnapSkillChoice[] {
  const ranks = snapRows(data, "MasterSupportCardRank");
  const conditions = new Map(snapRows(data, "MasterSkillCondition").map((r) => [number(r._id), r]));
  const sets = snapRows(data, "MasterSkillConditionSet");
  const targets = new Map(snapRows(data, "MasterSkillTarget").map((r) => [number(r._id), r]));
  const cumulative = new Map(snapRows(data, "MasterSkillCumulativeCondition").map((r) => [number(r._id), r]));
  const ordinary = snapRows(data, "MasterSupportSkillEffect"), gekisou = snapRows(data, "MasterGekisouSupportSkillEffect");
  const choices = new Map<string, SnapSkillChoice>();
  for (const card of snapRows(data, "MasterSupportCard")) for (const rank of ranks.filter((r) => r._group === card._supportCardRankGroup)) {
    for (const kind of ["support", "gekisou-support"] as const) for (const binding of [1, 2] as const) {
      const suffix = `0${binding}`;
      const skillId = number(card[`_${kind === "support" ? "supportSkillId" : "gekisouSupportSkillId"}${suffix}`]);
      if (!skillId) continue;
      const level = number(rank[`_${kind === "support" ? "supportSkill" : "gekisouSupportSkill"}${suffix}Level`]);
      const key = snapChoiceKey(kind, skillId, level);
      let choice = choices.get(key);
      if (!choice) {
        const effects = (kind === "support" ? ordinary : gekisou).filter((r) => r[kind === "support" ? "_supportSkillID" : "_gekisouSupportSkillID"] === skillId && r._level === level);
        const required = new Set<SnapRequirement>();
        if (!effects.length) required.add("missing-dependency");
        if (kind === "gekisou-support") { required.add("gekisou-mode"); required.add("paired-gekisou-skill"); }
        for (const effect of effects) {
          // Timing-window effects need actual raw timing input; a completed judgement plan cannot measure them.
          if ([4000, 4001, 4002, 4003, 4004, 13001].includes(number(effect._skillEffectType))) required.add("raw-timing");
          const targetIds = numbers(effect._skillTargetIDs);
          const cumulativeId = number(effect._skillCumulativeConditionID);
          if (cumulativeId && !cumulative.has(cumulativeId)) required.add("missing-dependency");
          for (const field of ["_skillTriggerConditionGroup", "_skillConditionGroup", "_skillReleaseConditionGroup", "_effectExecuteLimitResetConditionGroup"]) {
            const group = number(effect[field]);
            if (!group) continue;
            const groupSets = sets.filter((s) => s._group === group);
            if (!groupSets.length) required.add("missing-dependency");
            for (const set of groupSets) for (const id of numbers(set._conditionIds)) {
              const condition = conditions.get(id);
              if (!condition) { required.add("missing-dependency"); continue; }
              if (condition._conditionType === 5000) required.add("paired-member");
              targetIds.push(...numbers(condition._conditionTargetIDs));
            }
          }
          for (const id of targetIds) {
            const target = targets.get(id);
            if (!target) { required.add("missing-dependency"); continue; }
            if (["_characterID", "_bandID", "_cardType", "_tagID", "_gekisouMissionType"].some((f) => number(target[f]) !== 0)
              || numbers(target._liveSkillCategories).length || numbers(target._gekisouSkillCategories).length) required.add("paired-member");
          }
        }
        const text = label?.(kind, skillId, level);
        choice = { key, kind, skillId, level, name: text?.name ?? "", description: text?.description ?? "", ...(text?.iconUrl ? { iconUrl: text.iconUrl } : {}), searchTerms: [String(skillId), text?.name ?? "", text?.description ?? ""], cardIds: [], rankBindings: [],
          effectTypes: [...new Set(effects.map((r) => number(r._skillEffectType)))], requirements: [...required],
          status: required.has("missing-dependency") || required.has("raw-timing") ? "unsupported" : required.size ? "needs-context" : "supported" };
        choices.set(key, choice);
      }
      const cardId = number(card._id);
      if (!choice.cardIds.includes(cardId)) choice.cardIds.push(cardId);
      choice.rankBindings.push({ cardId, rank: number(rank._rank), binding });
    }
  }
  return [...choices.values()];
}

/** Native predicate context from this same snapshot. Growth level is caller supplied. */
export function snapMemberContext(data: SnapDeckData, memberId: number, gekisouLevel: number | null): SnapMemberContext {
  const card = snapRows(data, "MasterMemberCard").find((r) => r._id === memberId);
  if (!card) throw new Error("Member is absent from this replay snapshot");
  const character = snapRows(data, "MasterCharacter").find((r) => r._id === card._characterID);
  const live = snapRows(data, "MasterLiveSkill").find((r) => r._id === card._liveSkillID);
  const gekisou = snapRows(data, "MasterGekisouSkill").find((r) => r._id === card._gekisouSkillID);
  if (!character || !live || !gekisou) throw new Error("Member predicates have missing source dependencies");
  if (gekisouLevel !== null && !snapRows(data, "MasterGekisouSkillEffect").some((r) => r._gekisouSkillID === card._gekisouSkillID && r._level === gekisouLevel)) throw new Error("Unknown paired member Gekisou level");
  return { memberId, bandId: number(character._bandID), characterId: number(card._characterID), cardType: number(card._cardType), tagIds: numbers(card._bestMusicTagIDs),
    liveSkillCategories: numbers(live._skillCategories), gekisouSkillCategories: numbers(gekisou._skillCategories), gekisouMissionType: number(gekisou._gekisouMissionType),
    gekisouSkill: gekisouLevel === null ? null : [number(card._gekisouSkillID), gekisouLevel] };
}

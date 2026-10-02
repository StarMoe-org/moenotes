import type { AppLocale } from "@/config/locales";
import { getSkillIconUrl } from "@/lib/cards/assets";
import type { RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export type SkillKind = "leader" | "live" | "gekisou";

export interface RawSkillDefinition {
  id: number;
  nameTextID: string;
  descriptionTextFormatID: string;
  skillIconID: number;
}

export interface RawSkillEffect {
  id: number;
  level: number;
  leaderSkillID?: number;
  liveSkillID?: number;
  gekisouSkillID?: number;
  supportSkillID?: number;
  gekisouSupportSkillID?: number;
  activationTimeSecond?: number;
  effectValue: number;
  maxEffectValue?: number;
  skillEffectType: number;
  skillConditionGroup?: number;
  skillTriggerConditionGroup?: number;
  skillCumulativeConditionID?: number;
  skillTargetIDs?: number[];
  effectLimitCount?: number;
  effectExecuteLimitCount?: number;
}

export interface RawSkillIcon {
  id: number;
  normalIconAssetName: string;
}

export interface RawSkillConditionSet {
  id: number;
  group: number;
  conditionIds: number[];
}

export interface RawSkillCondition {
  id: number;
  conditionValues: number[];
  conditionTargetIDs?: number[];
  conditionType?: number;
  isPositive?: boolean;
}

export interface RawSkillCumulativeCondition {
  id: number;
  conditionValues: number[];
  maxCumulativeCount: number;
}

export interface RawSkillTarget {
  id: number;
  skillTargetType?: number;
  characterID?: number;
  bandID?: number;
  cardType?: number;
  tagID?: number;
  judgement?: number;
  liveMusicType?: number;
  gekisouMissionType?: number;
}

export interface SkillEffectViewModel {
  id: number;
  duration?: number;
  value: number;
  maxValue?: number;
  effectType: number;
  conditionGroup?: number;
  triggerConditionGroup?: number;
  cumulativeConditionId?: number;
  targetIds: number[];
  limitCount?: number;
  executeLimitCount?: number;
}

export interface SkillLevelViewModel {
  level: number;
  description: string;
  effects: SkillEffectViewModel[];
}

export interface SkillViewModel {
  kind: SkillKind;
  id: number;
  name: string;
  iconUrl: string;
  /** Every level present in the effect table, ascending. Never empty. */
  levels: SkillLevelViewModel[];
}

export function normalizeSkill(
  kind: SkillKind,
  skillId: number,
  definitions: RawSkillDefinition[],
  effects: RawSkillEffect[],
  icons: RawSkillIcon[],
  texts: RawText[],
  locale: AppLocale,
  conditionSets: RawSkillConditionSet[],
  conditions: RawSkillCondition[],
  cumulativeConditions: RawSkillCumulativeCondition[],
  skillTargets?: RawSkillTarget[],
  characterMap?: Map<number, RawCharacter>,
  bandMap?: Map<number, RawBand>,
): SkillViewModel | null {
  const definition = definitions.find((entry) => entry.id === skillId);
  if (!definition) return null;
  const icon = icons.find((entry) => entry.id === definition.skillIconID);
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const relevant = effects.filter((entry) => skillEffectId(entry, kind) === skillId);
  const template = localizeText(textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(textMap.get(id), locale) || id;

  return {
    kind,
    id: skillId,
    name: localizeText(textMap.get(definition.nameTextID), locale) || definition.nameTextID,
    iconUrl: icon?.normalIconAssetName ? getSkillIconUrl(icon.normalIconAssetName) : "",
    levels: groupEffectsByLevel(relevant).map(([level, levelEffects]) => ({
      level,
      description: formatSkillDescription(
        template,
        levelEffects,
        conditionSets,
        conditions,
        cumulativeConditions,
        skillTargets,
        characterMap,
        bandMap,
        resolveText,
      ),
      effects: levelEffects.map(toSkillEffectViewModel),
    })),
  };
}

/** Groups effect rows by skill level (ascending); a skill without rows yields a single empty level 1. */
export function groupEffectsByLevel<T extends RawSkillEffect>(effects: T[]): Array<[number, T[]]> {
  const byLevel = new Map<number, T[]>();
  effects.forEach((entry) => byLevel.set(entry.level, [...(byLevel.get(entry.level) ?? []), entry]));
  if (byLevel.size === 0) return [[1, []]];
  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, entries]) => [level, entries.sort((a, b) => a.id - b.id)]);
}

export function toSkillEffectViewModel(entry: RawSkillEffect): SkillEffectViewModel {
  const duration = entry.activationTimeSecond && entry.activationTimeSecond < 99999 ? entry.activationTimeSecond : undefined;
  return {
    id: entry.id,
    ...(duration !== undefined ? { duration } : {}),
    value: entry.effectValue,
    ...(entry.maxEffectValue ? { maxValue: entry.maxEffectValue } : {}),
    effectType: entry.skillEffectType,
    ...(entry.skillConditionGroup ? { conditionGroup: entry.skillConditionGroup } : {}),
    ...(entry.skillTriggerConditionGroup ? { triggerConditionGroup: entry.skillTriggerConditionGroup } : {}),
    ...(entry.skillCumulativeConditionID ? { cumulativeConditionId: entry.skillCumulativeConditionID } : {}),
    targetIds: entry.skillTargetIDs ?? [],
    ...(entry.effectLimitCount ? { limitCount: entry.effectLimitCount } : {}),
    ...(entry.effectExecuteLimitCount ? { executeLimitCount: entry.effectExecuteLimitCount } : {}),
  };
}

export function formatSkillDescription(
  template: string,
  effects: RawSkillEffect[],
  conditionSets: RawSkillConditionSet[],
  conditions: RawSkillCondition[],
  cumulativeConditions: RawSkillCumulativeCondition[],
  skillTargets?: RawSkillTarget[],
  characterMap?: Map<number, RawCharacter>,
  bandMap?: Map<number, RawBand>,
  resolveText: (id: string) => string = (id) => id,
): string {
  if (!template) return "";

  const conditionMap = new Map((conditions || []).map((entry) => [entry.id, entry]));
  const setsByGroup = new Map<number, RawSkillConditionSet[]>();
  (conditionSets || []).forEach((entry) => {
    setsByGroup.set(entry.group, [...(setsByGroup.get(entry.group) ?? []), entry]);
  });
  const cumulativeMap = new Map((cumulativeConditions || []).map((entry) => [entry.id, entry]));
  const targetMap = new Map((skillTargets || []).map((entry) => [entry.id, entry]));
  let unresolvedTarget = false;

  const resolveTargetName = (targetId: number | undefined): string => {
    if (targetId === undefined) { unresolvedTarget = true; return ""; }
    const target = targetMap.get(targetId);
    if (target) {
      if (target.bandID && bandMap?.has(target.bandID)) {
        const band = bandMap.get(target.bandID);
        return band ? resolveText(band.nameTextID) : "";
      }
      if (target.characterID && characterMap?.has(target.characterID)) {
        const char = characterMap.get(target.characterID);
        return char ? resolveText(char.nameTextID) : "";
      }
    }
    // With a target table, IDs are MasterSkillTarget IDs, never character/band IDs.
    // Retain the legacy direct-ID path only for callers without a target table.
    if (skillTargets === undefined && characterMap?.has(targetId)) {
      return resolveText(characterMap.get(targetId)!.nameTextID);
    }
    if (skillTargets === undefined && bandMap?.has(targetId)) {
      return resolveText(bandMap.get(targetId)!.nameTextID);
    }
    unresolvedTarget = true;
    return "";
  };

  // 1. Ternary operator: { cond ? trueBranch : falseBranch }
  let parsed = template;
  const ternaryRegex = /\{([^{}]+?)\?([^{}]+?):([^{}]+?)\}/g;
  while (parsed.match(ternaryRegex)) {
    parsed = parsed.replace(ternaryRegex, (_, cond, tr, fl) => {
      return evaluateTernary(cond, tr, fl, effects);
    });
  }

  // 2. Format tokens
  const formatted = parsed
    // Double index condition with multiplier math: {effects[0].con[0][0].values[0]*10:F1}
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*(con|tCon)\[(\d+)\]\[(\d+)\]\s*\.\s*values\s*\[(\d+)\]\s*\*\s*(\d+)(?:\s*:\s*F(\d+))?\}/gi,
      (_, effectIndex, type, setIndex, conditionIndex, valueIndex, multiplier, digits) => {
        const effect = effects[Number(effectIndex)];
        if (!effect) return "";
        const groupId = type.toLowerCase() === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
        if (!groupId) return "";
        const set = setsByGroup.get(groupId)?.[Number(setIndex)];
        const conditionId = set?.conditionIds[Number(conditionIndex)];
        const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
        const multipliedValue = value === undefined ? undefined : value * Number(multiplier);
        return formatNumber(multipliedValue, digits);
      },
    )
    // Double index condition / trigger condition targets name:
    // e.g. {effects[1].con[0][0].targets[0].name} or {effects[1].con[0][1].targets[0].name}
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*(?:(con|tCon)\[(\d+)\]\[(\d+)\]\s*\.\s*)?targets\s*\[(\d+)\]\s*\.\s*name\}/gi,
      (_, effectIndex, type, setIndex, conditionIndex, targetIndex) => {
        const effect = effects[Number(effectIndex)];
        if (!effect) return "";
        if (type) {
          const groupId = type.toLowerCase() === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
          if (!groupId) return "";
          const set = setsByGroup.get(groupId)?.[Number(setIndex)];
          const conditionId = set?.conditionIds[Number(conditionIndex)];
          const condition = conditionId !== undefined ? conditionMap.get(conditionId) : undefined;
          const targetId = condition?.conditionTargetIDs?.[Number(targetIndex)];
          return resolveTargetName(targetId);
        }
        const targetId = effect.skillTargetIDs?.[Number(targetIndex)];
        return resolveTargetName(targetId);
      },
    )
    // Double index condition or trigger condition values:
    // e.g. {effects[0].con[0][0].values[0]} or {effects[0].tCon[0][1].values[0]} or with :F0
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*(con|tCon)\[(\d+)\]\[(\d+)\]\s*\.\s*values\s*\[(\d+)\](?:\s*:\s*F(\d+))?\}/gi,
      (_, effectIndex, type, setIndex, conditionIndex, valueIndex, digits) => {
        const effect = effects[Number(effectIndex)];
        if (!effect) return "";
        const groupId = type.toLowerCase() === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
        if (!groupId) return "";
        const set = setsByGroup.get(groupId)?.[Number(setIndex)];
        const conditionId = set?.conditionIds[Number(conditionIndex)];
        const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
        return formatNumber(value, digits);
      },
    )
    // Single index condition values with values1 (default first condition):
    // e.g. {effects[0].con[0].values1[0]} or {effects[0].tCon[0].values1[0]} or {effects[0].tCon[1].values1[0]}
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*(con|tCon)\[(\d+)\]\s*\.\s*values1\s*\[(\d+)\](?:\s*:\s*F(\d+))?\}/gi,
      (_, effectIndex, type, setIndex, valueIndex, digits) => {
        const effect = effects[Number(effectIndex)];
        if (!effect) return "";
        const groupId = type.toLowerCase() === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
        if (!groupId) return "";
        const set = setsByGroup.get(groupId)?.[Number(setIndex)];
        const conditionId = set?.conditionIds[0];
        const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
        return formatNumber(value, digits);
      },
    )
    // Cumulative condition values (with space tolerance, e.g. {effects[0]. cCon. values [0]}):
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*cCon\s*\.\s*values\s*\[(\d+)\](?:\s*:\s*F(\d+))?\}/gi,
      (_, effectIndex, valueIndex, digits) => {
        const effect = effects[Number(effectIndex)];
        const value = cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.conditionValues[Number(valueIndex)];
        return formatNumber(value, digits);
      },
    )
    // Cumulative condition max count:
    .replace(/\{effects\[(\d+)\]\s*\.\s*cCon\s*\.\s*maxCount\}/gi, (_, effectIndex) => {
      const effect = effects[Number(effectIndex)];
      return String(cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.maxCumulativeCount ?? "");
    })
    // Effect execute limit count (EffectExecuteLimitCount):
    .replace(/\{effects\[(\d+)\]\s*\.\s*EffectExecuteLimitCount\}/gi, (_, effectIndex) => {
      const effect = effects[Number(effectIndex)];
      return String(effect?.effectExecuteLimitCount ?? "");
    })
    // Effect limit count (limitCount):
    .replace(/\{effects\[(\d+)\]\s*\.\s*limitCount\}/gi, (_, effectIndex) => {
      const effect = effects[Number(effectIndex)];
      return String(effect?.effectLimitCount ?? "");
    })
    // Standard effect fields: time, value, maxValue:
    // e.g. {effects[0].time:F1}, {effects[0].value/100:F1}, {effects[0].value/1000:F2}, {effects[0].value}
    .replace(
      /\{effects\[(\d+)\]\s*\.\s*(time|value|maxValue)(?:\s*\/\s*(\d+))?(?:\s*:\s*F(\d+))?\}/gi,
      (_, effectIndex, field, divisor, digits) => {
        const effect = effects[Number(effectIndex)];
        if (!effect) return "";
        const f = field.toLowerCase();
        const rawValue =
          f === "time"
            ? effect.activationTimeSecond
            : f === "maxvalue"
              ? effect.maxEffectValue
              : effect.effectValue;
        const value = rawValue === undefined ? undefined : rawValue / Number(divisor || 1);
        return formatNumber(value, digits);
      },
    )
    .replace(/<\/?color(?:=[^>]+)?>/g, "")
    .replace(/\\n/g, "\n")
    .trim();

  return unresolvedTarget || formatted.includes("{effects[") ? "" : formatted;
}

/** Backwards-compatible export */
export const formatDescription = formatSkillDescription;

export function formatNumber(value: number | undefined, digits?: string): string {
  if (value === undefined) return "";
  return digits === undefined ? String(value) : Number(value).toFixed(Number(digits));
}

function evaluateBranch(branch: string, effects: RawSkillEffect[]): string {
  const parts = branch.split("~");
  return parts
    .map((part) => {
      const trimmed = part.trim();
      const timeMatch = trimmed.match(/effects\[(\d+)\]\.time(?::F(\d+))?/i);
      if (timeMatch) {
        const idx = Number(timeMatch[1]);
        const digits = timeMatch[2];
        const val = effects[idx]?.activationTimeSecond;
        if (val === undefined) return "";
        return digits !== undefined ? Number(val).toFixed(Number(digits)) : String(val);
      }
      return trimmed.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
    })
    .join("");
}

function evaluateTernary(cond: string, tr: string, fl: string, effects: RawSkillEffect[]): string {
  let condResult = false;
  const condMatch = cond.match(/(?:0\s*<\s*effects\[(\d+)\]\.time|effects\[(\d+)\]\.time\s*>\s*0)/i);
  if (condMatch) {
    const idx = Number(condMatch[1] || condMatch[2]);
    const time = effects[idx]?.activationTimeSecond;
    if (time !== undefined && time > 0 && time < 99999) {
      condResult = true;
    }
  }
  return evaluateBranch(condResult ? tr : fl, effects);
}

function skillEffectId(effect: RawSkillEffect, kind: SkillKind): number | undefined {
  if (kind === "leader") return effect.leaderSkillID;
  if (kind === "live") return effect.liveSkillID;
  return effect.gekisouSkillID;
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  return localizeMasterText(entry, locale);
}

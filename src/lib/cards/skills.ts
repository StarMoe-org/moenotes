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

export interface SkillDescriptionIndex {
  conditionMap: ReadonlyMap<number, RawSkillCondition>;
  setsByGroup: ReadonlyMap<number, readonly RawSkillConditionSet[]>;
  cumulativeMap: ReadonlyMap<number, RawSkillCumulativeCondition>;
  targetMap: ReadonlyMap<number, RawSkillTarget>;
  hasTargetTable: boolean;
  characterMap?: ReadonlyMap<number, RawCharacter> | undefined;
  bandMap?: ReadonlyMap<number, RawBand> | undefined;
}

export interface SkillNormalizationIndex extends SkillDescriptionIndex {
  textMap: ReadonlyMap<string, RawText>;
  iconMap: ReadonlyMap<number, RawSkillIcon>;
}

/** Pre-index condition sets, conditions, cumulative conditions, and targets once for batch formatting. */
export function buildSkillDescriptionIndex(
  conditionSets: readonly RawSkillConditionSet[],
  conditions: readonly RawSkillCondition[],
  cumulativeConditions: readonly RawSkillCumulativeCondition[],
  skillTargets?: readonly RawSkillTarget[],
  characterMap?: ReadonlyMap<number, RawCharacter>,
  bandMap?: ReadonlyMap<number, RawBand>,
): SkillDescriptionIndex {
  const conditionMap = new Map<number, RawSkillCondition>();
  for (const entry of conditions || []) conditionMap.set(entry.id, entry);

  const setsByGroup = new Map<number, RawSkillConditionSet[]>();
  for (const entry of conditionSets || []) {
    let list = setsByGroup.get(entry.group);
    if (!list) {
      list = [];
      setsByGroup.set(entry.group, list);
    }
    list.push(entry);
  }

  const cumulativeMap = new Map<number, RawSkillCumulativeCondition>();
  for (const entry of cumulativeConditions || []) cumulativeMap.set(entry.id, entry);

  const targetMap = new Map<number, RawSkillTarget>();
  for (const entry of skillTargets || []) targetMap.set(entry.id, entry);

  return {
    conditionMap,
    setsByGroup,
    cumulativeMap,
    targetMap,
    hasTargetTable: skillTargets !== undefined,
    characterMap,
    bandMap,
  };
}

/** Pre-index icons, texts, and description lookup tables once per dictionary or batch normalization pass. */
export function buildSkillNormalizationIndex(
  icons: readonly RawSkillIcon[],
  texts: readonly RawText[],
  conditionSets: readonly RawSkillConditionSet[],
  conditions: readonly RawSkillCondition[],
  cumulativeConditions: readonly RawSkillCumulativeCondition[],
  skillTargets?: readonly RawSkillTarget[],
  characterMap?: ReadonlyMap<number, RawCharacter>,
  bandMap?: ReadonlyMap<number, RawBand>,
): SkillNormalizationIndex {
  const iconMap = new Map<number, RawSkillIcon>();
  for (const entry of icons) {
    if (!iconMap.has(entry.id)) iconMap.set(entry.id, entry);
  }
  const textMap = new Map<string, RawText>();
  for (const entry of texts) textMap.set(entry.id, entry);

  return {
    ...buildSkillDescriptionIndex(
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characterMap,
      bandMap,
    ),
    textMap,
    iconMap,
  };
}

/** Group effect rows by their parent skill id in a single pass. */
export function indexSkillEffects<T extends RawSkillEffect>(
  effects: readonly T[],
  getSkillId: (effect: T) => number | undefined,
): Map<number, T[]> {
  const bySkill = new Map<number, T[]>();
  for (const entry of effects) {
    const id = getSkillId(entry);
    if (id === undefined) continue;
    let list = bySkill.get(id);
    if (!list) {
      list = [];
      bySkill.set(id, list);
    }
    list.push(entry);
  }
  return bySkill;
}

/** Normalize one member skill using pre-indexed lookup maps and pre-filtered effect rows. */
export function normalizeSkillFromDefinition(
  kind: SkillKind,
  definition: RawSkillDefinition,
  relevantEffects: readonly RawSkillEffect[],
  index: SkillNormalizationIndex,
  locale: AppLocale,
): SkillViewModel {
  const icon = index.iconMap.get(definition.skillIconID);
  const template = localizeText(index.textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(index.textMap.get(id), locale) || id;

  return {
    kind,
    id: definition.id,
    name: localizeText(index.textMap.get(definition.nameTextID), locale) || definition.nameTextID,
    iconUrl: icon?.normalIconAssetName ? getSkillIconUrl(icon.normalIconAssetName) : "",
    levels: groupEffectsByLevel(relevantEffects).map(([level, levelEffects]) => ({
      level,
      description: formatSkillDescriptionWithIndex(
        template,
        levelEffects,
        index,
        resolveText,
      ),
      effects: levelEffects.map(toSkillEffectViewModel),
    })),
  };
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
  const textMap = new Map<string, RawText>();
  for (const entry of texts) textMap.set(entry.id, entry);
  const relevant = effects.filter((entry) => skillEffectId(entry, kind) === skillId);
  const template = localizeText(textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(textMap.get(id), locale) || id;
  const descriptionIndex = buildSkillDescriptionIndex(
    conditionSets,
    conditions,
    cumulativeConditions,
    skillTargets,
    characterMap,
    bandMap,
  );

  return {
    kind,
    id: skillId,
    name: localizeText(textMap.get(definition.nameTextID), locale) || definition.nameTextID,
    iconUrl: icon?.normalIconAssetName ? getSkillIconUrl(icon.normalIconAssetName) : "",
    levels: groupEffectsByLevel(relevant).map(([level, levelEffects]) => ({
      level,
      description: formatSkillDescriptionWithIndex(
        template,
        levelEffects,
        descriptionIndex,
        resolveText,
      ),
      effects: levelEffects.map(toSkillEffectViewModel),
    })),
  };
}

/** Groups effect rows by skill level (ascending); a skill without rows yields a single empty level 1. */
export function groupEffectsByLevel<T extends RawSkillEffect>(effects: readonly T[]): Array<[number, T[]]> {
  const byLevel = new Map<number, T[]>();
  for (const entry of effects) {
    let list = byLevel.get(entry.level);
    if (!list) {
      list = [];
      byLevel.set(entry.level, list);
    }
    list.push(entry);
  }
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
  const index = buildSkillDescriptionIndex(
    conditionSets,
    conditions,
    cumulativeConditions,
    skillTargets,
    characterMap,
    bandMap,
  );
  return formatSkillDescriptionWithIndex(template, effects, index, resolveText);
}

/** Format a skill description template using pre-indexed condition/target lookup maps. */
export function formatSkillDescriptionWithIndex(
  template: string,
  effects: readonly RawSkillEffect[],
  index: SkillDescriptionIndex,
  resolveText: (id: string) => string = (id) => id,
): string {
  if (!template) return "";

  const { conditionMap, setsByGroup, cumulativeMap, targetMap, hasTargetTable, characterMap, bandMap } = index;
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
    if (!hasTargetTable && characterMap?.has(targetId)) {
      return resolveText(characterMap.get(targetId)!.nameTextID);
    }
    if (!hasTargetTable && bandMap?.has(targetId)) {
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

function evaluateBranch(branch: string, effects: readonly RawSkillEffect[]): string {
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

function evaluateTernary(cond: string, tr: string, fl: string, effects: readonly RawSkillEffect[]): string {
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

export function skillEffectId(effect: RawSkillEffect, kind: SkillKind): number | undefined {
  if (kind === "leader") return effect.leaderSkillID;
  if (kind === "live") return effect.liveSkillID;
  return effect.gekisouSkillID;
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  return localizeMasterText(entry, locale);
}

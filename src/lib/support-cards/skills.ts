import type { AppLocale } from "@/config/locales";
import { getSkillIconUrl } from "@/lib/cards/assets";
import type { RawText, RawCharacter } from "@/lib/cards/data";
import type {
  RawSkillDefinition,
  RawSkillEffect,
  RawSkillIcon,
  RawSkillCondition,
  RawSkillConditionSet,
  RawSkillCumulativeCondition,
  SkillViewModel,
} from "@/lib/cards/skills";

// Extended support skill effect type including both standard and support card linking IDs
export interface RawSupportSkillEffect extends RawSkillEffect {
  supportSkillID?: number;
  gekisouSupportSkillID?: number;
  skillTriggerConditionGroup?: number;
  effectLimitCount?: number;
}

export type SupportSkillKind = "support" | "gekisou-support";

export function normalizeSupportSkill(
  kind: SupportSkillKind,
  skillId: number,
  definitions: RawSkillDefinition[],
  effects: RawSupportSkillEffect[],
  icons: RawSkillIcon[],
  texts: RawText[],
  locale: AppLocale,
  conditionSets: RawSkillConditionSet[],
  conditions: RawSkillCondition[],
  cumulativeConditions: RawSkillCumulativeCondition[],
  characterMap: Map<number, RawCharacter>,
): SkillViewModel | null {
  const definition = definitions.find((entry) => entry.id === skillId);
  if (!definition) return null;

  const icon = icons.find((entry) => entry.id === definition.skillIconID);
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const relevant = effects.filter((entry) => skillEffectId(entry, kind) === skillId);
  if (relevant.length === 0) return null;

  const level = Math.max(1, ...relevant.map((entry) => entry.level));
  const levelEffects = relevant.filter((entry) => entry.level === level).sort((a, b) => a.id - b.id);
  const template = localizeText(textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(textMap.get(id), locale) || id;

  return {
    kind: kind === "support" ? "live" : "gekisou", // map to standard SkillKind for standard UI components if needed
    id: skillId,
    level,
    name: localizeText(textMap.get(definition.nameTextID), locale) || definition.nameTextID,
    description: formatDescription(
      template,
      levelEffects,
      conditionSets,
      conditions,
      cumulativeConditions,
      characterMap,
      resolveText,
    ),
    iconUrl: icon?.normalIconAssetName ? getSkillIconUrl(icon.normalIconAssetName) : "",
    effects: levelEffects.map((entry) => {
      const duration = entry.activationTimeSecond && entry.activationTimeSecond < 99999 ? entry.activationTimeSecond : undefined;
      return {
        id: entry.id,
        ...(duration !== undefined ? { duration } : {}),
        value: entry.effectValue,
        ...(entry.maxEffectValue ? { maxValue: entry.maxEffectValue } : {}),
        effectType: entry.skillEffectType,
        ...(entry.skillConditionGroup ? { conditionGroup: entry.skillConditionGroup } : {}),
        ...(entry.skillCumulativeConditionID ? { cumulativeConditionId: entry.skillCumulativeConditionID } : {}),
        targetIds: entry.skillTargetIDs ?? [],
      };
    }),
  };
}

function skillEffectId(effect: RawSupportSkillEffect, kind: SupportSkillKind): number | undefined {
  if (kind === "support") return effect.supportSkillID;
  return effect.gekisouSupportSkillID;
}

function formatDescription(
  template: string,
  effects: RawSupportSkillEffect[],
  conditionSets: RawSkillConditionSet[],
  conditions: RawSkillCondition[],
  cumulativeConditions: RawSkillCumulativeCondition[],
  characterMap: Map<number, RawCharacter>,
  resolveText: (id: string) => string,
): string {
  if (!template) return "";
  const conditionMap = new Map(conditions.map((entry) => [entry.id, entry]));
  const setsByGroup = new Map<number, RawSkillConditionSet[]>();
  conditionSets.forEach((entry) => setsByGroup.set(entry.group, [...(setsByGroup.get(entry.group) ?? []), entry]));
  const cumulativeMap = new Map(cumulativeConditions.map((entry) => [entry.id, entry]));

  let ternaryParsed = template;
  const ternaryRegex = /\{([^{}]+?)\?([^{}]+?):([^{}]+?)\}/g;
  while (ternaryParsed.match(ternaryRegex)) {
    ternaryParsed = ternaryParsed.replace(ternaryRegex, (_, cond, tr, fl) => {
      return evaluateTernary(cond, tr, fl, effects);
    });
  }

  const formatted = ternaryParsed
    // 1. Double index condition values with multiplier math:
    // e.g. {effects[0].tCon[0][0].values[0]*10:F1}
    .replace(/\{effects\[(\d+)\]\.(con|tCon)\[(\d+)\]\[(\d+)\]\.values\[(\d+)\]\*(\d+)(?::F(\d+))?\}/g, (_, effectIndex, type, setIndex, conditionIndex, valueIndex, multiplier, digits) => {
      const effect = effects[Number(effectIndex)];
      if (!effect) return "";
      const groupId = type === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
      if (!groupId) return "";
      const set = setsByGroup.get(groupId)?.[Number(setIndex)];
      const conditionId = set?.conditionIds[Number(conditionIndex)];
      const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
      const multipliedValue = value === undefined ? undefined : value * Number(multiplier);
      return formatNumber(multipliedValue, digits);
    })
    // 2. Double index trigger conditions or condition sets values:
    // e.g. {effects[0].con[0][0].values[0]} or {effects[0].tCon[0][0].values[0]}
    .replace(/\{effects\[(\d+)\]\.(con|tCon)\[(\d+)\]\[(\d+)\]\.values\[(\d+)\](?::F(\d+))?\}/g, (_, effectIndex, type, setIndex, conditionIndex, valueIndex, digits) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      if (!effect) return "";
      const groupId = type === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
      if (!groupId) return "";
      const set = setsByGroup.get(groupId)?.[Number(setIndex)];
      const conditionId = set?.conditionIds[Number(conditionIndex)];
      const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
      return formatNumber(value, digits);
    })
    // 3. Single index condition values with values1 (default first condition):
    // e.g. {effects[0].con[0].values1[0]} or {effects[0].tCon[0].values1[0]}
    .replace(/\{effects\[(\d+)\]\.(con|tCon)\[(\d+)\]\.values1\[(\d+)\](?::F(\d+))?\}/g, (_, effectIndex, type, setIndex, valueIndex, digits) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      if (!effect) return "";
      const groupId = type === "con" ? effect.skillConditionGroup : effect.skillTriggerConditionGroup;
      if (!groupId) return "";
      const set = setsByGroup.get(groupId)?.[Number(setIndex)];
      const conditionId = set?.conditionIds[0];
      const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
      return formatNumber(value, digits);
    })
    // 4. Targets name resolution:
    // e.g. {effects[1].con[0][0].targets[0].name} or {effects[1].targets[0].name}
    .replace(/\{effects\[(\d+)\]\.(?:con\[\d+\](?:\[\d+\])?\.)?targets\[(\d+)\]\.name\}/g, (_, effectIndex, targetIndex) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      const targetId = effect?.skillTargetIDs?.[Number(targetIndex)];
      if (targetId === undefined) return "";
      const char = characterMap.get(targetId);
      return char ? resolveText(char.nameTextID) : "";
    })
    // 5. Cumulative max count:
    // e.g. {effects[0].cCon.maxCount}
    .replace(/\{effects\[(\d+)\]\.cCon\.maxCount\}/g, (_, effectIndex) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      return String(cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.maxCumulativeCount ?? "");
    })
    // 6. Cumulative values:
    // e.g. {effects[0].cCon.values[0]}
    .replace(/\{effects\[(\d+)\]\.cCon\.values\[(\d+)\](?::F(\d+))?\}/g, (_, effectIndex, valueIndex, digits) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      const value = cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.conditionValues[Number(valueIndex)];
      return formatNumber(value, digits);
    })
    // 7. Time / Value / limitCount:
    // e.g. {effects[0].time:F1} or {effects[0].value/100:F1}
    .replace(/\{effects\[(\d+)\]\.(time|value|maxValue|limitCount)(?:\/(\d+))?(?::F(\d+))?\}/g, (_, effectIndex, field, divisor, digits) => {
      const effect = Math.max(0, Number(effectIndex)) < effects.length ? effects[Number(effectIndex)] : undefined;
      if (!effect) return "";
      const rawValue =
        field === "time"
          ? effect.activationTimeSecond
          : field === "maxValue"
            ? effect.maxEffectValue
            : field === "limitCount"
              ? effect.effectLimitCount
              : effect.effectValue;
      const value = rawValue === undefined ? undefined : rawValue / Number(divisor || 1);
      return formatNumber(value, digits);
    })
    .replace(/<\/?color(?:=[^>]+)?>/g, "")
    .replace(/\\n/g, "\n")
    .trim();

  return formatted.includes("{effects[") ? "" : formatted;
}

function formatNumber(value: number | undefined, digits?: string): string {
  if (value === undefined) return "";
  return digits === undefined ? String(value) : value.toFixed(Number(digits));
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
  if (locale === "en-US") return entry.english || entry.japanese;
  return entry.japanese || entry.english;
}

function evaluateTernary(
  conditionStr: string,
  trueStr: string,
  falseStr: string,
  effects: RawSupportSkillEffect[],
): string {
  let conditionResult = false;
  const condMatch = conditionStr.match(/(?:0\s*<\s*effects\[(\d+)\]\.time|effects\[(\d+)\]\.time\s*>\s*0)/);
  if (condMatch) {
    const effectIndex = Number(condMatch[1] || condMatch[2]);
    const effect = Math.max(0, effectIndex) < effects.length ? effects[effectIndex] : undefined;
    if (effect && effect.activationTimeSecond !== undefined) {
      conditionResult = effect.activationTimeSecond > 0;
    }
  }

  const branch = conditionResult ? trueStr.trim() : falseStr.trim();
  const concatMatch = branch.match(/effects\[(\d+)\]\.time\s*~\s*(.*)/);
  if (concatMatch) {
    const effectIndex = Number(concatMatch[1]);
    const suffix = (concatMatch[2] ?? "").replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
    const effect = Math.max(0, effectIndex) < effects.length ? effects[effectIndex] : undefined;
    const timeVal = effect?.activationTimeSecond ?? 0;
    return `${timeVal.toFixed(0)}${suffix}`;
  }

  return branch.replace(/^["']|["']$/g, "").replace(/\\"/g, '"');
}

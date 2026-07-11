import type { AppLocale } from "@/config/locales";
import { getSkillIconUrl } from "@/lib/cards/assets";
import type { RawText } from "@/lib/cards/data";

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
  activationTimeSecond?: number;
  effectValue: number;
  maxEffectValue?: number;
  skillEffectType: number;
  skillConditionGroup?: number;
  skillCumulativeConditionID?: number;
  skillTargetIDs?: number[];
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
}

export interface RawSkillCumulativeCondition {
  id: number;
  conditionValues: number[];
  maxCumulativeCount: number;
}

export interface SkillEffectViewModel {
  id: number;
  duration?: number;
  value: number;
  maxValue?: number;
  effectType: number;
  conditionGroup?: number;
  cumulativeConditionId?: number;
  targetIds: number[];
}

export interface SkillViewModel {
  kind: SkillKind;
  id: number;
  level: number;
  name: string;
  description: string;
  iconUrl: string;
  effects: SkillEffectViewModel[];
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
): SkillViewModel | null {
  const definition = definitions.find((entry) => entry.id === skillId);
  if (!definition) return null;
  const icon = icons.find((entry) => entry.id === definition.skillIconID);
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const relevant = effects.filter((entry) => skillEffectId(entry, kind) === skillId);
  const level = Math.max(1, ...relevant.map((entry) => entry.level));

  const levelEffects = relevant.filter((entry) => entry.level === level).sort((a, b) => a.id - b.id);
  const template = localizeText(textMap.get(definition.descriptionTextFormatID), locale);

  return {
    kind,
    id: skillId,
    level,
    name: localizeText(textMap.get(definition.nameTextID), locale) || definition.nameTextID,
    description: formatDescription(template, levelEffects, conditionSets, conditions, cumulativeConditions),
    iconUrl: icon?.normalIconAssetName ? getSkillIconUrl(icon.normalIconAssetName) : "",
    effects: levelEffects
      .map((entry) => {
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

function formatDescription(
  template: string,
  effects: RawSkillEffect[],
  conditionSets: RawSkillConditionSet[],
  conditions: RawSkillCondition[],
  cumulativeConditions: RawSkillCumulativeCondition[],
): string {
  if (!template) return "";
  const conditionMap = new Map(conditions.map((entry) => [entry.id, entry]));
  const setsByGroup = new Map<number, RawSkillConditionSet[]>();
  conditionSets.forEach((entry) => setsByGroup.set(entry.group, [...(setsByGroup.get(entry.group) ?? []), entry]));
  const cumulativeMap = new Map(cumulativeConditions.map((entry) => [entry.id, entry]));

  const formatted = template
    .replace(/\{effects\[(\d+)\]\.con\[(\d+)\]\[(\d+)\]\.values\[(\d+)\](?::F(\d+))?\}/g, (_, effectIndex, setIndex, conditionIndex, valueIndex, digits) => {
      const effect = effects[Number(effectIndex)];
      const set = effect ? setsByGroup.get(effect.skillConditionGroup ?? 0)?.[Number(setIndex)] : undefined;
      const conditionId = set?.conditionIds[Number(conditionIndex)];
      const value = conditionId === undefined ? undefined : conditionMap.get(conditionId)?.conditionValues[Number(valueIndex)];
      return formatNumber(value, digits);
    })
    .replace(/\{effects\[(\d+)\]\.cCon\.values\[(\d+)\](?::F(\d+))?\}/g, (_, effectIndex, valueIndex, digits) => {
      const effect = effects[Number(effectIndex)];
      const value = cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.conditionValues[Number(valueIndex)];
      return formatNumber(value, digits);
    })
    .replace(/\{effects\[(\d+)\]\.cCon\.maxCount\}/g, (_, effectIndex) => {
      const effect = effects[Number(effectIndex)];
      return String(cumulativeMap.get(effect?.skillCumulativeConditionID ?? 0)?.maxCumulativeCount ?? "");
    })
    .replace(/\{effects\[(\d+)\]\.(time|value|maxValue)(?:\/(\d+))?(?::F(\d+))?\}/g, (_, effectIndex, field, divisor, digits) => {
      const effect = effects[Number(effectIndex)];
      const rawValue = field === "time" ? effect?.activationTimeSecond : field === "maxValue" ? effect?.maxEffectValue : effect?.effectValue;
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

function skillEffectId(effect: RawSkillEffect, kind: SkillKind): number | undefined {
  if (kind === "leader") return effect.leaderSkillID;
  if (kind === "live") return effect.liveSkillID;
  return effect.gekisouSkillID;
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
  if (locale === "en-US") return entry.english || entry.japanese;
  return entry.japanese || entry.english;
}

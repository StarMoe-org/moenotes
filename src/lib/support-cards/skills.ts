import type { AppLocale } from "@/config/locales";
import { getSkillIconUrl } from "@/lib/cards/assets";
import type { RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import {
  buildSkillDescriptionIndex,
  formatSkillDescription,
  formatSkillDescriptionWithIndex,
  groupEffectsByLevel,
  toSkillEffectViewModel,
  type RawSkillDefinition,
  type RawSkillEffect,
  type RawSkillIcon,
  type RawSkillCondition,
  type RawSkillConditionSet,
  type RawSkillCumulativeCondition,
  type RawSkillTarget,
  type SkillNormalizationIndex,
  type SkillViewModel,
} from "@/lib/cards/skills";

// Extended support skill effect type including both standard and support card linking IDs
export type RawSupportSkillEffect = RawSkillEffect;

export type SupportSkillKind = "support" | "gekisou-support";

/** Normalize one support skill using pre-indexed lookup maps and pre-filtered effect rows. */
export function normalizeSupportSkillFromDefinition(
  kind: SupportSkillKind,
  definition: RawSkillDefinition,
  relevantEffects: readonly RawSupportSkillEffect[],
  index: SkillNormalizationIndex,
  locale: AppLocale,
): SkillViewModel | null {
  if (relevantEffects.length === 0) return null;

  const icon = index.iconMap.get(definition.skillIconID);
  const template = localizeText(index.textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(index.textMap.get(id), locale) || id;

  return {
    kind: kind === "support" ? "live" : "gekisou", // map to standard SkillKind for standard UI components if needed
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
  characterMap?: Map<number, RawCharacter>,
  bandMap?: Map<number, RawBand>,
  skillTargets?: RawSkillTarget[],
): SkillViewModel | null {
  const definition = definitions.find((entry) => entry.id === skillId);
  if (!definition) return null;

  const icon = icons.find((entry) => entry.id === definition.skillIconID);
  const textMap = new Map<string, RawText>();
  for (const entry of texts) textMap.set(entry.id, entry);
  const relevant = effects.filter((entry) => supportSkillEffectId(entry, kind) === skillId);
  if (relevant.length === 0) return null;

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
    kind: kind === "support" ? "live" : "gekisou", // map to standard SkillKind for standard UI components if needed
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

export function supportSkillEffectId(effect: RawSupportSkillEffect, kind: SupportSkillKind): number | undefined {
  if (kind === "support") return effect.supportSkillID;
  return effect.gekisouSupportSkillID;
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  return localizeMasterText(entry, locale);
}

/** Backwards-compatible export */
export const formatDescription = formatSkillDescription;

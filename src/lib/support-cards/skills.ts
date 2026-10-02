import type { AppLocale } from "@/config/locales";
import { getSkillIconUrl } from "@/lib/cards/assets";
import type { RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import {
  formatSkillDescription,
  groupEffectsByLevel,
  toSkillEffectViewModel,
  type RawSkillDefinition,
  type RawSkillEffect,
  type RawSkillIcon,
  type RawSkillCondition,
  type RawSkillConditionSet,
  type RawSkillCumulativeCondition,
  type RawSkillTarget,
  type SkillViewModel,
} from "@/lib/cards/skills";

// Extended support skill effect type including both standard and support card linking IDs
export type RawSupportSkillEffect = RawSkillEffect;

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
  characterMap?: Map<number, RawCharacter>,
  bandMap?: Map<number, RawBand>,
  skillTargets?: RawSkillTarget[],
): SkillViewModel | null {
  const definition = definitions.find((entry) => entry.id === skillId);
  if (!definition) return null;

  const icon = icons.find((entry) => entry.id === definition.skillIconID);
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const relevant = effects.filter((entry) => skillEffectId(entry, kind) === skillId);
  if (relevant.length === 0) return null;

  const template = localizeText(textMap.get(definition.descriptionTextFormatID), locale);
  const resolveText = (id: string) => localizeText(textMap.get(id), locale) || id;

  return {
    kind: kind === "support" ? "live" : "gekisou", // map to standard SkillKind for standard UI components if needed
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

function skillEffectId(effect: RawSupportSkillEffect, kind: SupportSkillKind): number | undefined {
  if (kind === "support") return effect.supportSkillID;
  return effect.gekisouSupportSkillID;
}

function localizeText(entry: RawText | undefined, locale: AppLocale): string {
  return localizeMasterText(entry, locale);
}

/** Backwards-compatible export */
export const formatDescription = formatSkillDescription;

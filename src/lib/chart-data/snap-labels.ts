import type { AppLocale } from "@/config/locales";
import { normalizeCards, validateMasterTable, type RawBand, type RawCharacter, type RawMemberCard, type RawText } from "@/lib/cards/data";
import type { RawSkillCondition, RawSkillConditionSet, RawSkillCumulativeCondition, RawSkillDefinition, RawSkillIcon, RawSkillTarget } from "@/lib/cards/skills";
import { normalizeSupportSkill, type RawSupportSkillEffect } from "@/lib/support-cards/skills";
import { normalizeSupportCards, type RawSupportCard } from "@/lib/support-cards/data";
import type { SnapLabeler } from "./snap-catalogue";
import type { SnapDeckData } from "./snap-types";

/** A caller-verified label sidecar from the same master, never the current build's unbound tables. */
export interface SnapLabelSource {
  format: "nnnotes.replay-labels/1";
  region: string;
  masterVersion: string;
  tables: Record<string, { sha256: string; rows: Record<string, unknown>[] }>;
}
const TABLES = ["MasterSupportSkill", "MasterSupportSkillEffect", "MasterGekisouSupportSkill", "MasterGekisouSupportSkillEffect", "MasterText", "MasterSkillConditionSet", "MasterSkillCondition", "MasterSkillCumulativeCondition", "MasterSkillTarget", "MasterCharacter", "MasterBand"] as const;

function checkSource(data: SnapDeckData, source: SnapLabelSource, tables: readonly string[]) {
  const provenance = data.provenance.master as { version?: string; tables?: Record<string, { sha256?: string }> } | undefined;
  if (source.format !== "nnnotes.replay-labels/1" || source.region !== data.provenance.region || source.masterVersion !== provenance?.version) throw new Error("Snap labels belong to another replay snapshot");
  for (const name of tables) {
    if (!source.tables[name] || !/^[0-9a-f]{64}$/.test(source.tables[name]!.sha256) || source.tables[name]!.sha256 !== provenance?.tables?.[name]?.sha256) throw new Error(`Snap label table identity differs: ${name}`);
  }
}
function sourceRows<T>(source: SnapLabelSource, name: string): T[] { return validateMasterTable<T>(source.tables[name]!.rows)._allData; }

/** Existing formatting/localization at the selected level; no skill description formula is duplicated here. */
export function buildSnapLabeler(data: SnapDeckData, source: SnapLabelSource, locale: AppLocale): SnapLabeler {
  checkSource(data, source, TABLES);
  const parsed = new Map(TABLES.map((name) => [name, sourceRows(source, name)]));
  const rows = <T>(name: string): T[] => parsed.get(name as typeof TABLES[number]) as T[];
  // Existing exports do not bind MasterSkillIcon. Omit its icon rather than silently borrowing another snapshot.
  const icons: RawSkillIcon[] = [];
  if (source.tables.MasterSkillIcon && (data.provenance.master as { tables?: Record<string, { sha256?: string }> }).tables?.MasterSkillIcon) {
    checkSource(data, source, ["MasterSkillIcon"]);
    icons.push(...sourceRows<RawSkillIcon>(source, "MasterSkillIcon"));
  }
  const characterMap = new Map(rows<RawCharacter>("MasterCharacter").map((row) => [row.id, row]));
  const bandMap = new Map(rows<RawBand>("MasterBand").map((row) => [row.id, row]));
  const cache = new Map<string, ReturnType<typeof normalizeSupportSkill>>();
  return (kind, skillId, level) => {
    const key = `${kind}:${skillId}`;
    if (!cache.has(key)) cache.set(key, normalizeSupportSkill(kind, skillId,
      rows<RawSkillDefinition>(kind === "support" ? "MasterSupportSkill" : "MasterGekisouSupportSkill"),
      rows<RawSupportSkillEffect>(kind === "support" ? "MasterSupportSkillEffect" : "MasterGekisouSupportSkillEffect"),
      icons, rows<RawText>("MasterText"), locale,
      rows<RawSkillConditionSet>("MasterSkillConditionSet"), rows<RawSkillCondition>("MasterSkillCondition"),
      rows<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition"), characterMap, bandMap, rows<RawSkillTarget>("MasterSkillTarget")));
    const skill = cache.get(key), effectLevel = skill?.levels.find((row) => row.level === level);
    return skill && effectLevel ? { name: skill.name, description: effectLevel.description, iconUrl: skill.iconUrl } : undefined;
  };
}

/** Actual existing card VMs/artwork IDs, localized from the same verified source. Max-power fields are display only. */
export function buildSnapReferenceCards(data: SnapDeckData, source: SnapLabelSource, locale: AppLocale) {
  checkSource(data, source, ["MasterMemberCard", "MasterSupportCard", "MasterCharacter", "MasterBand", "MasterText"]);
  const characters = sourceRows<RawCharacter>(source, "MasterCharacter"), bands = sourceRows<RawBand>(source, "MasterBand"), texts = sourceRows<RawText>(source, "MasterText");
  return {
    members: normalizeCards(sourceRows<RawMemberCard>(source, "MasterMemberCard"), characters, bands, texts, locale),
    snaps: normalizeSupportCards(sourceRows<RawSupportCard>(source, "MasterSupportCard"), characters, bands, texts, locale),
  };
}

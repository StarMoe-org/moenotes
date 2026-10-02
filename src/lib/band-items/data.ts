import type { AppLocale } from "@/config/locales";
import { validateMasterTable, type RawBand, type RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawBandItem {
  id: number;
  bandId: number;
  nameTextId: string;
  descriptionTextId: string;
  resourceGroupId: number;
  displayOrder: number;
}

export interface RawBandItemLevel {
  id: number;
  bandItemId: number;
  level: number;
  playerRank: number;
}

export interface RawBandItemSkillEffect {
  id: number;
  bandItemId: number;
  level: number;
  skillTargetIDs: number[];
  skillEffectType: number;
  effectValue: number;
}

export interface BandItemSkillEffect {
  level: number;
  value: number;
}

export interface BandItemViewModel {
  id: number;
  bandId: number;
  bandName: string;
  name: string;
  /** Per-level effect template from masterdata: keeps the `{0}` value slot and `<style>` markup, filled at render time. */
  description: string;
  /** MasterBandItem ships no image path — only `resourceGroupId`. Icon resolution is withheld until the key is known. */
  imageUrl: string;
  resourceGroupId: number;
  maxLevel: number;
  skillEffects: BandItemSkillEffect[];
  searchText: string;
}

export function normalizeBandItems(
  items: RawBandItem[],
  levels: RawBandItemLevel[],
  skillEffects: RawBandItemSkillEffect[],
  bands: RawBand[],
  texts: RawText[],
  locale: AppLocale,
): BandItemViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const bandMap = new Map(bands.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  const effectsByItem = new Map<number, BandItemSkillEffect[]>();
  for (const effect of skillEffects) {
    const row = { level: effect.level, value: effect.effectValue };
    const list = effectsByItem.get(effect.bandItemId);
    if (list) list.push(row);
    else effectsByItem.set(effect.bandItemId, [row]);
  }
  for (const list of effectsByItem.values()) list.sort((a, b) => a.level - b.level);

  const maxLevelByItem = new Map<number, number>();
  for (const row of levels) {
    maxLevelByItem.set(row.bandItemId, Math.max(maxLevelByItem.get(row.bandItemId) ?? 0, row.level));
  }

  return items
    .map((item) => {
      const name = resolveText(item.nameTextId);
      const description = resolveText(item.descriptionTextId);
      const band = bandMap.get(item.bandId);
      const bandName = band ? resolveText(band.nameTextID) : "";
      const effects = effectsByItem.get(item.id) ?? [];
      // MasterBandItemLevel stops at 30 while the skill effects keep scaling; the item's real cap is the top effect level.
      const maxLevel = Math.max(maxLevelByItem.get(item.id) ?? 0, effects.at(-1)?.level ?? 0);

      return {
        id: item.id,
        bandId: item.bandId,
        bandName,
        name,
        description,
        imageUrl: "",
        resourceGroupId: item.resourceGroupId,
        maxLevel,
        skillEffects: effects,
        searchText: [name, bandName, item.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.bandId - b.bandId || a.id - b.id);
}

export { validateMasterTable };

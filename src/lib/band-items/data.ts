import type { AppLocale } from "@/config/locales";
import { validateMasterTable, type RawBand, type RawText } from "@/lib/cards/data";
import { localizeMasterText, type LocalizableMasterText } from "@/lib/masterdata/localize-text";

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

/**
 * MasterSkillLevelResource is the shared upgrade-cost table (member cards, support cards and band items all pull
 * per-level materials from it). A band item reads the rows whose `group` is its `resourceGroupId`; `level` is the
 * level the materials buy, so a band item's level 1 row is the cost of obtaining it.
 */
export interface RawSkillLevelResource {
  id: number;
  group: number;
  level: number;
  itemID: number;
  count: number;
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
  resourceGroupId: number;
  maxLevel: number;
  skillEffects: BandItemSkillEffect[];
  searchText: string;
}

/**
 * `/band-item-upgrades.json`: upgrade materials, kept out of the list page's props (every level of every item is
 * ~600 KB) and fetched when an item's detail opens. One file serves every locale: material names are MasterText
 * rows the browser localizes. Servers sharing identical cost tables point at one entry of `groupSets`.
 */
export interface BandItemUpgradesPayload {
  /** Cost item id → its name (MasterText cells) and MasterItem image path. */
  items: Record<string, { name: LocalizableMasterText; imagePath: string }>;
  /** Distinct per-server cost tables: resourceGroupId → steps of `[level, [[itemId, count], …]]`, levels ascending. */
  groupSets: Array<Record<string, Array<[number, Array<[number, number]>]>>>;
  /** Server → index into `groupSets`. */
  servers: Record<string, number>;
}

/** One upgrade step, localized for display: every material owed to reach `level`. */
export interface BandItemUpgradeStep {
  level: number;
  costs: Array<{ itemId: number; itemName: string; itemImagePath: string; count: number }>;
}

/** MasterSkillLevelResource rows → resourceGroupId → compact steps (levels ascending, materials by item id). */
export function groupSkillLevelResources(rows: RawSkillLevelResource[]): Record<string, Array<[number, Array<[number, number]>]>> {
  const byGroup = new Map<number, Map<number, Array<[number, number]>>>();
  for (const row of rows) {
    const levels = byGroup.get(row.group) ?? new Map<number, Array<[number, number]>>();
    const costs = levels.get(row.level) ?? [];
    costs.push([row.itemID, row.count]);
    levels.set(row.level, costs);
    byGroup.set(row.group, levels);
  }
  const result: Record<string, Array<[number, Array<[number, number]>]>> = {};
  for (const [group, levels] of byGroup) {
    result[String(group)] = [...levels.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([level, costs]) => [level, costs.sort((a, b) => a[0] - b[0])]);
  }
  return result;
}

/** A band item's steps from the payload for `server`, material names localized for `locale`. */
export function resolveBandItemUpgradeSteps(
  payload: BandItemUpgradesPayload,
  server: string,
  resourceGroupId: number,
  locale: AppLocale,
): BandItemUpgradeStep[] {
  const setIndex = payload.servers[server];
  const steps = setIndex === undefined ? undefined : payload.groupSets[setIndex]?.[String(resourceGroupId)];
  if (!steps) return [];
  return steps.map(([level, costs]) => ({
    level,
    costs: costs.map(([itemId, count]) => {
      const item = payload.items[String(itemId)];
      return {
        itemId,
        itemName: (item && localizeMasterText(item.name, locale)) || `#${itemId}`,
        itemImagePath: item?.imagePath ?? "",
        count,
      };
    }),
  }));
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
        resourceGroupId: item.resourceGroupId,
        maxLevel,
        skillEffects: effects,
        searchText: [name, bandName, item.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.bandId - b.bandId || a.id - b.id);
}

export { validateMasterTable };

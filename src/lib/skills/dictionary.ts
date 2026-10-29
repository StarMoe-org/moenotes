import type { AppLocale } from "@/config/locales";
import type { CardViewModel, RawBand, RawCharacter, RawText } from "@/lib/cards/data";
import type { CardMaterialCost, CardMaterialStep, ItemCostResolver } from "@/lib/cards/materials";
import { compareByStartDesc, parseMasterDate } from "@/lib/schedule";
import {
  normalizeSkill,
  type RawSkillCondition,
  type RawSkillConditionSet,
  type RawSkillCumulativeCondition,
  type RawSkillDefinition,
  type RawSkillEffect,
  type RawSkillIcon,
  type RawSkillTarget,
} from "@/lib/cards/skills";
import { normalizeSupportSkill } from "@/lib/support-cards/skills";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export const SKILL_FAMILIES = ["live", "leader", "gekisou", "support", "gekisouSupport"] as const;
export type SkillFamily = (typeof SKILL_FAMILIES)[number];

export interface SkillSupportOwnerSummary {
  id: number;
  assetId: number;
  rarity: number;
  cardType: number;
  title: string;
  startAt: string;
}

export interface SkillDictionaryLevel {
  level: number;
  description: string;
}

export interface SkillDictionaryEntry {
  key: string;
  family: SkillFamily;
  id: number;
  name: string;
  iconUrl: string;
  levels: SkillDictionaryLevel[];
  startAt: string;
  bandIds: number[];
  memberIds: number[];
  supportOwners: SkillSupportOwnerSummary[];
  upgradeGroupIds: number[];
  searchText: string;
}

export interface SkillDictionaryViewModel {
  entries: SkillDictionaryEntry[];
  upgradeGroups: Record<number, CardMaterialStep[]>;
}

export interface RawMemberSkillResourceRow {
  id: number;
  liveSkillID?: number;
  gekisouSkillID?: number;
  liveSkillLevelResourceGroup?: number;
  gekisouSkillLevelResourceGroup?: number;
}

export interface BuildSkillDictionaryInput {
  leaderSkills: RawSkillDefinition[];
  leaderEffects: RawSkillEffect[];
  liveSkills: RawSkillDefinition[];
  liveEffects: RawSkillEffect[];
  gekisouSkills: RawSkillDefinition[];
  gekisouEffects: RawSkillEffect[];
  supportSkills: RawSkillDefinition[];
  supportEffects: RawSkillEffect[];
  gekisouSupportSkills: RawSkillDefinition[];
  gekisouSupportEffects: RawSkillEffect[];
  icons: RawSkillIcon[];
  conditionSets: RawSkillConditionSet[];
  conditions: RawSkillCondition[];
  cumulativeConditions: RawSkillCumulativeCondition[];
  skillTargets: RawSkillTarget[];
  skillResources: ReadonlyArray<{ group: number; level: number; itemID: number; count: number }>;
  memberResourceRows: readonly RawMemberSkillResourceRow[];
  characters: RawCharacter[];
  bands: RawBand[];
  texts: RawText[];
  memberCards: readonly CardViewModel[];
  supportCards: readonly SupportCardViewModel[];
  resolveItemCost: ItemCostResolver;
  locale: AppLocale;
}

function buildUpgradeGroups(
  rows: ReadonlyArray<{ group: number; level: number; itemID: number; count: number }>,
  resolveItemCost: ItemCostResolver,
): Record<number, CardMaterialStep[]> {
  const byGroup = new Map<number, Map<number, CardMaterialCost[]>>();
  for (const row of rows) {
    if (!row.group || !row.level || row.count <= 0) continue;
    let steps = byGroup.get(row.group);
    if (!steps) {
      steps = new Map();
      byGroup.set(row.group, steps);
    }
    const cost = resolveItemCost(row.itemID, row.count);
    const list = steps.get(row.level);
    if (list) list.push(cost);
    else steps.set(row.level, [cost]);
  }
  const out: Record<number, CardMaterialStep[]> = {};
  for (const [group, steps] of byGroup.entries()) {
    out[group] = [...steps.entries()]
      .sort(([a], [b]) => a - b)
      .map(([to, costs]) => ({ from: to - 1, to, costs }));
  }
  return out;
}

export function normalizeSkillDictionary(input: BuildSkillDictionaryInput): SkillDictionaryViewModel {
  const characterMap = new Map(input.characters.map((row) => [row.id, row]));
  const bandMap = new Map(input.bands.map((row) => [row.id, row]));
  const upgradeGroups = buildUpgradeGroups(input.skillResources, input.resolveItemCost);

  const memberByLeader = new Map<number, CardViewModel[]>();
  const memberByLive = new Map<number, CardViewModel[]>();
  const memberByGekisou = new Map<number, CardViewModel[]>();
  const pushMap = <T>(map: Map<number, T[]>, id: number, item: T) => {
    if (!id) return;
    const list = map.get(id);
    if (list) list.push(item);
    else map.set(id, [item]);
  };

  for (const card of input.memberCards) {
    pushMap(memberByLeader, card.leaderSkillId, card);
    pushMap(memberByLive, card.liveSkillId, card);
    pushMap(memberByGekisou, card.gekisouSkillId, card);
  }

  const supportBySkill = new Map<number, SupportCardViewModel[]>();
  const supportByGekisou = new Map<number, SupportCardViewModel[]>();
  for (const card of input.supportCards) {
    for (const id of new Set([card.supportSkillId01, card.supportSkillId02])) {
      pushMap(supportBySkill, id, card);
    }
    for (const id of new Set([card.gekisouSupportSkillId01, card.gekisouSupportSkillId02])) {
      pushMap(supportByGekisou, id, card);
    }
  }

  const liveUpgradeGroups = new Map<number, Set<number>>();
  const gekisouUpgradeGroups = new Map<number, Set<number>>();
  for (const row of input.memberResourceRows) {
    if (row.liveSkillID && row.liveSkillLevelResourceGroup && upgradeGroups[row.liveSkillLevelResourceGroup]) {
      let set = liveUpgradeGroups.get(row.liveSkillID);
      if (!set) {
        set = new Set();
        liveUpgradeGroups.set(row.liveSkillID, set);
      }
      set.add(row.liveSkillLevelResourceGroup);
    }
    if (row.gekisouSkillID && row.gekisouSkillLevelResourceGroup && upgradeGroups[row.gekisouSkillLevelResourceGroup]) {
      let set = gekisouUpgradeGroups.get(row.gekisouSkillID);
      if (!set) {
        set = new Set();
        gekisouUpgradeGroups.set(row.gekisouSkillID, set);
      }
      set.add(row.gekisouSkillLevelResourceGroup);
    }
  }

  const entries: SkillDictionaryEntry[] = [];

  const collectMemberFamily = (
    family: "leader" | "live" | "gekisou",
    defs: RawSkillDefinition[],
    effects: RawSkillEffect[],
    ownersMap: Map<number, CardViewModel[]>,
    resMap?: Map<number, Set<number>>,
  ) => {
    for (const def of [...defs].sort((a, b) => a.id - b.id)) {
      const vm = normalizeSkill(
        family,
        def.id,
        defs,
        effects,
        input.icons,
        input.texts,
        input.locale,
        input.conditionSets,
        input.conditions,
        input.cumulativeConditions,
        input.skillTargets,
        characterMap,
        bandMap,
      );
      if (!vm) continue;
      const owners = [...(ownersMap.get(def.id) ?? [])].sort(compareByStartDesc);
      const newestStartAt = owners.find((c) => parseMasterDate(c.startAt) !== null)?.startAt ?? "";
      const bandIds = [...new Set(owners.map((c) => c.bandId).filter((id) => id > 0))].sort((a, b) => a - b);
      const levels = vm.levels.map((lv) => ({ level: lv.level, description: lv.description }));
      const searchParts = [
        String(def.id),
        vm.name,
        ...levels.map((lv) => lv.description),
        ...owners.flatMap((c) => [c.characterName, c.title, c.bandName]),
      ];
      entries.push({
        key: `${family}:${def.id}`,
        family,
        id: def.id,
        name: vm.name,
        iconUrl: vm.iconUrl,
        levels,
        startAt: newestStartAt,
        bandIds,
        memberIds: owners.map((c) => c.id),
        supportOwners: [],
        upgradeGroupIds: [...(resMap?.get(def.id) ?? [])].sort((a, b) => a - b),
        searchText: searchParts.join(" ").toLocaleLowerCase(),
      });
    }
  };

  collectMemberFamily("live", input.liveSkills, input.liveEffects, memberByLive, liveUpgradeGroups);
  collectMemberFamily("leader", input.leaderSkills, input.leaderEffects, memberByLeader);
  collectMemberFamily("gekisou", input.gekisouSkills, input.gekisouEffects, memberByGekisou, gekisouUpgradeGroups);

  const collectSupportFamily = (
    family: "support" | "gekisouSupport",
    defs: RawSkillDefinition[],
    effects: RawSkillEffect[],
    ownersMap: Map<number, SupportCardViewModel[]>,
  ) => {
    const supportKind = family === "support" ? "support" : "gekisou-support";
    for (const def of [...defs].sort((a, b) => a.id - b.id)) {
      const vm = normalizeSupportSkill(
        supportKind,
        def.id,
        defs,
        effects,
        input.icons,
        input.texts,
        input.locale,
        input.conditionSets,
        input.conditions,
        input.cumulativeConditions,
        characterMap,
        bandMap,
        input.skillTargets,
      );
      if (!vm) continue;
      const owners = [...(ownersMap.get(def.id) ?? [])].sort(compareByStartDesc);
      const newestStartAt = owners.find((c) => parseMasterDate(c.startAt) !== null)?.startAt ?? "";
      const bandIds = [...new Set(owners.map((c) => c.bandId).filter((id) => id > 0))].sort((a, b) => a - b);
      const supportOwners: SkillSupportOwnerSummary[] = owners.map((c) => ({
        id: c.id,
        assetId: c.assetId,
        rarity: c.rarity,
        cardType: c.cardType,
        title: c.title,
        startAt: c.startAt,
      }));
      const levels = vm.levels.map((lv) => ({ level: lv.level, description: lv.description }));
      const searchParts = [
        String(def.id),
        vm.name,
        ...levels.map((lv) => lv.description),
        ...owners.flatMap((c) => [c.title, ...c.characters.map((ch) => ch.name)]),
      ];
      entries.push({
        key: `${family}:${def.id}`,
        family,
        id: def.id,
        name: vm.name,
        iconUrl: vm.iconUrl,
        levels,
        startAt: newestStartAt,
        bandIds,
        memberIds: [],
        supportOwners,
        upgradeGroupIds: [],
        searchText: searchParts.join(" ").toLocaleLowerCase(),
      });
    }
  };

  collectSupportFamily("support", input.supportSkills, input.supportEffects, supportBySkill);
  collectSupportFamily("gekisouSupport", input.gekisouSupportSkills, input.gekisouSupportEffects, supportByGekisou);

  entries.sort((a, b) => compareByStartDesc(a, b) || b.id - a.id);

  return { entries, upgradeGroups };
}

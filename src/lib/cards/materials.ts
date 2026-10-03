import type { EntityLink } from "@/lib/route/entity-link";

/*
 * Upgrade materials of one card, step by step (training, awakening, skill levels, limit break), from the
 * MasterMemberCardAwakeResource / MasterMemberCardRank / MasterSkillLevelResource / MasterSupportCardRank tables.
 * Pure: the build selector (build-card-materials.ts) resolves item names and icons and passes them in.
 */

export type CardMaterialKind = "training" | "awaken" | "liveSkill" | "gekisouSkill" | "limitBreak";

export interface CardMaterialCost {
  /** Stable across steps (an item id, or `card:<id>` for copies of a card). */
  id: string;
  name: string;
  /** Server-neutral release URL; "" when unknown. */
  imageUrl: string;
  count: number;
  link?: EntityLink;
}

export interface CardMaterialStep {
  from: number;
  to: number;
  costs: CardMaterialCost[];
}

export interface CardMaterialGroup {
  kind: CardMaterialKind;
  steps: CardMaterialStep[];
  /** Awakening: the band's piece of the card's rarity, which the game accepts in place of the card's own piece. */
  alternative?: CardMaterialCost;
}

export interface CardMaterials {
  groups: CardMaterialGroup[];
  /** The gacha voice line's audio (member cards); "" when none. */
  gachaVoiceUrl: string;
}

export type ItemCostResolver = (itemId: number, count: number) => CardMaterialCost;

/** Rows keyed by a step number (awakeCount, level, rank): one step per value, from the previous value. */
function stepsOf<T>(rows: readonly T[], stepOf: (row: T) => number, cost: (row: T) => CardMaterialCost | null): CardMaterialStep[] {
  const byStep = new Map<number, CardMaterialCost[]>();
  for (const row of rows) {
    const value = cost(row);
    if (!value || value.count <= 0) continue;
    const list = byStep.get(stepOf(row));
    if (list) list.push(value);
    else byStep.set(stepOf(row), [value]);
  }
  return [...byStep].sort(([a], [b]) => a - b).map(([to, costs]) => ({ from: to - 1, to, costs }));
}

export interface MemberCardMaterialSource {
  awakeResourceGroup: number;
  rankGroup: number;
  liveSkillResourceGroup: number;
  gekisouSkillResourceGroup: number;
  rankUpItemId: number;
  /** The band's piece of the card's rarity (0 when none). */
  bandRankUpItemId: number;
}

export interface MemberCardMaterialTables {
  awakeResources: ReadonlyArray<{ group: number; awakeCount: number; itemId: number; count: number }>;
  ranks: ReadonlyArray<{ group: number; rank: number; requiredRankUpItemCount: number }>;
  skillResources: ReadonlyArray<{ group: number; level: number; itemID: number; count: number }>;
}

export function buildMemberCardMaterials(card: MemberCardMaterialSource, tables: MemberCardMaterialTables, item: ItemCostResolver): CardMaterialGroup[] {
  const skill = (group: number) => group > 0
    ? stepsOf(tables.skillResources.filter((row) => row.group === group), (row) => row.level, (row) => item(row.itemID, row.count))
    : [];
  const groups: CardMaterialGroup[] = [
    {
      kind: "training",
      steps: stepsOf(tables.awakeResources.filter((row) => row.group === card.awakeResourceGroup), (row) => row.awakeCount, (row) => item(row.itemId, row.count)),
    },
    {
      kind: "awaken",
      steps: card.rankUpItemId > 0
        ? stepsOf(tables.ranks.filter((row) => row.group === card.rankGroup), (row) => row.rank, (row) => item(card.rankUpItemId, row.requiredRankUpItemCount))
        : [],
      ...(card.bandRankUpItemId > 0 && card.bandRankUpItemId !== card.rankUpItemId ? { alternative: item(card.bandRankUpItemId, 0) } : {}),
    },
    { kind: "liveSkill", steps: skill(card.liveSkillResourceGroup) },
    { kind: "gekisouSkill", steps: skill(card.gekisouSkillResourceGroup) },
  ];
  return groups.filter((group) => group.steps.length > 0);
}

/** Support card limit break: each rank costs copies of the same card. */
export function buildSupportCardMaterials(
  rankGroup: number,
  ranks: ReadonlyArray<{ group: number; rank: number; requiredRankUpItemCount: number }>,
  sameCard: (count: number) => CardMaterialCost,
): CardMaterialGroup[] {
  const steps = stepsOf(ranks.filter((row) => row.group === rankGroup), (row) => row.rank, (row) => sameCard(row.requiredRankUpItemCount));
  return steps.length ? [{ kind: "limitBreak", steps }] : [];
}

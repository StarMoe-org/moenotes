import type { AppLocale } from "@/config/locales";
import type { CardViewModel, RawText } from "@/lib/cards/data";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RewardResolver, RewardViewModel } from "@/lib/rewards/resources";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export interface RawGacha {
  id: number;
  nameTextId: string;
  descriptionTextId: string;
  lotGroupId: number;
  startAt: string;
  endAt: string;
  priority: number;
  isLimited: boolean;
  bannerAssetName: string;
  logoAssetName: string;
  productId1?: number;
  productId2?: number;
  productId3?: number;
  productId4?: number;
  /** MasterGachaBonus ids granted on top of product 1–4. */
  gachaBonusIds1?: number[];
  gachaBonusIds2?: number[];
  gachaBonusIds3?: number[];
  gachaBonusIds4?: number[];
  /** Step-up chain id (0 or missing when the gacha is not a step-up). */
  stepUpId?: number;
  /** Group id linking to MasterGachaGimmick rows (0 = no gimmick). */
  gimmickGroupId?: number;
  /** View label id (0 = none); the label lives in MasterGachaViewLabel. */
  viewLabelId?: number;
}

export interface RawGachaBonus {
  id: number;
  /** 1 = granted after each draw, 2 = granted after the draw count is reached. */
  bonusDrawTiming: number;
  requiredGachaDrawCount: number;
  bonusDrawCount: number;
}

export interface RawGachaBonusLot {
  id: number;
  gachaBonusId: number;
  /** Same space as MasterGachaPrize.resourceType (1=item, 2=member, 3=support). */
  bonusPrizeType: number;
  bonusPrizeId: number;
  bonusPrizeCount: number;
  weight: number;
}

export interface RawGachaStepUpStep {
  id: number;
  stepUpId: number;
  /** 1-based position in the chain. */
  step: number;
  /** Star / paid-star cost of this step; 0 means free. */
  cost?: number;
  drawCount: number;
  ensuredCount?: number;
  ensuredRarity?: number;
}

export interface RawGachaStepUp {
  id: number;
  /** Optional display name (MasterText key); some builds carry only steps. */
  nameTextId?: string;
  steps?: RawGachaStepUpStep[];
}

export interface RawGachaGimmick {
  id: number;
  groupId: number;
  /** Internal mechanic name; kept verbatim for display. */
  branchName: string;
  branchEntry: number;
  normalWeight: number;
  ssrWeight: number;
}

export interface RawGachaViewLabel {
  id: number;
  /** MasterText key of the badge on the banner. */
  nameTextId?: string;
  labelTextId?: string;
}

export interface RawGachaProduct {
  id: number;
  drawCount: number;
  ensuredCount: number;
  ensuredRarity: number;
  /** MasterText key of the option's own name, e.g. `gacha_rates_label_draw_one_paid` → "Pull 1 Time (Paid)". */
  ratesLabelTextId?: string;
}

export interface RawGachaLot {
  lotGroupId: number;
  rarityConstraint: number;
  resourceTypeConstraint: number;
  prizeGroupId: number;
  weight: number;
}

export interface RawGachaPrize {
  groupId: number;
  resourceType: number;
  resourceId: number;
  amount: number;
  pickUpType: number;
  /** Share of the lot, in percent, that goes to the rate-up prizes as a group (50 → every other draw from this lot). */
  pickUpFixedRate?: number;
}

export interface RawGachaView {
  gachaId: number;
  memberCardIds: number[];
  supportCardIds: number[];
}

// MasterGachaPrize.resourceType
const RESOURCE_ITEM = 1;
const RESOURCE_MEMBER = 2;
const RESOURCE_SUPPORT = 3;

/** A draw option's game name without the quotes it is written in (CJK corner brackets, or straight/curly quotes in English). */
export function optionLabel(text: string): string {
  return text.trim().replace(/^[「『"“]+|[」』"”]+$/g, "").trim(); // i18n-allow-hardcoded: the game's quote marks
}

/** Per-product bonus pools (each draw of that product grants one of the lots, weighted). */
function bonusRewardsFor(
  gachaBonusIds: number[] | undefined,
  bonusMap: Map<number, RawGachaBonus>,
  bonusLotsById: Map<number, RawGachaBonusLot[]>,
  resolveReward: RewardResolver | undefined,
): GachaBonusRule[] {
  if (!gachaBonusIds?.length) return [];
  const rules: GachaBonusRule[] = [];
  for (const id of gachaBonusIds) {
    const bonus = bonusMap.get(id);
    if (!bonus) continue;
    const lots = bonusLotsById.get(id) ?? [];
    const totalWeight = lots.reduce((sum, lot) => sum + Math.max(0, lot.weight), 0);
    rules.push({
      id: bonus.id,
      timing: bonus.bonusDrawTiming,
      requiredDrawCount: bonus.requiredGachaDrawCount,
      bonusDrawCount: bonus.bonusDrawCount,
      rewards: lots.map((lot) => ({
        id: lot.id,
        rate: totalWeight ? (Math.max(0, lot.weight) / totalWeight) * 100 : 0,
        reward: resolveReward
          ? resolveReward({ resourceType: lot.bonusPrizeType, resourceId: lot.bonusPrizeId, resourceCount: lot.bonusPrizeCount })
          : { kind: "other", id: lot.bonusPrizeId, count: lot.bonusPrizeCount, name: "", imageUrl: "" },
      })),
    });
  }
  return rules;
}

function normalizeStepUp(stepUpId: number | undefined, chains: Map<number, RawGachaStepUp>, textOf: (id: string | undefined) => string): GachaStepUpChain | null {
  if (!stepUpId) return null;
  const chain = chains.get(stepUpId);
  if (!chain) return null;
  const steps = (chain.steps ?? [])
    .filter((step) => step.step > 0)
    .sort((a, b) => a.step - b.step)
    .map((step) => ({
      step: step.step,
      cost: Math.max(0, step.cost ?? 0),
      drawCount: Math.max(0, step.drawCount),
      ensuredCount: Math.max(0, step.ensuredCount ?? 0),
      ensuredRarity: Math.max(0, step.ensuredRarity ?? 0),
    }));
  return { id: chain.id, name: textOf(chain.nameTextId), steps };
}
// Rate-up prizes; ordinary entries use pickUpType 1.
const PICKUP_RATE_UP = 2;

export type GachaPoolKind = "member" | "support" | "item";

export interface GachaPool {
  kind: GachaPoolKind;
  /** Card rarity; 0 for item pools. */
  rarity: number;
  /** Chance per draw, in percent. */
  rate: number;
  count: number;
  pickupCount: number;
  /** Percent of this pool's draws that land on rate-up cards, when the data fixes it. */
  pickupShare: number;
}

/** One drawable prize with its absolute weight (lot weights are basis points of a single draw). */
export interface GachaDrawEntry {
  kind: GachaPoolKind;
  id: number;
  amount: number;
  rarity: number;
  weight: number;
  pickup: boolean;
}

export interface GachaDrawPlan {
  count: number;
  /** The last `guaranteeCount` draws come from prizes of at least `guaranteeRarity`. */
  guaranteeCount: number;
  guaranteeRarity: number;
}

export interface GachaItemPrize {
  id: number;
  name: string;
  imagePath: string;
  amount: number;
}

export interface GachaPickupCharacter {
  id: number;
  name: string;
}

/** List/home summary. Detail pages receive {@link GachaDetailViewModel}. */
export interface GachaViewModel {
  id: number;
  name: string;
  description: string;
  bannerPath: string;
  startAt: string;
  endAt: string;
  isLimited: boolean;
  memberCount: number;
  supportCount: number;
  itemCount: number;
  pickupCharacters: GachaPickupCharacter[];
  /** Bands of the rate-up cards, used by the band filter. */
  bandIds: number[];
  searchText: string;
}

export interface GachaBonusRewardEntry {
  id: number;
  /** Share of the bonus lot, in percent, across the lot's rows. */
  rate: number;
  /** Resolved display (icon, name, link); kind "other" without name/image when the resource is unknown. */
  reward: RewardViewModel;
}

export interface GachaBonusRule {
  id: number;
  /** 1 = granted after each draw, 2 = granted after the draw count is reached. */
  timing: number;
  requiredDrawCount: number;
  bonusDrawCount: number;
  rewards: GachaBonusRewardEntry[];
}

/** The bonus of one draw option (productId1–4): what buying that option once grants on top. */
export interface GachaProductBonus {
  /** The slot, 1–4. */
  slot: number;
  /** The game's name of the option ("Pull 1 Time (Paid)", without its quotes); "" when it has none. */
  label: string;
  drawCount: number;
  rules: GachaBonusRule[];
}

export interface GachaStepUpStepEntry {
  step: number;
  cost: number;
  drawCount: number;
  ensuredCount: number;
  ensuredRarity: number;
}

export interface GachaStepUpChain {
  id: number;
  name: string;
  steps: GachaStepUpStepEntry[];
}

export interface GachaGimmickEntry {
  id: number;
  branchName: string;
  branchEntry: number;
  normalWeight: number;
  ssrWeight: number;
}

export interface GachaDetailViewModel extends GachaViewModel {
  logoPath: string;
  pools: GachaPool[];
  memberCards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  items: GachaItemPrize[];
  pickupMemberIds: number[];
  pickupSupportIds: number[];
  draws: GachaDrawEntry[];
  drawPlans: { single: GachaDrawPlan; ten: GachaDrawPlan };
  /** Bonuses of the draw options that grant one, in slot order (productId1–4); empty when the gacha grants no extras. */
  bonusRewards: GachaProductBonus[];
  /** Step-up chain when the gacha is a step-up banner. */
  stepUp: GachaStepUpChain | null;
  /**
   * MasterGachaGimmick branches: weights of the draw animation's variants (only `Weather` so far), for normal draws
   * and for draws that bring an SSR. They pick the presentation, not the prize; empty when no gimmick.
   */
  gimmicks: GachaGimmickEntry[];
  /** Extra banner label point set on top of the banner (already localized; "" when none). */
  viewLabel: string;
}

const poolKindOrder: Record<GachaPoolKind, number> = { member: 0, support: 1, item: 2 };

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

function poolKind(resourceType: number): GachaPoolKind {
  return resourceType === RESOURCE_MEMBER ? "member" : resourceType === RESOURCE_SUPPORT ? "support" : "item";
}

function pickupShareOf(prizes: RawGachaPrize[]): number {
  const shares = prizes.filter((prize) => prize.pickUpType === PICKUP_RATE_UP).map((prize) => prize.pickUpFixedRate ?? 0);
  return Math.min(100, Math.max(0, ...shares, 0));
}

function drawEntriesForLot(lot: RawGachaLot, prizes: RawGachaPrize[], kind: GachaPoolKind, rarityOf: (prize: RawGachaPrize) => number): GachaDrawEntry[] {
  const weight = Math.max(0, lot.weight);
  const pickups = prizes.filter((prize) => prize.pickUpType === PICKUP_RATE_UP);
  const rest = prizes.filter((prize) => prize.pickUpType !== PICKUP_RATE_UP);
  // The rate-up group takes its fixed share of the lot, split evenly; the other prizes split the remainder.
  // Without a share (or without anything else in the lot) every prize is equally likely.
  const share = pickups.length && rest.length ? pickupShareOf(prizes) / 100 : 0;
  const evenWeight = prizes.length ? weight / prizes.length : 0;
  const pickupWeight = share ? (weight * share) / pickups.length : evenWeight;
  const restWeight = share ? (weight * (1 - share)) / rest.length : evenWeight;
  return prizes.map((prize) => ({
    kind,
    id: prize.resourceId,
    amount: prize.amount,
    rarity: rarityOf(prize),
    weight: prize.pickUpType === PICKUP_RATE_UP ? pickupWeight : restWeight,
    pickup: prize.pickUpType === PICKUP_RATE_UP,
  }));
}

function drawPlan(products: RawGachaProduct[], count: number): GachaDrawPlan {
  const plans = products.filter((product) => product.drawCount === count).map((product) => ({
    count,
    guaranteeCount: product.ensuredRarity > 0 ? Math.min(product.ensuredCount, count) : 0,
    guaranteeRarity: product.ensuredCount > 0 ? product.ensuredRarity : 0,
  }));
  return plans.sort((a, b) => b.guaranteeRarity - a.guaranteeRarity || b.guaranteeCount - a.guaranteeCount)[0] ?? { count, guaranteeCount: 0, guaranteeRarity: 0 };
}

export interface GachaDetailTables {
  bonuses?: RawGachaBonus[];
  bonusLots?: RawGachaBonusLot[];
  stepUps?: RawGachaStepUp[];
  gimmicks?: RawGachaGimmick[];
  viewLabels?: RawGachaViewLabel[];
  /** Resolves a bonus lot row to its display model; omit to skip name/icon resolution. */
  resolveReward?: RewardResolver;
}

export function normalizeGachas(
  gachas: RawGacha[],
  lots: RawGachaLot[],
  prizes: RawGachaPrize[],
  views: RawGachaView[],
  products: RawGachaProduct[],
  cards: CardViewModel[],
  supportCards: SupportCardViewModel[],
  items: ItemViewModel[],
  texts: RawText[],
  locale: AppLocale,
  detail: GachaDetailTables = {},
): GachaDetailViewModel[] {
  const textMap = new Map(texts.map((row) => [row.id, row]));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const supportMap = new Map(supportCards.map((card) => [card.id, card]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lotsByGroup = groupBy(lots, (lot) => lot.lotGroupId);
  const prizesByGroup = groupBy(prizes, (prize) => prize.groupId);
  const viewsByGacha = groupBy(views, (view) => view.gachaId);
  const productMap = new Map(products.map((product) => [product.id, product]));
  const bonusMap = new Map((detail.bonuses ?? []).map((bonus) => [bonus.id, bonus]));
  const bonusLotsById = groupBy(detail.bonusLots ?? [], (lot) => lot.gachaBonusId);
  const stepUpMap = new Map((detail.stepUps ?? []).map((chain) => [chain.id, chain]));
  const gimmicksByGroup = groupBy(detail.gimmicks ?? [], (gimmick) => gimmick.groupId);
  const viewLabelMap = new Map((detail.viewLabels ?? []).map((label) => [label.id, label]));
  const textOf = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");

  return [...gachas]
    .sort((a, b) => b.priority - a.priority || a.id - b.id)
    .map((gacha) => {
      const gachaLots = lotsByGroup.get(gacha.lotGroupId) ?? [];
      const totalWeight = gachaLots.reduce((sum, lot) => sum + Math.max(0, lot.weight), 0);
      const pools = new Map<string, GachaPool>();
      const memberIds = new Set<number>();
      const supportIds = new Set<number>();
      const pickupMemberIds = new Set<number>();
      const pickupSupportIds = new Set<number>();
      const itemAmounts = new Map<number, number>();
      const draws: GachaDrawEntry[] = [];

      for (const lot of gachaLots) {
        const groupPrizes = prizesByGroup.get(lot.prizeGroupId) ?? [];
        // The prize rows are authoritative; a few lots carry a stale resource constraint.
        const resourceType = groupPrizes[0]?.resourceType ?? lot.resourceTypeConstraint;
        const kind = poolKind(resourceType);
        const rarity = kind === "item" ? 0 : lot.rarityConstraint;
        const key = `${kind}:${rarity}`;
        const pool = pools.get(key) ?? { kind, rarity, rate: 0, count: 0, pickupCount: 0, pickupShare: 0 };
        pool.rate += totalWeight ? (lot.weight / totalWeight) * 100 : 0;
        for (const prize of groupPrizes) {
          const isPickup = prize.pickUpType === PICKUP_RATE_UP;
          if (prize.resourceType === RESOURCE_MEMBER) {
            memberIds.add(prize.resourceId);
            if (isPickup) pickupMemberIds.add(prize.resourceId);
          } else if (prize.resourceType === RESOURCE_SUPPORT) {
            supportIds.add(prize.resourceId);
            if (isPickup) pickupSupportIds.add(prize.resourceId);
          } else if (prize.resourceType === RESOURCE_ITEM) {
            itemAmounts.set(prize.resourceId, prize.amount);
          }
        }
        draws.push(...drawEntriesForLot(lot, groupPrizes, kind, (prize) => {
          if (kind === "member") return cardMap.get(prize.resourceId)?.rarity ?? rarity;
          if (kind === "support") return supportMap.get(prize.resourceId)?.rarity ?? rarity;
          return 0;
        }));
        pool.count += groupPrizes.length;
        pool.pickupCount += groupPrizes.filter((prize) => prize.pickUpType === PICKUP_RATE_UP).length;
        pool.pickupShare = Math.max(pool.pickupShare, pickupShareOf(groupPrizes));
        pools.set(key, pool);
      }

      for (const view of viewsByGacha.get(gacha.id) ?? []) {
        for (const id of view.memberCardIds ?? []) pickupMemberIds.add(id);
        for (const id of view.supportCardIds ?? []) pickupSupportIds.add(id);
      }

      const byPickupThenRarity = <T extends { id: number; rarity: number }>(pickups: Set<number>) => (a: T, b: T) =>
        Number(pickups.has(b.id)) - Number(pickups.has(a.id)) || b.rarity - a.rarity || a.id - b.id;
      const memberCards = [...memberIds].flatMap((id) => cardMap.get(id) ?? []).sort(byPickupThenRarity(pickupMemberIds));
      const gachaSupportCards = [...supportIds].flatMap((id) => supportMap.get(id) ?? []).sort(byPickupThenRarity(pickupSupportIds));
      const gachaItems = [...itemAmounts].flatMap(([id, amount]) => {
        const item = itemMap.get(id);
        return item ? [{ id, name: item.name, imagePath: item.imagePath, amount }] : [];
      });

      const pickupMembers = memberCards.filter((card) => pickupMemberIds.has(card.id));
      const pickupSupports = gachaSupportCards.filter((card) => pickupSupportIds.has(card.id));
      const pickupCharacters = new Map<number, GachaPickupCharacter>();
      for (const card of pickupMembers) pickupCharacters.set(card.characterId, { id: card.characterId, name: card.characterName });
      for (const card of pickupSupports) {
        for (const character of card.characters) pickupCharacters.set(character.id, { id: character.id, name: character.name });
      }
      const bandIds = [...new Set([...pickupMembers, ...pickupSupports].map((card) => card.bandId).filter(Boolean))].sort((a, b) => a - b);

      const gachaProducts = [gacha.productId1, gacha.productId2, gacha.productId3, gacha.productId4].flatMap((id) => (id ? productMap.get(id) ?? [] : []));
      const name = localizeMasterText(textMap.get(gacha.nameTextId), locale) || `#${gacha.id}`;
      const description = localizeMasterText(textMap.get(gacha.descriptionTextId), locale);
      const pickupText = [...pickupMembers, ...pickupSupports].map((card) => card.title).join(" ");

      return {
        id: gacha.id,
        name,
        description,
        bannerPath: gacha.bannerAssetName,
        logoPath: gacha.logoAssetName,
        startAt: gacha.startAt,
        endAt: gacha.endAt,
        isLimited: gacha.isLimited,
        memberCount: memberCards.length,
        supportCount: gachaSupportCards.length,
        itemCount: gachaItems.length,
        pickupCharacters: [...pickupCharacters.values()],
        bandIds,
        searchText: [name, description, pickupText, ...[...pickupCharacters.values()].map((character) => character.name), gacha.id].join(" ").toLocaleLowerCase(),
        pools: [...pools.values()].sort((a, b) => poolKindOrder[a.kind] - poolKindOrder[b.kind] || b.rarity - a.rarity),
        memberCards,
        supportCards: gachaSupportCards,
        items: gachaItems,
        pickupMemberIds: [...pickupMemberIds].filter((id) => cardMap.has(id)),
        pickupSupportIds: [...pickupSupportIds].filter((id) => supportMap.has(id)),
        // Prizes missing from the card/item tables cannot be shown, so they are not drawn either.
        draws: draws.filter((entry) => entry.weight > 0 && (entry.kind === "member" ? cardMap.has(entry.id) : entry.kind === "support" ? supportMap.has(entry.id) : itemMap.has(entry.id))),
        drawPlans: { single: drawPlan(gachaProducts, 1), ten: drawPlan(gachaProducts, 10) },
        bonusRewards: ([gacha.productId1, gacha.productId2, gacha.productId3, gacha.productId4] as const).flatMap((productId, index): GachaProductBonus[] => {
          const rules = bonusRewardsFor([gacha.gachaBonusIds1, gacha.gachaBonusIds2, gacha.gachaBonusIds3, gacha.gachaBonusIds4][index], bonusMap, bonusLotsById, detail.resolveReward);
          if (!rules.length) return [];
          const product = productId ? productMap.get(productId) : undefined;
          return [{ slot: index + 1, label: optionLabel(textOf(product?.ratesLabelTextId)), drawCount: product?.drawCount ?? 0, rules }];
        }),
        stepUp: normalizeStepUp(gacha.stepUpId, stepUpMap, textOf),
        gimmicks: (gimmicksByGroup.get(gacha.gimmickGroupId ?? 0) ?? []).map((gimmick) => ({
          id: gimmick.id,
          branchName: gimmick.branchName,
          branchEntry: gimmick.branchEntry,
          normalWeight: gimmick.normalWeight,
          ssrWeight: gimmick.ssrWeight,
        })),
        viewLabel: textOf(viewLabelMap.get(gacha.viewLabelId ?? 0)?.labelTextId ?? viewLabelMap.get(gacha.viewLabelId ?? 0)?.nameTextId),
      };
    });
}

export function toGachaSummary(gacha: GachaDetailViewModel): GachaViewModel {
  const { id, name, description, bannerPath, startAt, endAt, isLimited, memberCount, supportCount, itemCount, pickupCharacters, bandIds, searchText } = gacha;
  return { id, name, description, bannerPath, startAt, endAt, isLimited, memberCount, supportCount, itemCount, pickupCharacters, bandIds, searchText };
}

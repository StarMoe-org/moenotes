import type { AppLocale } from "@/config/locales";
import type { CardViewModel, RawText } from "@/lib/cards/data";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
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

export interface GachaDetailViewModel extends GachaViewModel {
  logoPath: string;
  pools: GachaPool[];
  memberCards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  items: GachaItemPrize[];
  pickupMemberIds: number[];
  pickupSupportIds: number[];
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

export function normalizeGachas(
  gachas: RawGacha[],
  lots: RawGachaLot[],
  prizes: RawGachaPrize[],
  views: RawGachaView[],
  cards: CardViewModel[],
  supportCards: SupportCardViewModel[],
  items: ItemViewModel[],
  texts: RawText[],
  locale: AppLocale,
): GachaDetailViewModel[] {
  const textMap = new Map(texts.map((row) => [row.id, row]));
  const cardMap = new Map(cards.map((card) => [card.id, card]));
  const supportMap = new Map(supportCards.map((card) => [card.id, card]));
  const itemMap = new Map(items.map((item) => [item.id, item]));
  const lotsByGroup = groupBy(lots, (lot) => lot.lotGroupId);
  const prizesByGroup = groupBy(prizes, (prize) => prize.groupId);
  const viewsByGacha = groupBy(views, (view) => view.gachaId);

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

      for (const lot of gachaLots) {
        const groupPrizes = prizesByGroup.get(lot.prizeGroupId) ?? [];
        // The prize rows are authoritative; a few lots carry a stale resource constraint.
        const resourceType = groupPrizes[0]?.resourceType ?? lot.resourceTypeConstraint;
        const kind = poolKind(resourceType);
        const rarity = kind === "item" ? 0 : lot.rarityConstraint;
        const key = `${kind}:${rarity}`;
        const pool = pools.get(key) ?? { kind, rarity, rate: 0, count: 0, pickupCount: 0 };
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
        pool.count += groupPrizes.length;
        pool.pickupCount += groupPrizes.filter((prize) => prize.pickUpType === PICKUP_RATE_UP).length;
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
      };
    });
}

export function toGachaSummary(gacha: GachaDetailViewModel): GachaViewModel {
  const { id, name, description, bannerPath, startAt, endAt, isLimited, memberCount, supportCount, itemCount, pickupCharacters, bandIds, searchText } = gacha;
  return { id, name, description, bannerPath, startAt, endAt, isLimited, memberCount, supportCount, itemCount, pickupCharacters, bandIds, searchText };
}

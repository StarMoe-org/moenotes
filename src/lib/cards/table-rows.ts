import type { CardTableRow } from "@/components/shared/CardTable";
import { getCardThumbnailUrl, getCardTypeIconUrl, getRarityIconUrl } from "@/lib/cards/assets";
import type { CardViewModel } from "@/lib/cards/data";
import type { GameServer } from "@/config/servers";
import { getSupportCardThumbnailUrl, getSupportCardTypeIconUrl, getSupportRarityIconUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

type WithServers = { servers?: readonly GameServer[] };

/** A member card as a row of the card list's table view. */
export function cardTableRow(card: CardViewModel & WithServers, skillName: string): CardTableRow {
  return {
    id: card.id,
    title: card.title,
    characterNames: card.characterName,
    bandName: card.bandName,
    rarity: card.rarity,
    cardType: card.cardType,
    performancePower: card.performancePower,
    technicPower: card.technicPower,
    visualPower: card.visualPower,
    totalPower: card.totalPower,
    skillName,
    startAt: card.startAt,
    thumbnailUrl: getCardThumbnailUrl(card.assetId),
    rarityIconUrl: getRarityIconUrl(card.rarity),
    typeIconUrl: getCardTypeIconUrl(card.cardType),
    ...(card.servers ? { servers: card.servers } : {}),
  };
}

/** A support card as a row of the support card list's table view. */
export function supportCardTableRow(card: SupportCardViewModel & WithServers, skillName: string): CardTableRow {
  return {
    id: card.id,
    title: card.title,
    characterNames: card.characters.map((character) => character.name).join(" / ") || card.name,
    bandName: card.bandName,
    rarity: card.rarity,
    cardType: card.cardType,
    performancePower: card.performancePower,
    technicPower: card.technicPower,
    visualPower: card.visualPower,
    totalPower: card.totalPower,
    skillName,
    startAt: card.startAt,
    thumbnailUrl: getSupportCardThumbnailUrl(card.assetId),
    rarityIconUrl: getSupportRarityIconUrl(card.rarity),
    typeIconUrl: getSupportCardTypeIconUrl(card.cardType),
    ...(card.servers ? { servers: card.servers } : {}),
  };
}

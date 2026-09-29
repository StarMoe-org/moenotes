import type { AppLocale } from "@/config/locales";
import type { CardRarity, CardType } from "@/lib/cards/assets";
import { getBuildCards } from "@/lib/masterdata/build-data";

/** What a profile needs to show a favorite card, keyed by its card ID. */
export interface ProfileCardInfo {
  id: number;
  assetId: number;
  characterId: number;
  rarity: CardRarity;
  cardType: CardType;
  title: string;
  characterName: string;
}

/**
 * Build time only. Every card the site lists, reduced to what a player profile shows. It is passed to the page, so
 * profiles resolve their favorite card without a request of their own.
 */
export async function getProfileCards(locale: AppLocale): Promise<ProfileCardInfo[]> {
  const cards = await getBuildCards(locale);
  return cards.map(({ id, assetId, characterId, rarity, cardType, title, characterName }) => ({
    id,
    assetId,
    characterId,
    rarity,
    cardType,
    title,
    characterName,
  }));
}

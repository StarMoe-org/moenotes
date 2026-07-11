import { getAssetUrl } from "@/lib/assets/url";

export type SupportCardRarity = 2 | 3 | 4;
export type SupportCardType = 1 | 2 | 3 | 4 | 5;

const rarityNames: Record<SupportCardRarity, "R" | "SR" | "SSR"> = {
  2: "R",
  3: "SR",
  4: "SSR",
};

const cardTypeColors: Record<SupportCardType, "Green" | "Red" | "Blue" | "Yellow" | "Purple"> = {
  1: "Red",
  2: "Blue",
  3: "Green",
  4: "Yellow",
  5: "Purple",
};

export function getSupportCardThumbnailUrl(assetId: number): string {
  return getAssetUrl({ path: `SupportCard/${assetId}/snap_thumbnail.png` });
}

export function getSupportCardFullUrl(assetId: number): string {
  return getAssetUrl({ path: `SupportCard/${assetId}/snap_full.png` });
}

export function getSupportCardSkillSpriteUrl(assetId: number): string {
  return getAssetUrl({ path: `SupportCard/${assetId}/skill_sprite.png` });
}

export function getSupportCardFrameUrl(rarity: SupportCardRarity): string {
  return `/assets/FrameSupportThum_${rarityNames[rarity]}.png`;
}

export function getSupportRarityIconUrl(rarity: SupportCardRarity): string {
  return `/assets/SP_CardRarityIcon_${rarityNames[rarity]}.png`;
}

export function getSupportCardTypeIconUrl(cardType: SupportCardType): string {
  return `/assets/CardType-${cardTypeColors[cardType]}.png`;
}

import { getAssetUrl } from "@/lib/assets/url";

export type SupportCardRarity = 2 | 3 | 4 | 10;
export type SupportCardType = 1 | 2 | 3 | 4 | 5;

const rarityNames: Partial<Record<SupportCardRarity, "R" | "SR" | "SSR">> = {
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
  const name = rarityNames[rarity];
  return name ? `/assets/FrameSupportThum_${name}.png` : "";
}

export function getSupportRarityIconUrl(rarity: SupportCardRarity): string {
  const name = rarityNames[rarity];
  return name ? `/assets/SP_CardRarityIcon_${name}.png` : "";
}

export function getSupportCardTypeIconUrl(cardType: SupportCardType): string {
  return `/assets/CardType-${cardTypeColors[cardType]}.png`;
}

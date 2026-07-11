import { getAssetUrl } from "@/lib/assets/url";

export type CardRarity = 2 | 3 | 4;
export type CardType = 1 | 2 | 3 | 4 | 5;

const rarityNames: Record<CardRarity, "R" | "SR" | "SSR"> = {
  2: "R",
  3: "SR",
  4: "SSR",
};

const cardTypeColors: Record<CardType, "Green" | "Red" | "Blue" | "Yellow" | "Purple"> = {
  1: "Red",
  2: "Blue",
  3: "Green",
  4: "Yellow",
  5: "Purple",
};

export function getCardThumbnailUrl(assetId: number): string {
  return getAssetUrl({ path: `MemberCard/${assetId}/member_thumbnail_atlas.png` });
}

export function getCardFullUrl(assetId: number): string {
  return getAssetUrl({ path: `MemberCard/${assetId}/member_full_atlas.png` });
}

export function getCardCharacterUrl(assetId: number): string {
  return getAssetUrl({ path: `MemberCard/${assetId}/member_character_atlas.png` });
}

export function getCardBackgroundUrl(assetId: number): string {
  return getAssetUrl({ path: `MemberCard/${assetId}/member_background_atlas.png` });
}

export function getCardSkillSpriteUrl(assetId: number): string {
  return getAssetUrl({ path: `MemberCard/${assetId}/skill_sprite_atlas.png` });
}

export function getCharacterThumbnailUrl(characterId: number): string {
  return getAssetUrl({ path: `Character/Image/${characterId}/character_thumbnail.png` });
}

export function getCharacterSpriteUrl(characterId: number): string {
  return getAssetUrl({ path: `Character/Image/${characterId}/character_sprite.png` });
}

export function getCharacterFaceIconUrl(characterId: number): string {
  return getAssetUrl({ path: `Character/Image/${characterId}/character_face_icon.png` });
}

export function getCharacterBoardIconUrl(characterId: number): string {
  return getAssetUrl({ path: `Character/Image/${characterId}/board_icon.png` });
}

export function getBandLogoUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_logo.png` });
}

export function getBandLogoWhiteUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_logo_white.png` });
}

export function getBandSmallIconUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_small_Icon.png` });
}

export function getBandSmallIconWhiteUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_small_icon_white.png` });
}

export function getBandRoomBackgroundUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_room_background.png` });
}

export function getBandStageBackgroundUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_stage_background.png` });
}

export function getBandStudioBackgroundUrl(bandId: number): string {
  return getAssetUrl({ path: `Band/${bandId}/band_studio_background.png` });
}

export function getCardFrameUrl(rarity: CardRarity): string {
  return `/assets/FrameMemberThum_${rarityNames[rarity]}.png`;
}

export function getRarityIconUrl(rarity: CardRarity): string {
  return `/assets/RarityIcon_${rarityNames[rarity]}.png`;
}

export function getCardTypeIconUrl(cardType: CardType): string {
  return `/assets/CardType-${cardTypeColors[cardType]}.png`;
}

export function getSkillIconUrl(assetName: string): string {
  return getAssetUrl({ path: `Character/Skill/${assetName}.png` });
}


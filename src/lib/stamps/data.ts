import type { AppLocale } from "@/config/locales";
import { getAssetUrl } from "@/lib/assets/url";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawStamp {
  id: number;
  characterIds: number[];
  nameTextId: string;
  priority: number;
  stampAsset: string;
  stampCategory: number;
  startAt: string;
  voiceAsset: string;
}

export interface StampViewModel {
  id: number;
  characterIds: number[];
  characterNames: string[];
  bandIds: number[];
  name: string;
  imageUrl: string;
  searchText: string;
}

export interface RawCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  enDisplayNameTextId: string;
  mainColorCode: string;
}

export interface RawBand {
  id: number;
  nameTextID: string;
  mainColorCode: string;
}

export interface RawText {
  id: string;
  japanese: string;
  english: string;
  simplifiedChinese: string;
  traditionalChinese: string;
}

export function getStampImageUrl(assetPath: string): string {
  const path = assetPath.endsWith(".png") ? assetPath : `${assetPath}.png`;
  return getAssetUrl({ path });
}

export function normalizeStamps(
  stamps: RawStamp[],
  characters: RawCharacter[],
  texts: RawText[],
  locale: AppLocale,
): StampViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return stamps
    .map((stamp) => {
      const charNames: string[] = [];
      const bandIds: number[] = [];

      (stamp.characterIds || []).forEach((charId) => {
        const char = characterMap.get(charId);
        if (char) {
          charNames.push(resolveText(char.nameTextID));
          if (!bandIds.includes(char.bandID)) {
            bandIds.push(char.bandID);
          }
        }
      });

      let name = resolveText(stamp.nameTextId);
      if (!name || name === stamp.nameTextId) {
        const charName = charNames[0] || "";
        if (locale === "zh-CN") {
          name = charName ? `${charName}贴纸 #${stamp.id}` : `贴纸 #${stamp.id}`; // i18n-allow-hardcoded
        } else if (locale === "ja-JP") {
          name = charName ? `${charName}スタンプ #${stamp.id}` : `スタンプ #${stamp.id}`; // i18n-allow-hardcoded
        } else if (locale === "ko-KR") {
          name = charName ? `${charName} 스티커 #${stamp.id}` : `스티커 #${stamp.id}`; // i18n-allow-hardcoded
        } else {
          name = charName ? `${charName} Sticker #${stamp.id}` : `Sticker #${stamp.id}`;
        }
      }

      return {
        id: stamp.id,
        characterIds: stamp.characterIds || [],
        characterNames: charNames,
        bandIds,
        name,
        imageUrl: getStampImageUrl(stamp.stampAsset),
        searchText: [name, ...charNames, stamp.id].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => a.id - b.id);
}


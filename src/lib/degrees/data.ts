import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawDegree {
  id: number;
  nameTextId: string;
  descriptionTextId: string;
  degreeType: number;
  characterIds: number[];
  imagePath: string;
  orderNum: number;
}

export interface DegreeViewModel {
  id: number;
  name: string;
  /** How the title is obtained, as written in MasterData. */
  source: string;
  type: number;
  imageUrl: string;
  characterIds: number[];
  bandIds: number[];
  orderNum: number;
  searchText: string;
}

/** Names carry an inventory tag such as "[Sticker]" (ASCII or full-width brackets); the page already says what they are. */
export function stripInventoryTag(name: string): string {
  return name.replace(/^\s*[[【［][^\]】］]*[\]】］]\s*/, "");
}

// Character stickers without characterIds encode the character in the file name,
// and song jackets encode the band: degree_char_01_22 → character 22, jkt_002_100026 → band 2.
const characterFromImage = /\/degree_char_\d+_(\d+)$/;
const bandFromJacket = /^Image\/Jacket\/jkt_(\d+)_/;

export function normalizeDegrees(degrees: RawDegree[], characters: RawCharacter[], texts: RawText[], locale: AppLocale): DegreeViewModel[] {
  const textMap = new Map(texts.map((row) => [row.id, row]));
  const characterMap = new Map(characters.map((character) => [character.id, character]));

  return degrees
    .map((degree) => {
      const imageCharacter = Number(degree.imagePath.match(characterFromImage)?.[1] ?? 0);
      const characterIds = (degree.characterIds?.length ? degree.characterIds : [imageCharacter]).filter((id) => characterMap.has(id));
      const jacketBand = Number(degree.imagePath.match(bandFromJacket)?.[1] ?? 0);
      const bandIds = [...new Set([...characterIds.map((id) => characterMap.get(id)!.bandID), jacketBand].filter(Boolean))];
      const name = stripInventoryTag(localizeMasterText(textMap.get(degree.nameTextId), locale)) || `#${degree.id}`;
      const source = localizeMasterText(textMap.get(degree.descriptionTextId), locale);
      const characterNames = characterIds.map((id) => localizeMasterText(textMap.get(characterMap.get(id)!.nameTextID), locale));
      return {
        id: degree.id,
        name,
        source,
        type: degree.degreeType,
        imageUrl: getImageAssetUrl(degree.imagePath, locale),
        characterIds,
        bandIds,
        orderNum: degree.orderNum,
        searchText: [name, source, ...characterNames, degree.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.orderNum - b.orderNum || a.id - b.id);
}

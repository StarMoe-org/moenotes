import type { AppLocale } from "@/config/locales";
import { getAssetUrl } from "@/lib/assets/url";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawComic {
  id: number;
  characterIds: number[];
  imageAsset: string;
  isDefaultComics: boolean;
  order: number;
  startAt: string;
}

export interface ComicViewModel {
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

export function getComicImageUrl(imageAsset: string): string {
  const path = `Image/Comic/${imageAsset}.png`;
  return getAssetUrl({ path });
}

export function normalizeComics(
  comics: RawComic[],
  characters: RawCharacter[],
  texts: RawText[],
  locale: AppLocale,
): ComicViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return comics
    .map((comic) => {
      const charNames: string[] = [];
      const bandIds: number[] = [];

      (comic.characterIds || []).forEach((charId) => {
        const char = characterMap.get(charId);
        if (char) {
          charNames.push(resolveText(char.nameTextID));
          if (!bandIds.includes(char.bandID)) {
            bandIds.push(char.bandID);
          }
        }
      });

      let name = "";
      if (locale === "zh-CN") {
        name = `加载界面漫画 #${comic.id}`; // i18n-allow-hardcoded
      } else if (locale === "ja-JP") {
        name = `ローディング漫画 #${comic.id}`; // i18n-allow-hardcoded
      } else if (locale === "ko-KR") {
        name = `로딩 만화 #${comic.id}`; // i18n-allow-hardcoded
      } else {
        name = `Loading Comic #${comic.id}`;
      }

      if (charNames.length > 0) {
        const cast = charNames.join(", ");
        name += ` (${cast})`;
      }

      return {
        id: comic.id,
        characterIds: comic.characterIds || [],
        characterNames: charNames,
        bandIds,
        name,
        imageUrl: getComicImageUrl(comic.imageAsset),
        searchText: [name, ...charNames, comic.id].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => a.id - b.id);
}


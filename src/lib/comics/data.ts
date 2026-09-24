import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { getAssetUrl } from "@/lib/assets/url";
import { localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";

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

export type RawText = MasterTextRow;

export function getComicImageUrl(imageAsset: string, locale: AppLocale): string {
  const path = `Image/Comic/${imageAsset}.png`;
  return getAssetUrl({ path, locale });
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

      let name = t(locale, "comics.loadingName", { id: comic.id });

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
        imageUrl: getComicImageUrl(comic.imageAsset, locale),
        searchText: [name, ...charNames, comic.id].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => a.id - b.id);
}


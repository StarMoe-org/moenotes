import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { stripInventoryTag } from "@/lib/degrees/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawBackground {
  id: number;
  nameTextId: string;
  descriptionTextId: string;
  itemType: number;
  assetPath: string;
  thumbnailAssetPath: string;
}

export interface BackgroundViewModel {
  id: number;
  name: string;
  description: string;
  type: number;
  imageUrl: string;
  thumbnailUrl: string;
  searchText: string;
}

export function normalizeBackgrounds(backgrounds: RawBackground[], texts: RawText[], locale: AppLocale): BackgroundViewModel[] {
  const textMap = new Map(texts.map((row) => [row.id, row]));
  return backgrounds
    .map((background) => {
      const name = stripInventoryTag(localizeMasterText(textMap.get(background.nameTextId), locale)) || `#${background.id}`;
      const description = localizeMasterText(textMap.get(background.descriptionTextId), locale);
      return {
        id: background.id,
        name,
        description,
        type: background.itemType,
        imageUrl: getImageAssetUrl(background.assetPath, locale),
        thumbnailUrl: getImageAssetUrl(background.thumbnailAssetPath || background.assetPath, locale),
        searchText: [name, description, background.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.id - b.id);
}

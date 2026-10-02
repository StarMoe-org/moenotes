import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "./url";

/** Costume icon image from MasterCharacterCostumeGroup.iconPath */
export function getCostumeIconUrl(iconPath: string, locale: AppLocale): string {
  return getImageAssetUrl(iconPath, locale);
}

import type { AppLocale } from "@/config/locales";
import { getAssetUrl } from "@/lib/assets/url";

// Ticket icons are lettered per language.
export function getItemIconUrl(imagePath: string, locale: AppLocale): string {
  if (!imagePath) return "";
  const path = imagePath.includes(".") ? imagePath : `${imagePath}.png`;
  return getAssetUrl({ path, locale });
}

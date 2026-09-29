import type { AppLocale } from "@/config/locales";
import { localizeMasterText, type LocalizableMasterText } from "@/lib/masterdata/localize-text";
import type { DataText } from "./types";

/**
 * music-data.json writes a text as the MasterText row of its id, one string per language code; as a MasterText row
 * it reads in the locale's masterdata order (`localizeMasterText`), empty strings falling through.
 */
export function localizeDataText(text: DataText | null | undefined, locale: AppLocale): string {
  if (!text) return "";
  const row: LocalizableMasterText = {};
  if (text.ja !== undefined) row.japanese = text.ja;
  if (text.en !== undefined) row.english = text.en;
  if (text["zh-Hans"] !== undefined) row.simplifiedChinese = text["zh-Hans"];
  if (text["zh-Hant"] !== undefined) row.traditionalChinese = text["zh-Hant"];
  if (text.ko !== undefined) row.korean = text.ko;
  return localizeMasterText(row, locale);
}

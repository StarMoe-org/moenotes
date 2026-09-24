import type { AppLocale } from "@/config/locales";

/** One MasterText.json row (leading `_` already stripped by `validateMasterTable`). */
export interface MasterTextRow {
  id: string;
  japanese: string;
  english: string;
  simplifiedChinese: string;
  traditionalChinese: string;
  korean: string;
}

export type LocalizableMasterText = Partial<MasterTextRow>;

export type MasterTextField = Exclude<keyof MasterTextRow, "id">;

// Untranslated cells sometimes carry a text key instead of copy (english "Music_Tilte_33", "Tag_Name_Ikka").
const UNTRANSLATED_KEY = /^[A-Z][A-Za-z]*(?:_[A-Za-z0-9]+)+$/;

/** Language columns in the order a UI locale reads them; release assets follow the same chain. */
export function masterTextFieldOrder(locale: AppLocale): MasterTextField[] {
  if (locale === "zh-CN") return ["simplifiedChinese", "traditionalChinese", "japanese", "english", "korean"];
  if (locale === "zh-TW") return ["traditionalChinese", "simplifiedChinese", "japanese", "english", "korean"];
  if (locale === "ja-JP") return ["japanese", "english", "simplifiedChinese", "traditionalChinese", "korean"];
  if (locale === "ko-KR") return ["korean", "english", "japanese", "simplifiedChinese", "traditionalChinese"];
  // en-US and UI-only locales (th/id/vi/es/pt/fr/de/ru, …)
  return ["english", "japanese", "simplifiedChinese", "traditionalChinese", "korean"];
}

function isUsable(value: string | undefined, id: string | undefined): value is string {
  if (!value?.trim()) return false;
  return value !== id && !UNTRANSLATED_KEY.test(value);
}

/**
 * Resolve masterdata text for a UI locale.
 * MasterText ships ja / en / zh-Hans / zh-Hant / ko; blank cells and untranslated keys fall through
 * to the next language in the locale's chain. UI-only locales read English first.
 */
export function localizeMasterText(entry: LocalizableMasterText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  const id = entry.id === undefined ? undefined : String(entry.id);
  for (const field of masterTextFieldOrder(locale)) {
    const value = entry[field];
    if (isUsable(value, id)) return value;
  }
  return "";
}

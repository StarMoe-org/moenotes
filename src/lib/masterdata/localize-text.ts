import type { AppLocale } from "@/config/locales";

export interface LocalizableMasterText {
  japanese?: string;
  english?: string;
  simplifiedChinese?: string;
  traditionalChinese?: string;
}

/**
 * Resolve masterdata text for a UI locale.
 * Master tables currently ship ja/en/zh fields — UI-only locales fall back en→ja→zh.
 */
export function localizeMasterText(entry: LocalizableMasterText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  const ja = entry.japanese || "";
  const en = entry.english || "";
  const zhHans = entry.simplifiedChinese || "";
  const zhHant = entry.traditionalChinese || "";
  const zh = zhHans || zhHant;

  if (locale === "zh-CN") return zhHans || zhHant || ja || en;
  if (locale === "zh-TW") return zhHant || zhHans || ja || en;
  if (locale === "ja-JP") return ja || en || zh;
  // en-US and UI-only locales (ko/th/id/vi/es/pt/fr/de/ru, …)
  return en || ja || zh;
}

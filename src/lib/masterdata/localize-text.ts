import type { AppLocale } from "@/config/locales";

export interface LocalizableMasterText {
  japanese?: string;
  english?: string;
  simplifiedChinese?: string;
  traditionalChinese?: string;
}

/**
 * Resolve masterdata text for a UI locale.
 * Master tables currently only ship ja/en/zh fields — locales without a dedicated
 * field (e.g. ko-KR, th/id/vi) intentionally fall back to English, then Japanese.
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
  // en-US, ko-KR, th-TH, id-ID, vi-VN, and future UI-only locales
  return en || ja || zh;
}

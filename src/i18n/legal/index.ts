import { FALLBACK_LOCALE, type AppLocale } from "@/config/locales";
import { enUS } from "./en-US";
import { jaJP } from "./ja-JP";
import { koKR } from "./ko-KR";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";

/**
 * The license, terms and privacy pages: long documents, kept here rather than in the UI message packs. Each core
 * locale has a file; every other locale reads the English one. `{repo}` in a paragraph becomes the repository link.
 */
export * from "./types";
import type { LegalTexts } from "./types";

const texts: Partial<Record<AppLocale, LegalTexts>> = { "en-US": enUS, "zh-CN": zhCN, "zh-TW": zhTW, "ja-JP": jaJP, "ko-KR": koKR };

export function getLegalTexts(locale: AppLocale): LegalTexts {
  return texts[locale] ?? texts[FALLBACK_LOCALE]!;
}

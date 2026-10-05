import { FALLBACK_LOCALE, type AppLocale } from "@/config/locales";
import type { ChartDataGuide } from "@/i18n/guides/chart-data";
import { enUS } from "./en-US";
import { jaJP } from "./ja-JP";
import { koKR } from "./ko-KR";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";

/**
 * The deck tool's guide: what a recommendation optimizes, what "proven optimal" means and how the search proves it.
 * It shares the chart data guide's shape and view; sections with an `id` are linked from the deck page.
 */
const guides: Partial<Record<AppLocale, ChartDataGuide>> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
  "en-US": enUS,
  "ko-KR": koKR,
};

export function getDeckGuide(locale: AppLocale): ChartDataGuide {
  return guides[locale] ?? guides[FALLBACK_LOCALE] ?? enUS;
}

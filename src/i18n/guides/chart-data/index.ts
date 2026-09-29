import { FALLBACK_LOCALE, type AppLocale } from "@/config/locales";
import { enUS } from "./en-US";
import { jaJP } from "./ja-JP";
import { koKR } from "./ko-KR";
import { zhCN } from "./zh-CN";
import { zhTW } from "./zh-TW";

/**
 * The chart data tool's guide: the definitions, derivations and conditions behind every figure. It is a long
 * document, so it lives here rather than in the UI message packs; like them, each core locale has a file and every
 * other locale reads the English one.
 *
 * Sections are `{title, body: [paragraph], math: [formula], after: [paragraph], defs: [[term, text]]}`, rendered in
 * that order. Numbers, formulas, table and field names are the same in every language.
 */
export interface ChartDataGuideSection {
  title: string;
  body?: readonly string[];
  math?: readonly string[];
  after?: readonly string[];
  defs?: ReadonlyArray<readonly [string, string]>;
}

export interface ChartDataGuide {
  title: string;
  lead: string;
  sections: readonly ChartDataGuideSection[];
}

const guides: Partial<Record<AppLocale, ChartDataGuide>> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
  "en-US": enUS,
  "ko-KR": koKR,
};

export function getChartDataGuide(locale: AppLocale): ChartDataGuide {
  return guides[locale] ?? guides[FALLBACK_LOCALE] ?? enUS;
}

/** The locales with a guide of their own (the core locales). */
export const CHART_DATA_GUIDE_LOCALES = Object.keys(guides) as AppLocale[];

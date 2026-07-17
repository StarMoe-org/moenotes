export const DEFAULT_LOCALE = "zh-CN" as const;
/** UI/runtime fallback when a locale is missing a key. Prefer English over exposing raw keys. */
export const FALLBACK_LOCALE = "en-US" as const;
export const SUPPORTED_LOCALES = ["zh-CN", "ja-JP", "en-US", "ko-KR"] as const;

export type AppLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_PATH_PREFIX: Record<AppLocale, string> = {
  "zh-CN": "",
  "ja-JP": "ja",
  "en-US": "en",
  "ko-KR": "ko",
};

export const PATH_PREFIX_LOCALE: Record<string, AppLocale> = {
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR",
};

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  "ja-JP": "日本語",
  "en-US": "English",
  "ko-KR": "한국어",
};

export const HTML_LANG: Record<AppLocale, string> = {
  "zh-CN": "zh-CN",
  "ja-JP": "ja-JP",
  "en-US": "en-US",
  "ko-KR": "ko-KR",
};

export const OG_LOCALE: Record<AppLocale, string> = {
  "zh-CN": "zh_CN",
  "ja-JP": "ja_JP",
  "en-US": "en_US",
  "ko-KR": "ko_KR",
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

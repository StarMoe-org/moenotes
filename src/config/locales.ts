export const DEFAULT_LOCALE = "zh-CN" as const;
/** UI/runtime fallback when a locale is missing a key. Prefer English over exposing raw keys. */
export const FALLBACK_LOCALE = "en-US" as const;
export const SUPPORTED_LOCALES = [
  "zh-CN",
  "zh-TW",
  "ja-JP",
  "en-US",
  "ko-KR",
  "th-TH",
  "id-ID",
  "vi-VN",
] as const;

export type AppLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_PATH_PREFIX: Record<AppLocale, string> = {
  "zh-CN": "",
  "zh-TW": "zh-tw",
  "ja-JP": "ja",
  "en-US": "en",
  "ko-KR": "ko",
  "th-TH": "th",
  "id-ID": "id",
  "vi-VN": "vi",
};

export const PATH_PREFIX_LOCALE: Record<string, AppLocale> = {
  "zh-tw": "zh-TW",
  ja: "ja-JP",
  en: "en-US",
  ko: "ko-KR",
  th: "th-TH",
  id: "id-ID",
  vi: "vi-VN",
};

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
  "ja-JP": "日本語",
  "en-US": "English",
  "ko-KR": "한국어",
  "th-TH": "ไทย",
  "id-ID": "Bahasa Indonesia",
  "vi-VN": "Tiếng Việt",
};

export const HTML_LANG: Record<AppLocale, string> = {
  "zh-CN": "zh-CN",
  "zh-TW": "zh-TW",
  "ja-JP": "ja-JP",
  "en-US": "en-US",
  "ko-KR": "ko-KR",
  "th-TH": "th-TH",
  "id-ID": "id-ID",
  "vi-VN": "vi-VN",
};

export const OG_LOCALE: Record<AppLocale, string> = {
  "zh-CN": "zh_CN",
  "zh-TW": "zh_TW",
  "ja-JP": "ja_JP",
  "en-US": "en_US",
  "ko-KR": "ko_KR",
  "th-TH": "th_TH",
  "id-ID": "id_ID",
  "vi-VN": "vi_VN",
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

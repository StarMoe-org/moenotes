export const DEFAULT_LOCALE = "zh-CN" as const;
export const SUPPORTED_LOCALES = ["zh-CN", "ja-JP", "en-US"] as const;

export type AppLocale = typeof SUPPORTED_LOCALES[number];

export const LOCALE_PATH_PREFIX: Record<AppLocale, string> = {
  "zh-CN": "",
  "ja-JP": "ja",
  "en-US": "en",
};

export const PATH_PREFIX_LOCALE: Record<string, AppLocale> = {
  ja: "ja-JP",
  en: "en-US",
};

export const LOCALE_LABELS: Record<AppLocale, string> = {
  "zh-CN": "简体中文",
  "ja-JP": "日本語",
  "en-US": "English",
};

export const HTML_LANG: Record<AppLocale, string> = {
  "zh-CN": "zh-CN",
  "ja-JP": "ja-JP",
  "en-US": "en-US",
};

export const OG_LOCALE: Record<AppLocale, string> = {
  "zh-CN": "zh_CN",
  "ja-JP": "ja_JP",
  "en-US": "en_US",
};

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

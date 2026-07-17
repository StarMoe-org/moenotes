import { FALLBACK_LOCALE, type AppLocale } from "@/config/locales";
import { enUS } from "@/i18n/messages/en-US";
import { jaJP } from "@/i18n/messages/ja-JP";
import { koKR } from "@/i18n/messages/ko-KR";
import { zhCN } from "@/i18n/messages/zh-CN";
import { getMessageByPath, interpolate, type MessageTree } from "@/i18n/translate";

export const messagesByLocale: Record<AppLocale, MessageTree> = {
  "zh-CN": zhCN,
  "ja-JP": jaJP,
  "en-US": enUS,
  "ko-KR": koKR,
};

export function getMessages(locale: AppLocale): MessageTree {
  return messagesByLocale[locale] ?? messagesByLocale[FALLBACK_LOCALE];
}

/**
 * Resolve UI copy for a locale.
 * Chain: current locale → English fallback → empty string.
 * Never surface raw i18n keys in the UI.
 */
export function t(locale: AppLocale, key: string, values?: Record<string, string | number>): string {
  const message =
    getMessageByPath(getMessages(locale), key) ??
    (locale === FALLBACK_LOCALE ? undefined : getMessageByPath(getMessages(FALLBACK_LOCALE), key)) ??
    "";
  return interpolate(message, values);
}

export * from "@/config/locales";
export * from "@/i18n/routing";

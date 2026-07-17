import { FALLBACK_LOCALE, type AppLocale } from "@/config/locales";
import { deDE } from "@/i18n/messages/de-DE";
import { enUS } from "@/i18n/messages/en-US";
import { esES } from "@/i18n/messages/es-ES";
import { frFR } from "@/i18n/messages/fr-FR";
import { idID } from "@/i18n/messages/id-ID";
import { jaJP } from "@/i18n/messages/ja-JP";
import { koKR } from "@/i18n/messages/ko-KR";
import { ptBR } from "@/i18n/messages/pt-BR";
import { ruRU } from "@/i18n/messages/ru-RU";
import { thTH } from "@/i18n/messages/th-TH";
import { viVN } from "@/i18n/messages/vi-VN";
import { zhCN } from "@/i18n/messages/zh-CN";
import { zhTW } from "@/i18n/messages/zh-TW";
import { getMessageByPath, interpolate, type MessageTree } from "@/i18n/translate";

export const messagesByLocale: Record<AppLocale, MessageTree> = {
  "zh-CN": zhCN,
  "zh-TW": zhTW,
  "ja-JP": jaJP,
  "en-US": enUS,
  "ko-KR": koKR,
  "th-TH": thTH,
  "id-ID": idID,
  "vi-VN": viVN,
  "es-ES": esES,
  "pt-BR": ptBR,
  "fr-FR": frFR,
  "de-DE": deDE,
  "ru-RU": ruRU,
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

import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { enUS } from "@/i18n/messages/en-US";
import { jaJP } from "@/i18n/messages/ja-JP";
import { zhCN } from "@/i18n/messages/zh-CN";
import { getMessageByPath, interpolate, type MessageTree } from "@/i18n/translate";

export const messagesByLocale: Record<AppLocale, MessageTree> = {
  "zh-CN": zhCN,
  "ja-JP": jaJP,
  "en-US": enUS,
};

export function getMessages(locale: AppLocale): MessageTree {
  return messagesByLocale[locale] ?? messagesByLocale[DEFAULT_LOCALE];
}

export function t(locale: AppLocale, key: string, values?: Record<string, string | number>): string {
  const message = getMessageByPath(getMessages(locale), key) ?? getMessageByPath(getMessages(DEFAULT_LOCALE), key) ?? key;
  return interpolate(message, values);
}

export * from "@/config/locales";
export * from "@/i18n/routing";

import { DEFAULT_LOCALE, OG_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { localeAlternates, localizePath } from "@/i18n/routing";
import { findRouteMatch } from "@/lib/route/registry";

export interface PageMetadata {
  title: string;
  fullTitle: string;
  description: string;
  canonical: string;
  alternates: Array<{ locale: AppLocale; href: string }>;
  ogLocale: string;
  keywords: string[];
  indexable: boolean;
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.baseUrl).toString();
}

export function buildPageMetadata(pathname: string, locale: AppLocale = DEFAULT_LOCALE): PageMetadata {
  const match = findRouteMatch(pathname);
  const route = match?.item;
  const title = route ? t(locale, route.seo.titleKey) : siteConfig.name;
  const description = route ? t(locale, route.seo.descriptionKey) : siteConfig.description;
  const localizedPath = localizePath(pathname, locale);

  return {
    title,
    fullTitle: siteConfig.titleTemplate.replace("%s", title),
    description,
    canonical: absoluteUrl(localizedPath),
    alternates: localeAlternates(pathname).map(({ locale: altLocale, href }) => ({ locale: altLocale, href: absoluteUrl(href) })),
    ogLocale: OG_LOCALE[locale],
    keywords: route?.seo.keywords ?? [],
    indexable: route?.seo.indexable !== false,
  };
}

export function buildHreflang(locale: AppLocale): string {
  if (locale === "zh-CN") return "zh-CN";
  if (locale === "ja-JP") return "ja-JP";
  return "en-US";
}

export { SUPPORTED_LOCALES };

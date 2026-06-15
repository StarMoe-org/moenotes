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
  image: string;
}

export function absoluteUrl(pathname: string): string {
  return new URL(pathname, siteConfig.baseUrl).toString();
}

export function withDirectorySlash(pathname: string): `/${string}` {
  const [path = "/", suffix = ""] = pathname.split(/([?#].*)/, 2);
  const normalized = path.startsWith("/") ? path : `/${path}`;
  const lastSegment = normalized.split("/").filter(Boolean).at(-1) ?? "";
  if (normalized.endsWith("/") || lastSegment.includes(".")) return `${normalized}${suffix}` as `/${string}`;
  return `${normalized}/${suffix}` as `/${string}`;
}

export function absolutePageUrl(pathname: string): string {
  return absoluteUrl(withDirectorySlash(pathname));
}

export function buildPageMetadata(
  pathname: string,
  locale: AppLocale = DEFAULT_LOCALE,
  overrides: Partial<PageMetadata> = {},
): PageMetadata {
  const match = findRouteMatch(pathname);
  const route = match?.item;
  const title = overrides.title ?? (route ? t(locale, route.seo.titleKey) : siteConfig.name);
  const description = overrides.description ?? (route ? t(locale, route.seo.descriptionKey) : siteConfig.description);
  const localizedPath = localizePath(pathname, locale);
  const canonical = overrides.canonical ?? absolutePageUrl(localizedPath);

  const base: PageMetadata = {
    title,
    fullTitle: overrides.fullTitle ?? siteConfig.titleTemplate.replace("%s", title),
    description,
    canonical,
    alternates: overrides.alternates ?? localeAlternates(pathname).map(({ locale: altLocale, href }) => ({ locale: altLocale, href: absolutePageUrl(href) })),
    ogLocale: overrides.ogLocale ?? OG_LOCALE[locale],
    keywords: overrides.keywords ?? route?.seo.keywords ?? [],
    indexable: overrides.indexable ?? route?.seo.indexable !== false,
    image: overrides.image ?? absoluteUrl(siteConfig.ogImage),
  };

  return { ...base, ...overrides, title, description, canonical };
}

export function buildHreflang(locale: AppLocale): string {
  if (locale === "zh-CN") return "zh-CN";
  if (locale === "ja-JP") return "ja-JP";
  return "en-US";
}

export { SUPPORTED_LOCALES };

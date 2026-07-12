import { siteConfig } from "@/config/site";
import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { buildBreadcrumbs, buildAbsoluteUrl } from "@/lib/route/breadcrumbs";
import { absolutePageUrl } from "@/lib/seo/metadata";
import type { BreadcrumbDetail } from "@/types/route";

export function websiteJsonLd(locale: AppLocale) {
  const url = absolutePageUrl(localizePath("/", locale));

  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${url}#website`,
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    url,
    inLanguage: locale,
    publisher: {
      "@type": "Organization",
      "@id": `${siteConfig.baseUrl}#organization`,
      name: siteConfig.author,
      url: siteConfig.baseUrl,
    },
  };
}

export function breadcrumbJsonLd(pathname: string, locale: AppLocale, detail?: BreadcrumbDetail) {
  const crumbs = buildBreadcrumbs(pathname, locale, detail);
  if (crumbs.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.label,
      item: buildAbsoluteUrl(crumb.href),
    })),
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

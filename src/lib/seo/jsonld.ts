import { siteConfig } from "@/config/site";
import type { AppLocale } from "@/config/locales";
import { buildBreadcrumbs, buildAbsoluteUrl } from "@/lib/route/breadcrumbs";

export function websiteJsonLd(locale: AppLocale) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: siteConfig.name,
    alternateName: siteConfig.shortName,
    url: siteConfig.baseUrl,
    inLanguage: locale,
    publisher: {
      "@type": "Organization",
      name: siteConfig.author,
    },
  };
}

export function breadcrumbJsonLd(pathname: string, locale: AppLocale, detail?: { id?: string; label: string; href?: string }) {
  const crumbs = buildBreadcrumbs(pathname, locale, detail);
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

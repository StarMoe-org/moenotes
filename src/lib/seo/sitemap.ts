import type { AppLocale } from "@/config/locales";
import { getAllStaticRoutes } from "@/lib/route/registry";
import { localeAlternates, localizePath } from "@/i18n/routing";
import { absolutePageUrl } from "@/lib/seo/metadata";

export function getStaticSitemapEntries(locale: AppLocale) {
  const lastmod = new Date().toISOString().slice(0, 10);
  return getAllStaticRoutes()
    .filter((route) => route.seo.indexable !== false)
    .map((route) => ({
      loc: absolutePageUrl(localizePath(route.path, locale)),
      alternates: localeAlternates(route.path).map((alternate) => ({
        locale: alternate.locale,
        href: absolutePageUrl(alternate.href),
      })),
      lastmod,
      priority: route.seo.sitemap?.priority ?? 0.5,
      changefreq: route.seo.sitemap?.changefreq ?? "weekly",
    }));
}

import type { AppLocale } from "@/config/locales";
import { getAllRoutes } from "@/lib/route/registry";
import { localizePath } from "@/i18n/routing";
import { absoluteUrl } from "@/lib/seo/metadata";

export function getStaticSitemapEntries(locale: AppLocale) {
  return getAllRoutes()
    .filter((route) => route.seo.indexable !== false)
    .map((route) => ({
      loc: absoluteUrl(localizePath(route.path, locale)),
      priority: route.seo.sitemap?.priority ?? 0.5,
      changefreq: route.seo.sitemap?.changefreq ?? "weekly",
    }));
}

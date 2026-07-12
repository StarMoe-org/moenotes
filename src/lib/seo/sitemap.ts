import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { localeAlternates, localizePath } from "@/i18n/routing";
import { buildDynamicPath, getAllRoutes, isDynamicRoute, resolveRouteStaticParams } from "@/lib/route/registry";
import { absolutePageUrl } from "@/lib/seo/metadata";
import type { AppRoute } from "@/types/route";

export interface SitemapEntry {
  loc: string;
  alternates: Array<{ locale: AppLocale; href: string }>;
  xDefault: string;
  lastmod?: string;
  priority: number;
  changefreq: NonNullable<NonNullable<AppRoute["seo"]["sitemap"]>["changefreq"]>;
}

interface SitemapPath {
  route: AppRoute;
  pathname: `/${string}`;
}

export async function getSitemapEntries(): Promise<SitemapEntry[]> {
  const paths = await getSitemapPaths();

  return paths.flatMap(({ route, pathname }) =>
    SUPPORTED_LOCALES.map((locale) => ({
      loc: absolutePageUrl(localizePath(pathname, locale)),
      alternates: localeAlternates(pathname).map((alternate) => ({
        locale: alternate.locale,
        href: absolutePageUrl(alternate.href),
      })),
      xDefault: absolutePageUrl(localizePath(pathname, DEFAULT_LOCALE)),
      ...(route.seo.sitemap?.lastmod ? { lastmod: route.seo.sitemap.lastmod } : {}),
      priority: route.seo.sitemap?.priority ?? 0.5,
      changefreq: route.seo.sitemap?.changefreq ?? "weekly",
    })),
  );
}

async function getSitemapPaths(): Promise<SitemapPath[]> {
  const paths: SitemapPath[] = [];

  for (const route of getAllRoutes().filter((item) => item.seo.indexable !== false)) {
    if (!isDynamicRoute(route)) {
      paths.push({ route, pathname: route.path });
      continue;
    }

    const configs = await resolveRouteStaticParams(route);
    for (const config of configs) {
      if (config.meta?.indexable === false) continue;
      paths.push({
        route,
        pathname: buildDynamicPath(route.pattern ?? route.path, config.params),
      });
    }
  }

  return paths;
}

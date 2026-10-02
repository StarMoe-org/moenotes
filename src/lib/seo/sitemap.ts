import { DEFAULT_LOCALE, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { activeBuildLocales } from "@/config/build-locales";
import { localizePath } from "@/i18n/routing";
import { buildDynamicPath, getAllRoutes, isDynamicRoute, resolveRouteStaticParams } from "@/lib/route/registry";
import { absolutePageUrl } from "@/lib/seo/metadata";
import type { AppRoute } from "@/types/route";

export interface SitemapEntry {
  /** The locale whose URL `loc` points at; a shard is the subset of entries whose `locale` is its own. */
  locale: AppLocale;
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

/**
 * Locale-aware sitemap entries. `locales` defaults to this build's active set (`MOENOTES_BUILD_LOCALES`),
 * so the core/fallback batch only emits entries for the locales it actually rendered.
 */
export async function getSitemapEntries(locales: readonly AppLocale[] = activeBuildLocales()): Promise<SitemapEntry[]> {
  const paths = await getSitemapPaths();

  return paths.flatMap(({ route, pathname }) =>
    locales.map((locale) => ({
      locale,
      loc: absolutePageUrl(localizePath(pathname, locale)),
      alternates: locales.map((alternateLocale) => ({
        locale: alternateLocale,
        href: absolutePageUrl(localizePath(pathname, alternateLocale)),
      })),
      xDefault: absolutePageUrl(localizePath(pathname, DEFAULT_LOCALE)),
      ...(route.seo.sitemap?.lastmod ? { lastmod: route.seo.sitemap.lastmod } : {}),
      priority: route.seo.sitemap?.priority ?? 0.5,
      changefreq: route.seo.sitemap?.changefreq ?? "weekly",
    })),
  );
}

/** Locales this build renders an `/sitemaps/<prefix>.xml` shard for, in `SUPPORTED_LOCALES` order. */
export function sitemapShardLocales(locales: readonly AppLocale[] = activeBuildLocales()): readonly AppLocale[] {
  return SUPPORTED_LOCALES.filter((locale) => locales.includes(locale));
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

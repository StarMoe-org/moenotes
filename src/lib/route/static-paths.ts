import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { getAllRoutes } from "@/lib/route/registry";

export interface StaticLocalizedPath {
  params: {
    locale: string;
  };
}

function routePathToParam(path: string): string {
  return path.replace(/^\//, "");
}

export function getStaticLocalizedPaths(): StaticLocalizedPath[] {
  const routes = getAllRoutes().filter((route) => route.path !== "/");
  const paths: StaticLocalizedPath[] = [];

  for (const route of routes) {
    const routeParam = routePathToParam(route.path);
    paths.push({ params: { locale: routeParam } });
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    const prefix = LOCALE_PATH_PREFIX[locale];
    paths.push({ params: { locale: prefix } });
    for (const route of routes) {
      const routeParam = routePathToParam(route.path);
      paths.push({ params: { locale: `${prefix}/${routeParam}` } });
    }
  }

  return paths;
}

export function getLocalePrefix(locale: AppLocale): string {
  return LOCALE_PATH_PREFIX[locale];
}

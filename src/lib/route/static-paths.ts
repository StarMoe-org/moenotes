import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { buildDynamicPath, findRouteMatch, getAllRoutes, getAllStaticRoutes, isDynamicRoute } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, RouteMatch, RouteParams, RouteStaticParamConfig } from "@/types/route";
import type { PageMetadata } from "@/lib/seo/metadata";

export interface StaticLocalizedPathProps {
  locale: AppLocale;
  pathname: `/${string}`;
  match: RouteMatch | null;
  routeParams: RouteParams;
  breadcrumbDetail?: BreadcrumbDetail;
  meta?: Partial<PageMetadata>;
}

export interface StaticLocalizedPath {
  params: {
    locale: string;
  };
  props: StaticLocalizedPathProps;
}

function routePathToParam(path: string): string {
  return path.replace(/^\//, "");
}

export async function getStaticLocalizedPaths(): Promise<StaticLocalizedPath[]> {
  const paths: StaticLocalizedPath[] = [];

  for (const route of getAllStaticRoutes().filter((item) => item.path !== "/")) {
    for (const locale of SUPPORTED_LOCALES) {
      const pathname = route.path;
      paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname)));
    }
  }

  for (const route of getAllRoutes().filter(isDynamicRoute)) {
    const configs = await resolveStaticParams(route.staticParams);
    for (const config of configs) {
      const pathname = buildDynamicPath(route.pattern ?? route.path, config.params);
      for (const locale of SUPPORTED_LOCALES) {
        paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname), config.params, config.breadcrumbDetail, config.meta));
      }
    }
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === DEFAULT_LOCALE) continue;
    paths.push(createLocalizedPath(locale, "/", ""));
  }

  return paths;
}

export function getLocalePrefix(locale: AppLocale): string {
  return LOCALE_PATH_PREFIX[locale];
}

function createLocalizedPath(
  locale: AppLocale,
  pathname: `/${string}`,
  routeParam: string,
  routeParams: RouteParams = {},
  breadcrumbDetail?: BreadcrumbDetail,
  meta?: Partial<PageMetadata>,
): StaticLocalizedPath {
  const prefix = LOCALE_PATH_PREFIX[locale];
  const localizedParam = locale === DEFAULT_LOCALE
    ? routeParam
    : [prefix, routeParam].filter(Boolean).join("/");

  return {
    params: { locale: localizedParam },
    props: {
      locale,
      pathname,
      match: findRouteMatch(pathname),
      routeParams,
      ...(breadcrumbDetail ? { breadcrumbDetail } : {}),
      ...(meta ? { meta } : {}),
    },
  };
}

async function resolveStaticParams(staticParams: AppRoute["staticParams"]): Promise<readonly RouteStaticParamConfig[]> {
  if (!staticParams) return [];
  if (typeof staticParams === "function") return await staticParams();
  return staticParams;
}

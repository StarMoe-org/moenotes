// `SUPPORTED_LOCALES` stays referenced here so the i18n-routing lint keeps seeing the locale config as the
// single source of truth (the rollout-time subset comes from `activeBuildLocales`, which narrows that set).
import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { activeBuildLocales } from "@/config/build-locales";
import { buildDynamicPath, findRouteMatch, findRouteById, getAllRoutes, getAllStaticRoutes, isDynamicRoute, resolveRouteStaticParams } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, RouteMatch, RouteParams } from "@/types/route";
import type { PageMetadata } from "@/lib/seo/metadata";
import {
  getBuildCards,
  getBuildCharacters,
  getBuildEvents,
  getBuildExchangeSummaries,
  getBuildGachas,
  getBuildMusic,
  getBuildRewardEntries,
  getBuildStories,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";

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

const detailLabels = new Map<string, Promise<Map<string, BreadcrumbDetail>>>();

/** Breadcrumb labels of one detail route in one locale, by route parameter, from the merged catalog. */
function detailLabelsFor(component: string, locale: AppLocale): Promise<Map<string, BreadcrumbDetail>> | null {
  const load = detailLabelLoaders[component];
  if (!load) return null;
  const key = `${component}:${locale}`;
  let labels = detailLabels.get(key);
  if (!labels) {
    labels = load(locale).catch((error: unknown) => {
      console.error(`Failed to preload dynamic ${component} breadcrumbs:`, error);
      return new Map();
    });
    detailLabels.set(key, labels);
  }
  return labels;
}

const label = (value: string): BreadcrumbDetail | null => (value ? { label: value } : null);
const byId = <T>(entries: readonly T[], id: (entry: T) => string | number, detail: (entry: T) => BreadcrumbDetail | null) =>
  new Map(entries.flatMap((entry) => {
    const value = detail(entry);
    return value ? [[String(id(entry)), value] as const] : [];
  }));

const storyCategoryRoutes: Record<string, string> = { main: "main-story", event: "event-story", friendship: "friendship-story" };

const detailLabelLoaders: Record<string, (locale: AppLocale) => Promise<Map<string, BreadcrumbDetail>>> = {
  "card-detail": async (locale) => byId(await getBuildCards(locale), (card) => card.id, (card) => label(`${card.characterName} - ${card.title}`)),
  "support-card-detail": async (locale) => byId(await getBuildSupportCards(locale), (card) => card.id, (card) => label(`${card.name} - ${card.title}`)),
  "character-detail": async (locale) => byId((await getBuildCharacters(locale)).characters, (character) => character.id, (character) => label(character.name)),
  "song-detail": async (locale) => byId(await getBuildMusic(locale), (song) => song.id, (song) => label(song.title)),
  "gacha-detail": async (locale) => byId(await getBuildGachas(locale), (gacha) => gacha.id, (gacha) => label(gacha.name || `#${gacha.id}`)),
  "reward-detail": async (locale) => byId(await getBuildRewardEntries(locale), (entry) => entry.slug, (entry) => label(entry.title || `#${entry.id}`)),
  "exchange-detail": async (locale) => byId(await getBuildExchangeSummaries(locale), (exchange) => exchange.id, (exchange) => label(exchange.name)),
  "event-detail": async (locale) => {
    // `/events/:id` is not under the list's path, so name the list as the ancestor the navigation marks.
    const ancestors = [findRouteById("events"), findRouteById("event-list")].filter(Boolean) as AppRoute[];
    return byId(await getBuildEvents(locale), (event) => event.id, (event) => ({ label: event.name, ancestors }));
  },
  "story-detail": async (locale) => {
    const storyRoute = findRouteById("story");
    // An ADV in several lists takes its first one's title and category.
    const stories = (await getBuildStories(locale)).filter((story, index, all) => all.findIndex((other) => other.advId === story.advId) === index);
    return byId(stories, (story) => story.advId, (story) => ({
      label: story.title || `ADV ${story.advId}`,
      ancestors: [storyRoute, findRouteById(storyCategoryRoutes[story.category] ?? "other-story")].filter(Boolean) as AppRoute[],
    }));
  },
};

async function detailBreadcrumb(component: string | undefined, id: string, locale: AppLocale): Promise<BreadcrumbDetail | undefined> {
  const labels = component ? detailLabelsFor(component, locale) : null;
  return (await labels)?.get(id);
}

export async function getStaticLocalizedPaths(locales: readonly AppLocale[] = activeBuildLocales()): Promise<StaticLocalizedPath[]> {
  const paths: StaticLocalizedPath[] = [];

  for (const route of getAllStaticRoutes().filter((item) => item.path !== "/")) {
    for (const locale of locales) {
      const pathname = route.path;
      paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname)));
    }
  }

  for (const route of getAllRoutes().filter(isDynamicRoute)) {
    const configs = await resolveRouteStaticParams(route);
    for (const config of configs) {
      const pathname = buildDynamicPath(route.pattern ?? route.path, config.params);
      for (const locale of locales) {
        const detail = await detailBreadcrumb(route.component, config.params.id ?? "", locale);
        const breadcrumbDetail = detail ?? config.breadcrumbDetail;
        paths.push(createLocalizedPath(locale, pathname, routePathToParam(pathname), config.params, breadcrumbDetail, config.meta));
      }
    }
  }

  for (const locale of locales) {
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

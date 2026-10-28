// `SUPPORTED_LOCALES` stays referenced here so the i18n-routing lint keeps seeing the locale config as the
// single source of truth (the rollout-time subset comes from `activeBuildLocales`, which narrows that set).
import { DEFAULT_LOCALE, LOCALE_PATH_PREFIX, SUPPORTED_LOCALES, type AppLocale } from "@/config/locales";
import { activeBuildLocales } from "@/config/build-locales";
import { buildDynamicPath, findRouteMatch, findRouteById, getAllRoutes, getAllStaticRoutes, isDynamicRoute, resolveRouteStaticParams } from "@/lib/route/registry";
import type { AppRoute, BreadcrumbDetail, RouteMatch, RouteParams } from "@/types/route";
import type { PageMetadata } from "@/lib/seo/metadata";
import { memo } from "@/lib/masterdata/build-core";
import {
  getBuildCards,
  getBuildCharacters,
  getBuildEvents,
  getBuildExchangeSummaries,
  getBuildGachas,
  getBuildItems,
  getBuildMusic,
  getBuildRewardEntries,
  getBuildStories,
  getBuildSupportCards,
} from "@/lib/masterdata/build-data";
import { getBuildHelpTopics } from "@/lib/masterdata/build-help";
import { getBuildShops } from "@/lib/masterdata/build-shop";

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

/** Breadcrumb labels of one detail route in one locale, by route parameter, memoized per MasterData epoch. */
function detailLabelsFor(component: string, locale: AppLocale): Promise<Map<string, BreadcrumbDetail>> | null {
  const load = detailLabelLoaders[component];
  if (!load) return null;
  return memo(`detail-labels:${component}:${locale}`, () =>
    load(locale).catch((error: unknown) => {
      console.error(`Failed to preload dynamic ${component} breadcrumbs:`, error);
      return new Map();
    }),
  );
}

const label = (value: string): BreadcrumbDetail | null => (value ? { label: value } : null);
const byId = <T>(entries: readonly T[], id: (entry: T) => string | number, detail: (entry: T) => BreadcrumbDetail | null) =>
  new Map(entries.flatMap((entry) => {
    const value = detail(entry);
    return value ? [[String(id(entry)), value] as const] : [];
  }));

const storyCategoryRoutes: Record<string, string> = { main: "main-story", event: "event-story", friendship: "friendship-story", birthday: "birthday-story" };

function plainRoute(route: AppRoute | undefined): AppRoute | null {
  if (!route) return null;
  const { children: _children, staticParams: _staticParams, ...plain } = route;
  return plain;
}

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
    const ancestors = [plainRoute(findRouteById("events")), plainRoute(findRouteById("event-list"))].filter((r): r is AppRoute => r !== null);
    return byId(await getBuildEvents(locale), (event) => event.id, (event) => ({ label: event.name, ancestors }));
  },
  "item-detail": async (locale) => byId(await getBuildItems(locale), (item) => item.id, (item) => label(item.name)),
  "shop-detail": async (locale) => byId(await getBuildShops(locale), (shop) => shop.id, (shop) => label(shop.name)),
  "help-detail": async (locale) => byId(await getBuildHelpTopics(locale), (topic) => topic.id, (topic) => label(topic.title)),
  "story-detail": async (locale) => {
    const storyRoute = plainRoute(findRouteById("story"));
    // An ADV in several lists takes its first one's title and category.
    const stories = (await getBuildStories(locale)).filter((story, index, all) => all.findIndex((other) => other.advId === story.advId) === index);
    return byId(stories, (story) => story.advId, (story) => ({
      label: story.title || `ADV ${story.advId}`,
      ancestors: [storyRoute, plainRoute(findRouteById(storyCategoryRoutes[story.category] ?? "other-story"))].filter((r): r is AppRoute => r !== null),
    }));
  },
};

export async function getDetailBreadcrumb(component: string | undefined, id: string, locale: AppLocale): Promise<BreadcrumbDetail | undefined> {
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
        const detail = await getDetailBreadcrumb(route.component, config.params.id ?? "", locale);
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

export { SUPPORTED_LOCALES };

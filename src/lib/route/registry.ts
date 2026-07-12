import { routeRegistry } from "@/config/routes";
import type { AppRoute, RouteMatch, RouteParams, RouteStaticParamConfig } from "@/types/route";
import { normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";

const routes = routeRegistry as readonly AppRoute[];
const staticParamsCache = new WeakMap<AppRoute, Promise<readonly RouteStaticParamConfig[]>>();

interface RouteEntry {
  route: AppRoute;
  ancestors: AppRoute[];
}

function hasNav(route: AppRoute): route is AppRoute & { nav: NonNullable<AppRoute["nav"]> } {
  return Boolean(route.nav);
}

function navOrder(route: AppRoute): number {
  return route.nav ? route.nav.order : 0;
}

export function isDynamicRoute(route: AppRoute): boolean {
  return route.kind === "dynamic";
}

export function isStaticRoute(route: AppRoute): boolean {
  return !isDynamicRoute(route);
}

export function getRouteEntries(inputRoutes: readonly AppRoute[] = routes, ancestors: AppRoute[] = []): RouteEntry[] {
  return inputRoutes.flatMap((route) => [
    { route, ancestors },
    ...(route.children ? getRouteEntries(route.children, [...ancestors, route]) : []),
  ]);
}

export function getAllRoutes(inputRoutes: readonly AppRoute[] = routes): AppRoute[] {
  return getRouteEntries(inputRoutes).map((entry) => entry.route);
}

export function getAllStaticRoutes(): AppRoute[] {
  return getAllRoutes().filter(isStaticRoute);
}

export function getNavigationGroups(): AppRoute[] {
  return routes
    .filter(isStaticRoute)
    .filter(hasNav)
    .sort((a, b) => navOrder(a) - navOrder(b));
}

export function getNavChildren(group: AppRoute): AppRoute[] {
  return (group.children ?? [])
    .filter(isStaticRoute)
    .filter(hasNav)
    .sort((a, b) => navOrder(a) - navOrder(b));
}

export function findRouteById(id: string): AppRoute | undefined {
  return getAllRoutes().find((route) => route.id === id);
}

export function getRoutePathById(id: string): `/${string}` {
  const route = findRouteById(id);
  if (!route) throw new Error(`Unknown route id: ${id}`);
  return route.path;
}

export function findRouteByPath(pathname: string): AppRoute | undefined {
  const path = stripLocaleFromPathname(pathname);
  return getAllStaticRoutes().find((route) => normalizePathname(route.path) === path);
}

export function findRouteMatch(pathname: string): RouteMatch | null {
  const path = stripLocaleFromPathname(pathname);
  const entries = getRouteEntries();

  const exact = entries.find((entry) => isStaticRoute(entry.route) && normalizePathname(entry.route.path) === path);
  if (exact) return toRouteMatch(exact, path, {});

  const dynamicMatches = entries
    .filter((entry) => isDynamicRoute(entry.route))
    .map((entry) => ({ entry, params: matchRoutePattern(entry.route.pattern ?? entry.route.path, path) }))
    .filter((match): match is { entry: RouteEntry; params: RouteParams } => match.params !== null)
    .sort((a, b) => routeSpecificity(b.entry.route) - routeSpecificity(a.entry.route));

  const dynamic = dynamicMatches[0];
  return dynamic ? toRouteMatch(dynamic.entry, path, dynamic.params) : null;
}

export function isCurrentRoute(currentPathname: string, routePath: string): boolean {
  const current = stripLocaleFromPathname(currentPathname);
  const target = normalizePathname(routePath);
  if (target.includes(":")) return matchRoutePattern(target, current) !== null;
  return current === target || current.startsWith(`${target}/`);
}

export function buildDynamicPath(pattern: string, params: RouteParams): `/${string}` {
  const path = normalizePathname(pattern).split("/").map((segment) => {
    if (!segment.startsWith(":")) return segment;
    const key = segment.slice(1);
    const value = params[key];
    if (value === undefined) throw new Error(`Missing route param: ${key}`);
    return encodeURIComponent(value);
  }).join("/");
  return normalizePathname(path);
}

export function resolveRouteStaticParams(route: AppRoute): Promise<readonly RouteStaticParamConfig[]> {
  const cached = staticParamsCache.get(route);
  if (cached) return cached;

  const resolved = Promise.resolve(
    typeof route.staticParams === "function" ? route.staticParams() : route.staticParams ?? [],
  );
  staticParamsCache.set(route, resolved);
  return resolved;
}

function toRouteMatch(entry: RouteEntry, pathname: `/${string}`, params: RouteParams): RouteMatch {
  const group = entry.ancestors[0];
  return {
    ...(group ? { group } : {}),
    item: entry.route,
    ancestors: entry.ancestors,
    isGroupLanding: isStaticRoute(entry.route) && (entry.route.children ?? []).some(isStaticRoute),
    params,
    pathname,
  };
}

function routeSpecificity(route: AppRoute): number {
  const pattern = normalizePathname(route.pattern ?? route.path);
  return pattern.split("/").reduce((score, segment) => score + (segment.startsWith(":") ? 1 : 10), 0) + pattern.length;
}

function matchRoutePattern(pattern: string, pathname: string): RouteParams | null {
  const patternSegments = normalizePathname(pattern).split("/").filter(Boolean);
  const pathSegments = normalizePathname(pathname).split("/").filter(Boolean);
  if (patternSegments.length !== pathSegments.length) return null;

  const params: RouteParams = {};
  for (let index = 0; index < patternSegments.length; index += 1) {
    const patternSegment = patternSegments[index];
    const pathSegment = pathSegments[index];
    if (!patternSegment || !pathSegment) return null;
    if (patternSegment.startsWith(":")) {
      try {
        params[patternSegment.slice(1)] = decodeURIComponent(pathSegment);
      } catch {
        params[patternSegment.slice(1)] = pathSegment;
      }
      continue;
    }
    if (patternSegment !== pathSegment) return null;
  }

  return params;
}

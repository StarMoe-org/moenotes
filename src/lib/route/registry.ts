import { routeRegistry } from "@/config/routes";
import type { AppRoute, RouteMatch } from "@/types/route";
import { normalizePathname, stripLocaleFromPathname } from "@/i18n/routing";

const routes = routeRegistry as readonly AppRoute[];

function hasNav(route: AppRoute): route is AppRoute & { nav: NonNullable<AppRoute["nav"]> } {
  return Boolean(route.nav);
}

function navOrder(route: AppRoute): number {
  return route.nav ? route.nav.order : 0;
}

export function getAllRoutes(inputRoutes: readonly AppRoute[] = routes): AppRoute[] {
  return inputRoutes.flatMap((route) => [route, ...(route.children ? getAllRoutes(route.children) : [])]);
}

export function getNavigationGroups(): AppRoute[] {
  return routes
    .filter(hasNav)
    .sort((a, b) => navOrder(a) - navOrder(b));
}

export function getNavChildren(group: AppRoute): AppRoute[] {
  return (group.children ?? [])
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
  return getAllRoutes().find((route) => normalizePathname(route.path) === path);
}

export function findRouteMatch(pathname: string): RouteMatch | null {
  const path = stripLocaleFromPathname(pathname);
  let best: RouteMatch | null = null;

  for (const group of routes) {
    const groupPath = normalizePathname(group.path);
    if (path === groupPath) {
      best = { item: group, isGroupLanding: true };
    }

    for (const item of group.children ?? []) {
      const itemPath = normalizePathname(item.path);
      if (path === itemPath || path.startsWith(`${itemPath}/`)) {
        if (!best || itemPath.length > best.item.path.length) {
          best = { group, item, isGroupLanding: false };
        }
      }
    }
  }

  if (!best) {
    const exact = findRouteByPath(path);
    if (exact) return { item: exact, isGroupLanding: Boolean(exact.children?.length) };
  }

  return best;
}

export function isCurrentRoute(currentPathname: string, routePath: string): boolean {
  const current = stripLocaleFromPathname(currentPathname);
  const target = normalizePathname(routePath);
  return current === target || current.startsWith(`${target}/`);
}

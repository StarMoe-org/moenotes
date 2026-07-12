import { getRouteEntries, isStaticRoute } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";

export interface SearchIndexRouteItem {
  id: string;
  path: string;
  labelKey: string;
  groupId?: string;
  keywords: string[];
}

export function buildStaticSearchIndex(): SearchIndexRouteItem[] {
  return getRouteEntries()
    .filter(({ route }) => isStaticRoute(route) && route.searchable)
    .map(({ route, ancestors }) => toSearchItem(route, ancestors[0]));
}

function toSearchItem(route: AppRoute, group?: AppRoute): SearchIndexRouteItem {
  return {
    id: route.id,
    path: route.path,
    labelKey: route.labelKey,
    ...(group ? { groupId: group.id } : {}),
    keywords: route.keywords ?? [],
  };
}

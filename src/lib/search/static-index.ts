import { getNavigationGroups, getNavChildren } from "@/lib/route/registry";
import type { AppRoute } from "@/types/route";

export interface SearchIndexRouteItem {
  id: string;
  path: string;
  labelKey: string;
  groupId?: string;
  keywords: string[];
}

export function buildStaticSearchIndex(): SearchIndexRouteItem[] {
  const items: SearchIndexRouteItem[] = [];
  for (const group of getNavigationGroups()) {
    if (group.searchable) {
      items.push(toSearchItem(group));
    }
    for (const child of getNavChildren(group)) {
      if (child.searchable) {
        items.push(toSearchItem(child, group));
      }
    }
  }
  return items;
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

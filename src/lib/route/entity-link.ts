import { getRoutePathById } from "@/lib/route/registry";

/**
 * A link from one entity to the page that shows another, by route id rather than by path (internal paths are built
 * from the route registry, never written out). `detailId` appends `/<id>` for a detail route (`/items/12`); `query`
 * adds a search string for list pages that open an entity in an overlay (`/stamps?id=3`).
 */
export interface EntityLink {
  routeId: string;
  detailId?: number | string;
  query?: Readonly<Record<string, string>>;
}

/** The locale-free path an entity link points at; pass it through `localizePath` before rendering. */
export function entityLinkPath(link: EntityLink): `/${string}` {
  const base = getRoutePathById(link.routeId);
  const path = link.detailId === undefined ? base : `${base}/${encodeURIComponent(String(link.detailId))}`;
  const search = link.query ? new URLSearchParams(link.query).toString() : "";
  return (search ? `${path}?${search}` : path) as `/${string}`;
}

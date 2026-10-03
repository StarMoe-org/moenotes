import { entityLinkPath } from "@/lib/route/entity-link";

/** Locale-free path of a shop pack's page (`/shop/:id`). */
export function shopPath(id: number): `/${string}` {
  return entityLinkPath({ routeId: "shop", detailId: id });
}

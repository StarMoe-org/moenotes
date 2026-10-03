import { buildDynamicPath, getRoutePathById } from "@/lib/route/registry";

/** Unlocalized path of an exchange shop's detail page. */
export function exchangePath(exchangeId: number): `/${string}` {
  return buildDynamicPath(getRoutePathById("exchange-detail"), { id: String(exchangeId) });
}

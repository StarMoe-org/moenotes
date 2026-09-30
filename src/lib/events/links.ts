import { buildDynamicPath, getRoutePathById } from "@/lib/route/registry";

/** Unlocalized path of an event's detail page. */
export function eventPath(eventId: number): `/${string}` {
  return buildDynamicPath(getRoutePathById("event-detail"), { id: String(eventId) });
}

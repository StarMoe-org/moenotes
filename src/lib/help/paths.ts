import { buildDynamicPath, findRouteById } from "@/lib/route/registry";

/** Locale-free path of a manual topic's page (`/help/:id`); pass it through localizePath before rendering. */
export function helpTopicPath(topicId: number): `/${string}` {
  const route = findRouteById("help-detail");
  return buildDynamicPath(route?.pattern ?? route?.path ?? "", { id: String(topicId) });
}

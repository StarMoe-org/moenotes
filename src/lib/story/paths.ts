import { buildDynamicPath, findRouteById } from "@/lib/route/registry";

/** Locale-free path of a story's reader page (`/story/:id`); pass it through localizePath before rendering. */
export function storyPath(advId: number): `/${string}` {
  const route = findRouteById("story-detail");
  return buildDynamicPath(route?.pattern ?? route?.path ?? "", { id: String(advId) });
}

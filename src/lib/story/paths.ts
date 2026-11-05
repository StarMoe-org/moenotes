import { stripLocaleFromPathname } from "@/i18n/routing";
import { buildDynamicPath, findRouteById } from "@/lib/route/registry";
import { isChapterSection, type StoryChapterSection } from "@/lib/story/sections";

/** Locale-free path of a story's reader page (`/story/:id`); pass it through localizePath before rendering. */
export function storyPath(advId: number): `/${string}` {
  const route = findRouteById("story-detail");
  return buildDynamicPath(route?.pattern ?? route?.path ?? "", { id: String(advId) });
}

/** Locale-free path of a chapter page (`/story/:category/:id`); pass it through localizePath before rendering. */
export function storyChapterPath(section: StoryChapterSection, chapterId: number): `/${string}` {
  const route = findRouteById("story-chapter");
  return buildDynamicPath(route?.pattern ?? route?.path ?? "", { category: section, id: String(chapterId) });
}

/** The section and chapter a chapter page's pathname addresses, or null when it is some other path. */
export function parseStoryChapterPath(pathname: string): { section: StoryChapterSection; chapterId: number } | null {
  const route = findRouteById("story-chapter");
  const pattern = (route?.pattern ?? route?.path ?? "").split("/").filter(Boolean);
  const segments = stripLocaleFromPathname(pathname).split("/").filter(Boolean);
  if (pattern.length === 0 || pattern.length !== segments.length) return null;

  const params: Record<string, string> = {};
  for (const [index, part] of pattern.entries()) {
    const segment = segments[index]!;
    if (part.startsWith(":")) params[part.slice(1)] = decodeURIComponent(segment);
    else if (part !== segment) return null;
  }

  const chapterId = Number(params.id);
  if (!isChapterSection(params.category) || !Number.isSafeInteger(chapterId) || chapterId <= 0) return null;
  return { section: params.category, chapterId };
}

import type { AppLocale } from "@/config/locales";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";

/** The song ranking tool, opened on `musicId` (`?music=`) when given. */
export function getMusicRankingHref(locale: AppLocale, musicId?: number): string {
  const path = localizePath(getRoutePathById("music-ranking"), locale);
  return musicId === undefined ? path : `${path}?${new URLSearchParams({ music: String(musicId) })}`;
}

/** `?music=` of the song ranking tool, or null. */
export function parseMusicRankingSearch(search: string): number | null {
  const musicId = Number(new URLSearchParams(search).get("music"));
  return Number.isSafeInteger(musicId) && musicId > 0 ? musicId : null;
}

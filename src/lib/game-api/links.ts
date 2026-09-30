import type { AppLocale } from "@/config/locales";
import { isGameServer, type GameServer } from "@/config/servers";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";

/** The song ranking tool, opened on `musicId` (`?music=`) when given. */
export function getMusicRankingHref(locale: AppLocale, musicId?: number): string {
  const path = localizePath(getRoutePathById("music-ranking"), locale);
  return musicId === undefined ? path : `${path}?${new URLSearchParams({ music: String(musicId) })}`;
}

export interface EventTrackerQuery {
  server?: GameServer | null;
  /** Omitted: the server's current event. */
  event?: string | null;
  /** Challenge song (`challengeMusicId`). */
  song?: string | null;
}

/** The event tracker (`?server=&event=&song=`); empty parts are left out. */
export function getEventTrackerHref(locale: AppLocale, query: EventTrackerQuery = {}): string {
  const path = localizePath(getRoutePathById("event-tracker"), locale);
  const params = new URLSearchParams();
  for (const key of ["server", "event", "song"] as const) {
    const value = query[key];
    if (value) params.set(key, value);
  }
  const search = params.toString();
  return search ? `${path}?${search}` : path;
}

export function parseEventTrackerSearch(search: string): { server: GameServer | null; event: string | null; song: string | null } {
  const params = new URLSearchParams(search);
  const server = params.get("server");
  const id = (key: string) => {
    const value = params.get(key);
    return value && /^\d{1,19}$/.test(value) ? value : null;
  };
  return { server: isGameServer(server) ? server : null, event: id("event"), song: id("song") };
}

/** `?music=` of the song ranking tool, or null. */
export function parseMusicRankingSearch(search: string): number | null {
  const musicId = Number(new URLSearchParams(search).get("music"));
  return Number.isSafeInteger(musicId) && musicId > 0 ? musicId : null;
}

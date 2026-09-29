import type { GameServer } from "@/config/game-api";
import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/** An in-game announcement as the game API lists it (rankd passes it through). Times are Unix seconds as strings. */
export interface Announcement {
  id: string;
  category?: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  lastUpdatedAt?: string;
  bannerUrl?: string;
  /** Only in the detail: the full HTML document the game's WebView shows. Never unfiltered in the page's DOM. */
  body?: string;
}

export interface AnnouncementList {
  announcements?: Announcement[];
}

export const NEWS_CATEGORIES = ["maintenance", "bug", "campaign", "update", "gacha", "other"] as const;
export type NewsCategory = typeof NEWS_CATEGORIES[number];

/** The game's category (`MAINTENANCE`, …) as a `news.category.*` key; unknown ones count as `other`. */
export function newsCategory(value: string | undefined): NewsCategory {
  const key = value?.toLowerCase();
  return (NEWS_CATEGORIES as readonly string[]).includes(key ?? "") ? (key as NewsCategory) : "other";
}

export function listAnnouncements(list: AnnouncementList): Announcement[] {
  return Array.isArray(list.announcements) ? list.announcements.filter((item) => item && typeof item.id === "string") : [];
}

/**
 * The body for `<iframe sandbox srcdoc>`. It is written for the game's dark WebView (white text on no
 * background), so a dark backdrop goes in first; nothing of the game's markup is changed.
 */
export function announcementSrcdoc(body: string): string {
  const backdrop = "<style>html{background:#1b2133;color-scheme:dark}body{margin:12px 16px}</style>";
  const head = body.match(/<head[^>]*>/i);
  if (head?.index !== undefined) {
    const at = head.index + head[0].length;
    return body.slice(0, at) + backdrop + body.slice(at);
  }
  return backdrop + body;
}

type SeenState = Partial<Record<GameServer, Record<string, string>>>;

function readSeen(): SeenState {
  try {
    const parsed = JSON.parse(safeGetLocalStorage(storageKeys.newsSeen) ?? "{}") as unknown;
    return parsed && typeof parsed === "object" ? (parsed as SeenState) : {};
  } catch {
    return {};
  }
}

/** Versions this browser has opened, by announcement id (`lastUpdatedAt`). */
export function seenAnnouncements(server: GameServer): Record<string, string> {
  return readSeen()[server] ?? {};
}

/** Records the opened version. A server has a few dozen announcements, so the record stays small. */
export function markAnnouncementSeen(server: GameServer, id: string, revision: string): void {
  const state = readSeen();
  const current = state[server] ?? {};
  if (Number(current[id] ?? 0) >= Number(revision)) return;
  state[server] = { ...current, [id]: revision };
  safeSetLocalStorage(storageKeys.newsSeen, JSON.stringify(state));
}

/** An announcement this browser opened before it was updated. */
export function isUpdatedSinceSeen(item: Announcement, seen: Record<string, string>): boolean {
  const opened = seen[item.id];
  return opened !== undefined && Number(item.lastUpdatedAt ?? 0) > Number(opened);
}

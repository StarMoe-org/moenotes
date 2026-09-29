import { gameApiConfig, type GameServer } from "@/config/game-api";
import type { Announcement, AnnouncementList } from "@/lib/game-api/announcements";
import type { MusicRanking } from "@/lib/game-api/music-ranking";

/**
 * Network side of rankd's verbatim caches (music rankings, announcements). Bodies are the game API's JSON as is;
 * what rankd knows about its copy comes in headers, collected into GameApiResponse.
 */

export interface GameApiResponse<T> {
  data: T;
  /** When rankd fetched this copy from the game (ms), `X-Fetched-At`. */
  fetchedAt: number | null;
  /** rankd's clock (ms), `X-Server-Time`; ages are measured against it, not the browser's clock. */
  serverTime: number | null;
  /** The copy is past its refresh time; rankd is already refreshing it. */
  stale: boolean;
  /** Announcement version (`lastUpdatedAt`), `X-Revision`. */
  revision: string | null;
  /** False once an announcement has left the game's list (`X-Listed: 0`). */
  listed: boolean;
}

/**
 * `kind` is rankd's error kind: `pending` (still queued, try again after `retryAfter`), `upstream` (the game
 * could not be reached or is in maintenance; `message` says why), `not_found`, … and `network` when rankd itself
 * could not be reached.
 */
export class GameApiError extends Error {
  constructor(
    readonly status: number,
    readonly kind: string,
    message: string,
    /** Seconds, from `Retry-After`. */
    readonly retryAfter: number | null,
  ) {
    super(message || kind);
    this.name = "GameApiError";
  }
}

export function fetchMusicRanking(server: GameServer, musicId: number, signal?: AbortSignal): Promise<GameApiResponse<MusicRanking>> {
  return getJson(`${gameApiConfig.base}/${server}/music/${musicId}/ranking`, signal);
}

export function fetchAnnouncements(server: GameServer, signal?: AbortSignal): Promise<GameApiResponse<AnnouncementList>> {
  return getJson(`${gameApiConfig.base}/${server}/announcements`, signal);
}

/** The latest version, or the one whose `lastUpdatedAt` is `revision`. */
export function fetchAnnouncement(server: GameServer, id: string, revision?: string, signal?: AbortSignal): Promise<GameApiResponse<{ announcement?: Announcement }>> {
  const query = revision ? `?${new URLSearchParams({ rev: revision })}` : "";
  return getJson(`${gameApiConfig.base}/${server}/announcements/${encodeURIComponent(id)}${query}`, signal);
}

/** Versions rankd kept of an announcement, newest first. */
export async function fetchAnnouncementRevisions(server: GameServer, id: string, signal?: AbortSignal): Promise<string[]> {
  const response = await getJson<{ revisions?: unknown }>(`${gameApiConfig.base}/${server}/announcements/${encodeURIComponent(id)}/revisions`, signal);
  const revisions = response.data.revisions;
  return Array.isArray(revisions) ? revisions.filter((value): value is string => typeof value === "string") : [];
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<GameApiResponse<T>> {
  let response: Response;
  try {
    response = await fetch(url, { signal: signal ?? null, credentials: "omit", headers: { Accept: "application/json" } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new GameApiError(0, "network", error instanceof Error ? error.message : String(error), null);
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: { kind?: unknown; message?: unknown } } | null;
    const kind = typeof body?.error?.kind === "string" ? body.error.kind : "internal";
    const message = typeof body?.error?.message === "string" ? body.error.message : "";
    throw new GameApiError(response.status, kind, message, headerNumber(response, "Retry-After"));
  }
  return {
    data: (await response.json()) as T,
    fetchedAt: headerNumber(response, "X-Fetched-At"),
    serverTime: headerNumber(response, "X-Server-Time"),
    stale: response.headers.get("X-Stale") === "1",
    revision: response.headers.get("X-Revision"),
    listed: response.headers.get("X-Listed") !== "0",
  };
}

function headerNumber(response: Response, name: string): number | null {
  const raw = response.headers.get(name);
  const value = raw === null ? Number.NaN : Number(raw);
  return Number.isFinite(value) ? value : null;
}

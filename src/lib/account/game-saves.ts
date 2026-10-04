import { accountApi, gameSavePath, GAME_SAVE_SERVERS, type GameSaveServer } from "@/config/account";

/** One uploaded save as `GET /api/me/saves` lists it. */
export interface GameSaveMeta {
  server: GameSaveServer;
  /** The player ID shown in game (the save's `_profileId`), as decimal text. */
  accountId: string;
  sha256: string;
  /** Size of the save as uploaded, before compression. */
  size: number;
  /** Unix milliseconds. */
  uploadedAt: number;
  checkedAt: number;
  client: string | null;
}

/** `save_unavailable`: the account lists the save but its bytes cannot be read right now (500 from the API). */
export type GameSaveErrorCode = "signed_out" | "not_found" | "save_unavailable" | "integrity" | "invalid" | "unavailable";
export class GameSaveError extends Error {
  constructor(readonly code: GameSaveErrorCode) { super(`Game save request: ${code}`); }
}

/** Saves are at most 32 MiB once inflated. */
export const GAME_SAVE_MAX_BYTES = 32 * 1024 * 1024;
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);
const decimal = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]*$/.test(value) && BigInt(value) <= 9223372036854775807n;
const time = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
const sha = (value: unknown): value is string => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);

/** Newest first, as the API lists them. Unknown fields are ignored; a malformed entry rejects the list. */
export function parseGameSaveList(value: unknown): GameSaveMeta[] {
  if (!object(value) || !Array.isArray(value.saves)) throw new GameSaveError("invalid");
  return value.saves.map(entry => {
    if (!object(entry) || !GAME_SAVE_SERVERS.includes(entry.server as GameSaveServer) || !decimal(entry.accountId) || !sha(entry.sha256)
      || !time(entry.size) || !time(entry.uploadedAt) || !time(entry.checkedAt)) throw new GameSaveError("invalid");
    return { server: entry.server as GameSaveServer, accountId: entry.accountId,
      sha256: entry.sha256, size: entry.size, uploadedAt: entry.uploadedAt, checkedAt: entry.checkedAt, client: typeof entry.client === "string" ? entry.client : null };
  });
}

/** The SHA-256 an `ETag: "<sha256>"` names (a weak validator names the same bytes), or null. */
export function etagSha256(header: string | null): string | null {
  const match = /^(?:W\/)?"([a-f0-9]{64})"$/.exec(header?.trim() ?? "");
  return match ? match[1]! : null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

export type GameSaveDownload = { status: "not-modified" } | { status: "ok"; sha256: string; bytes: Uint8Array };

async function request(path: string, init: RequestInit, fetcher: typeof fetch): Promise<Response> {
  let response: Response;
  try {
    response = await fetcher(path, { credentials: "same-origin", cache: "no-store", redirect: "error", ...init });
  } catch { throw new GameSaveError("unavailable"); }
  if (response.status === 401) throw new GameSaveError("signed_out");
  if (response.status === 404) throw new GameSaveError("not_found");
  if (response.status >= 500) {
    const body = await response.json().catch(() => null) as { error?: unknown } | null;
    throw new GameSaveError(body?.error === "save_unavailable" ? "save_unavailable" : "unavailable");
  }
  return response;
}

/** The signed-in user's saves (`signed_out` without a session). */
export async function listGameSaves(fetcher: typeof fetch = fetch): Promise<GameSaveMeta[]> {
  const response = await request(accountApi.gameSaves, { headers: { accept: "application/json" } }, fetcher);
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) throw new GameSaveError("invalid");
  let body: unknown;
  try { body = await response.json(); } catch { throw new GameSaveError("invalid"); }
  return parseGameSaveList(body);
}

/**
 * Downloads one save. The bytes must hash to the SHA-256 the response's ETag names, or the download fails with
 * `integrity`. With `ifNoneMatch` (the SHA-256 already held) an unchanged save answers `not-modified`.
 */
export async function downloadGameSave(server: GameSaveServer, accountId: string, options: { ifNoneMatch?: string; fetch?: typeof fetch } = {}): Promise<GameSaveDownload> {
  if (!GAME_SAVE_SERVERS.includes(server) || !decimal(accountId) || options.ifNoneMatch !== undefined && !sha(options.ifNoneMatch)) throw new GameSaveError("invalid");
  const response = await request(gameSavePath(server, accountId), {
    headers: { accept: "application/json", ...(options.ifNoneMatch ? { "if-none-match": `"${options.ifNoneMatch}"` } : {}) },
  }, options.fetch ?? fetch);
  if (response.status === 304 && options.ifNoneMatch) return { status: "not-modified" };
  if (response.status !== 200) throw new GameSaveError("invalid");
  const expected = etagSha256(response.headers.get("etag"));
  if (!expected) throw new GameSaveError("integrity");
  let bytes: Uint8Array;
  try { bytes = new Uint8Array(await response.arrayBuffer()); } catch { throw new GameSaveError("unavailable"); }
  if (bytes.byteLength > GAME_SAVE_MAX_BYTES) throw new GameSaveError("invalid");
  const actual = await sha256Hex(bytes);
  if (actual !== expected) throw new GameSaveError("integrity");
  return { status: "ok", sha256: actual, bytes };
}

/** Removes one uploaded save from the account. */
export async function deleteGameSave(server: GameSaveServer, accountId: string, fetcher: typeof fetch = fetch): Promise<void> {
  if (!GAME_SAVE_SERVERS.includes(server) || !decimal(accountId)) throw new GameSaveError("invalid");
  const response = await request(gameSavePath(server, accountId), { method: "DELETE" }, fetcher);
  if (response.status !== 204) throw new GameSaveError("invalid");
}

/** The save's text. A leading byte-order mark is not part of the JSON value. */
export function gameSaveText(bytes: Uint8Array): string {
  try { return new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { throw new GameSaveError("invalid"); }
}

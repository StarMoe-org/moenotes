import type { GameSaveServer } from "@/config/account";
import { downloadGameSave, gameSaveText, GameSaveError, type GameSaveErrorCode, type GameSaveMeta } from "@/lib/account/game-saves";
import { parseGameSave, type GameSavePlayer } from "./game-save";
import type { BoxSaveLink } from "./model";
import { gameSaveCacheKey, readCachedGameSave, writeCachedGameSave } from "./save-cache";

/** A save whose bytes were checked against their SHA-256, as text and as the fields the Box reads. */
export interface LoadedGameSave { server: GameSaveServer; accountId: string; sha256: string; bytes: Uint8Array; text: string; player: GameSavePlayer }
export type LinkedGameSaveResult =
  | { status: "ready"; save: LoadedGameSave }
  /** The account holds another version now; the linked one is neither cached nor downloadable. */
  | { status: "changed" }
  | { status: "error"; code: GameSaveErrorCode };

const loaded = new Map<string, LoadedGameSave>();
function remember(server: GameSaveServer, accountId: string, sha256: string, bytes: Uint8Array): LoadedGameSave {
  const key = gameSaveCacheKey(server, accountId), previous = loaded.get(key);
  if (previous?.sha256 === sha256) return previous;
  const text = gameSaveText(bytes);
  let player: GameSavePlayer;
  try { player = parseGameSave(text); } catch { throw new GameSaveError("invalid"); }
  const save = { server, accountId, sha256, bytes, text, player };
  loaded.set(key, save);
  return save;
}
const failure = (error: unknown): LinkedGameSaveResult => ({ status: "error", code: error instanceof GameSaveError ? error.code : "invalid" });

/** Downloads the account's current save. Kept in memory for this page; `keepGameSave` stores it. */
export async function fetchGameSave(server: GameSaveServer, accountId: string): Promise<LoadedGameSave> {
  const download = await downloadGameSave(server, accountId);
  if (download.status !== "ok") throw new GameSaveError("invalid");
  return remember(server, accountId, download.sha256, download.bytes);
}

/** Stores a checked save for later visits and offline use. */
export async function keepGameSave(save: LoadedGameSave, uploadedAt: number): Promise<void> {
  await writeCachedGameSave({ server: save.server, accountId: save.accountId, sha256: save.sha256, uploadedAt, bytes: save.bytes });
}

/** The exact version a Box links: from this page, the browser cache, or the account when it still holds it. */
export async function openLinkedGameSave(link: BoxSaveLink): Promise<LinkedGameSaveResult> {
  const memory = loaded.get(gameSaveCacheKey(link.server, link.accountId));
  if (memory?.sha256 === link.sha256) return { status: "ready", save: memory };
  try {
    const cached = await readCachedGameSave(link.server, link.accountId).catch(() => null);
    if (cached?.sha256 === link.sha256) return { status: "ready", save: remember(link.server, link.accountId, cached.sha256, new Uint8Array(cached.bytes)) };
    const download = await downloadGameSave(link.server, link.accountId);
    if (download.status !== "ok" || download.sha256 !== link.sha256) return { status: "changed" };
    const save = remember(link.server, link.accountId, download.sha256, download.bytes);
    await keepGameSave(save, link.uploadedAt).catch(() => undefined);
    return { status: "ready", save };
  } catch (error) { return failure(error); }
}

/**
 * The upload a signed-in Box reads without being asked: among `saves` (one save server, newest first), the save of a
 * verified game account of the Box's server, else the save of the only player who uploaded. Null when several
 * players uploaded and none is verified for this server; the user picks then.
 */
export function defaultGameSave(saves: readonly GameSaveMeta[], verifiedProfileIds: readonly string[]): GameSaveMeta | null {
  const verified = saves.find(save => verifiedProfileIds.includes(save.accountId));
  if (verified) return verified;
  return new Set(saves.map(save => save.accountId)).size === 1 ? saves[0]! : null;
}

/** Forgets this page's copy, e.g. after the Box is unlinked. */
export function forgetLoadedGameSave(server: GameSaveServer, accountId: string): void {
  loaded.delete(gameSaveCacheKey(server, accountId));
}

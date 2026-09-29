import { accountApi, gameAccountPath } from "@/config/account";
import type { GameServer } from "@/config/players";
import { type PlayerSnapshot, parsePlayerSnapshot } from "@/lib/account/player-profile";

/**
 * An Our Notes account under the user: unverified (a claim with a code) or verified (the code was seen in its
 * in-game name). `name` is the in-game name seen when it was added.
 */
export interface GameAccount {
  server: GameServer;
  profileId: string;
  name: string | null;
  verified: boolean;
  /** Whether its profile page is public; only a verified account can be. */
  public: boolean;
  /** What the in-game name must carry; only unverified accounts have one. */
  code: string | null;
  /** Unix milliseconds. */
  createdAt: number;
  verifiedAt: number | null;
}

export interface GameAccountsState {
  /** False when starmoe-api has no game API configured. */
  available: boolean;
  accounts: GameAccount[];
}

/** Error codes of starmoe-api's game account endpoints (its README, "Game accounts"). */
export type GameAccountError =
  | "invalid_account"
  | "player_not_found"
  | "already_added"
  | "too_many_accounts"
  | "already_verified"
  | "name_mismatch"
  | "not_found"
  | "not_verified"
  | "too_soon"
  | "game_unavailable"
  | "signed_out"
  | "unknown";

export class GameAccountRequestError extends Error {
  constructor(
    readonly code: GameAccountError,
    /** For `name_mismatch`: the in-game name the game shows now. */
    readonly seenName: string | null = null,
  ) {
    super(`game account request failed: ${code}`);
  }
}

async function request(method: string, path: string, body?: unknown): Promise<GameAccountsState> {
  let response: Response;
  try {
    const init: RequestInit = { method, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } };
    if (body !== undefined) {
      init.headers = { accept: "application/json", "content-type": "application/json" };
      init.body = JSON.stringify(body);
    }
    response = await fetch(path, init);
  } catch {
    // Our own API is unreachable (offline, or it is down); that is not the game's fault.
    throw new GameAccountRequestError("unknown");
  }
  const parsed = (await response.json().catch(() => null)) as (Partial<GameAccountsState> & { error?: string; name?: string }) | null;
  if (!response.ok || !parsed || parsed.error) {
    throw new GameAccountRequestError((parsed?.error as GameAccountError | undefined) ?? "unknown", parsed?.name ?? null);
  }
  return parsed as GameAccountsState;
}

export function loadGameAccounts(): Promise<GameAccountsState> {
  return request("GET", accountApi.gameAccounts);
}

/** Looks the player up and adds the account unverified, with a code. */
export function addGameAccount(server: GameServer, profileId: string): Promise<GameAccountsState> {
  return request("POST", accountApi.gameAccounts, { server, profileId });
}

/** Swaps in a new code, e.g. when the game refuses a name with the old one. */
export function refreshGameCode(server: GameServer, profileId: string): Promise<GameAccountsState> {
  return request("POST", `${gameAccountPath(server, profileId)}/code`);
}

/** Verifies the account if its in-game name carries the code; otherwise throws `name_mismatch` with the name seen. */
export function verifyGameAccount(server: GameServer, profileId: string): Promise<GameAccountsState> {
  return request("POST", `${gameAccountPath(server, profileId)}/verify`);
}

/** Removes the account, verified or not. */
export function removeGameAccount(server: GameServer, profileId: string): Promise<GameAccountsState> {
  return request("DELETE", gameAccountPath(server, profileId));
}

/** Opens or closes a verified account's public profile page. */
export function setGameAccountPublic(server: GameServer, profileId: string, isPublic: boolean): Promise<GameAccountsState> {
  return request("PUT", `${gameAccountPath(server, profileId)}/visibility`, { public: isPublic });
}

async function snapshot(method: string, path: string): Promise<PlayerSnapshot> {
  let response: Response;
  try {
    response = await fetch(path, { method, credentials: "same-origin", cache: "no-store", headers: { accept: "application/json" } });
  } catch {
    throw new GameAccountRequestError("unknown");
  }
  const parsed = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok || !parsed || parsed.error) {
    throw new GameAccountRequestError((parsed?.error as GameAccountError | undefined) ?? "unknown");
  }
  const result = parsePlayerSnapshot(parsed);
  if (!result) throw new GameAccountRequestError("unknown");
  return result;
}

/** The stored profile of one of the user's verified accounts. */
export function loadOwnProfile(server: GameServer, profileId: string): Promise<PlayerSnapshot> {
  return snapshot("GET", `${gameAccountPath(server, profileId)}/profile`);
}

/** Fetches it again from the game; starmoe-api keeps it if it is under a minute old. */
export function refreshOwnProfile(server: GameServer, profileId: string): Promise<PlayerSnapshot> {
  return snapshot("POST", `${gameAccountPath(server, profileId)}/profile/refresh`);
}

/** A public profile page's data; `not_found` unless its verified holder made it public. */
export function loadPublicProfile(server: GameServer, profileId: string): Promise<PlayerSnapshot> {
  return snapshot("GET", `${accountApi.players}/${server}/${encodeURIComponent(profileId)}`);
}

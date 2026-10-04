import type { GameServer } from "@/config/players";
import { siteConfig } from "@/config/site";

/**
 * Paths of the account API: starmoe-api, a separate service and repository. They are a contract with it. Pages
 * reach it same-origin: the deploy server forwards `/api/*` to it (docs/account.md), so its cookies are
 * first-party and no CORS is involved.
 */
export const accountApi = {
  login: "/api/auth/login",
  callback: "/api/auth/callback",
  logout: "/api/auth/logout",
  me: "/api/me",
  avatar: "/api/me/avatar",
  gameAccounts: "/api/me/game-accounts",
  cardBoxes: "/api/me/boxes",
  /**
   * Game saves uploaded with StarMoe Box: `GET` lists them, `/{saveServer}/{accountId}` is one save. `accountId` is
   * the player ID shown in game.
   */
  gameSaves: "/api/me/saves",
  /** Public profiles: `/api/players/{server}/{profileId}`. */
  players: "/api/players",
} as const;

/**
 * Servers of uploaded game saves. One international client serves TW/HK/MO, EN and KR, so their saves share
 * `intl`; JP has its own client.
 */
export const GAME_SAVE_SERVERS = ["jp", "intl"] as const;
export type GameSaveServer = typeof GAME_SAVE_SERVERS[number];

/** The save server whose saves hold a game server's collection. */
export function gameSaveServer(server: GameServer): GameSaveServer {
  return server === "jp" ? "jp" : "intl";
}

/** One uploaded save: `GET` answers its bytes as uploaded (`ETag: "<sha256>"`), `DELETE` removes it. */
export function gameSavePath(server: GameSaveServer, accountId: string): string {
  return `${accountApi.gameSaves}/${server}/${encodeURIComponent(accountId)}`;
}

/** One private collection for the signed-in Passport account and selected game server. */
export function cardBoxPath(server: GameServer): string {
  return `${accountApi.cardBoxes}/${server}`;
}

/** One game account: DELETE removes it; `/code` and `/verify` (POST) below it refresh its code and verify it. */
export function gameAccountPath(server: GameServer, profileId: string): string {
  return `${accountApi.gameAccounts}/${server}/${encodeURIComponent(profileId)}`;
}

/** Starts a StarMoe Passport sign-in that comes back to `returnTo`; the sign-in page follows `locale`. */
export function accountLoginUrl(locale: string, returnTo: string): string {
  return `${accountApi.login}?${new URLSearchParams({ return: returnTo, locale })}`;
}

/**
 * Pages of the passport's Account Center (Logto's prebuilt UI) this site links to. `password` and `email` are
 * single tasks; `security` is the hub.
 */
export type PassportAccountPage = "password" | "email" | "security";

/**
 * A link into the passport's Account Center. After a single task it shows its own success page, whose button goes
 * back to `returnTo` (an absolute URL). The hub ignores `returnTo`.
 */
export function passportAccountUrl(page: PassportAccountPage, locale: string, returnTo: string): string {
  return `${siteConfig.passportUrl}/account/${page}?${new URLSearchParams({ redirect: returnTo, show_success: "true", ui_locales: locale })}`;
}

/**
 * One profile card image of a player, served by starmoe-api: the public one, or (`own`) one of the signed-in user's
 * verified accounts, which works while the page is private too.
 */
export function playerCardPath(server: GameServer, profileId: string, index: number, own: boolean): string {
  const base = own ? gameAccountPath(server, profileId) : `${accountApi.players}/${server}/${encodeURIComponent(profileId)}`;
  return `${base}/cards/${index}`;
}

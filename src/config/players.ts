import { PATH_PREFIX_LOCALE } from "./locales";

// Our Notes servers and player page paths. Relative imports only: the deploy server (server/static.ts) and the
// dev server (astro.config.mjs) import this file too, and neither resolves the `@/` alias.

/**
 * Our Notes servers an account can be bound on, named as starmoe-api and the game gateway name them. `tw` is the
 * Traditional Chinese server for Hong Kong, Macau and Taiwan (HMT).
 */
export const GAME_SERVERS = ["tw", "jp", "en", "kr"] as const;
export type GameServer = (typeof GAME_SERVERS)[number];

/** International profile IDs are 11 digits with a regional prefix; JP accepts a positive signed int64. */
const gameProfileIdPattern: Record<GameServer, RegExp> = {
  tw: /^2\d{10}$/,
  en: /^3\d{10}$/,
  kr: /^4\d{10}$/,
  jp: /^[1-9]\d{0,18}$/,
};

export function isGameServer(value: string): value is GameServer {
  return (GAME_SERVERS as readonly string[]).includes(value);
}

/** Same check starmoe-api makes, so an ID that cannot be on the server is caught before the request. */
export function isGameProfileId(server: GameServer, id: string): boolean {
  if (!gameProfileIdPattern[server].test(id)) return false;
  // Compare decimal text to preserve int64 precision in both browsers and the deploy server.
  return server !== "jp" || id.length < 19 || id <= "9223372036854775807";
}

/**
 * The public player page, `/u/{server}/{profileId}` under a locale prefix. Every player shares one static shell per
 * locale, built at `/u`; the page reads the player from its own URL.
 */
export const PLAYER_PAGE_PATH = "/u";

/** The page of one player, without a locale prefix. */
export function playerPagePath(server: GameServer, profileId: string): `/${string}` {
  return `${PLAYER_PAGE_PATH}/${server}/${profileId}`;
}

const playerPagePattern = /^(?:\/([a-z-]+))?\/u\/([a-z]+)\/(\d+)\/?$/;

/** The player a site path names (`/u/tw/21139118822`, `/ja/u/jp/1`), or null. */
export function parsePlayerPagePath(pathname: string): { prefix: string; server: GameServer; profileId: string } | null {
  const match = playerPagePattern.exec(pathname);
  if (!match) return null;
  const [, prefix = "", server = "", profileId = ""] = match;
  if (prefix && !(prefix in PATH_PREFIX_LOCALE)) return null;
  if (!isGameServer(server) || !isGameProfileId(server, profileId)) return null;
  return { prefix, server, profileId };
}

/** The static shell that serves a player page (`/ja/u/`), or null when the path is not one. */
export function playerShellPath(pathname: string): string | null {
  const player = parsePlayerPagePath(pathname);
  if (!player) return null;
  return `${player.prefix ? `/${player.prefix}` : ""}${PLAYER_PAGE_PATH}/`;
}

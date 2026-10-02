import { GAME_SERVER_PROFILES, GAME_SERVERS, type GameServer } from "./servers";

/**
 * Moenotes-ranking (rankd): per-server copies of the game's music rankings and announcements, served as the game
 * API returned them. Pages call it from the browser at run time; it allows this site's origin in CORS. The
 * contract is its docs/api.md.
 */
export const gameApiConfig = {
  base: `${(import.meta.env.PUBLIC_GAME_API || "https://api.bdon.moe").replace(/\/+$/, "")}/api/v1`,
} as const;

/** Game servers rankd collects, in the order the switchers show them: every server of src/config/servers.ts. */
export { GAME_SERVERS, type GameServer };

/** Each server's local time, used to show announcement schedules. */
export const GAME_SERVER_TIME_ZONES: Record<GameServer, string> = Object.fromEntries(
  GAME_SERVERS.map((server) => [server, GAME_SERVER_PROFILES[server].timeZone]),
) as Record<GameServer, string>;

/**
 * Profile card image from the ranking service cache: rankd proxies moenotes-api's authenticated card endpoint
 * with long-term caching, so public ranking pages can show cards without user auth.
 * Page is 1-based (the game API's convention).
 */
export function rankingProfileCardUrl(server: GameServer, profileId: string, page: number): string {
  return `${gameApiConfig.base}/${server}/ranking/profile/${encodeURIComponent(profileId)}/card/${page}`;
}

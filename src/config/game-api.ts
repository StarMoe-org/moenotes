/**
 * Moenotes-ranking (rankd): per-server copies of the game's music rankings and announcements, served as the game
 * API returned them. Pages call it from the browser at run time; it allows this site's origin in CORS. The
 * contract is its docs/api.md.
 */
export const gameApiConfig = {
  base: `${(import.meta.env.PUBLIC_GAME_API || "https://api.bdon.moe").replace(/\/+$/, "")}/api/v1`,
} as const;

/** Game servers rankd collects, in the order the switchers show them. */
export const GAME_SERVERS = ["tw", "jp", "kr", "en"] as const;
export type GameServer = typeof GAME_SERVERS[number];

/** Each server's local time, used to show announcement schedules. */
export const GAME_SERVER_TIME_ZONES: Record<GameServer, string> = {
  tw: "Asia/Taipei",
  jp: "Asia/Tokyo",
  kr: "Asia/Seoul",
  en: "UTC",
};

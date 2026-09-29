// Relative imports only: the deploy server (server/upstream.ts) imports this file too and does not resolve `@/`.

/**
 * Our Notes game servers, in the order the switchers show them. Each has its own MasterData (moenotes-masterdata-sync)
 * and its own asset catalog (moenotes-assets); see docs/servers.md.
 */
export const GAME_SERVERS = ["tw", "jp", "kr", "en"] as const;
export type GameServer = typeof GAME_SERVERS[number];

/** Language directories of the asset service (`/{region}/{language}/{key}/…`), one per MasterText column. */
export const ASSET_LANGUAGES = ["zh-Hans", "zh-Hant", "ja", "en", "ko"] as const;
export type AssetLanguage = typeof ASSET_LANGUAGES[number];

export interface GameServerProfile {
  /** Entry of the metadata service's `current_version.json`, and the data repository's directory. */
  masterdataRegion: string;
  /** Where the metadata service serves the server's tables. */
  masterdataPath: `/${string}`;
  /** Region of the asset service (`/regions`, `versions/current_version.json`). */
  assetRegion: string;
  /** Languages the asset region publishes, in the order a missing language falls back through. */
  assetLanguages: readonly AssetLanguage[];
  /** UTC offset of the server's MasterData timestamps, which carry none (src/lib/schedule). */
  masterdataUtcOffset: "+08:00" | "+09:00";
  /** The server's local time, for schedules. */
  timeZone: string;
}

export const GAME_SERVER_PROFILES: Readonly<Record<GameServer, GameServerProfile>> = {
  // The international servers share one MasterData build, timed in UTC+8.
  tw: { masterdataRegion: "hk-tw-mo", masterdataPath: "/tw/master", assetRegion: "tw", assetLanguages: ASSET_LANGUAGES, masterdataUtcOffset: "+08:00", timeZone: "Asia/Taipei" },
  // The JP catalog has one language, and its MasterData is timed in JST.
  jp: { masterdataRegion: "jp", masterdataPath: "/jp/master", assetRegion: "jp", assetLanguages: ["ja"], masterdataUtcOffset: "+09:00", timeZone: "Asia/Tokyo" },
  kr: { masterdataRegion: "kr", masterdataPath: "/kr/master", assetRegion: "kr", assetLanguages: ASSET_LANGUAGES, masterdataUtcOffset: "+08:00", timeZone: "Asia/Seoul" },
  en: { masterdataRegion: "en", masterdataPath: "/en/master", assetRegion: "en", assetLanguages: ASSET_LANGUAGES, masterdataUtcOffset: "+08:00", timeZone: "UTC" },
};

/**
 * The server every build shows, whose data an entity takes first when several servers have it. Its asset region is
 * the asset service's default region, so its files keep the short `/{language}/{key}/…` paths.
 */
export const PRIMARY_SERVER: GameServer = "tw";

export function isGameServer(value: unknown): value is GameServer {
  return typeof value === "string" && (GAME_SERVERS as readonly string[]).includes(value);
}

/** Servers in switcher order, without duplicates or unknown names. */
export function orderServers(servers: Iterable<string>): GameServer[] {
  const set = new Set(servers);
  return GAME_SERVERS.filter((server) => set.has(server));
}

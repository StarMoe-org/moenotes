/**
 * Open Platform game API reference, mirroring the backend contract (paths, query parameters and
 * which of them are required). Scope names, parameter names and path segments stay literal — they
 * are the API contract; prose comes from `openPlatform.docs.scopes.<id>` in the message packs.
 * Paths are stored as segments because the architecture lint forbids site-like route literals.
 */
export interface OpenPlatformParam {
  name: string;
  required: boolean;
}

export interface OpenPlatformEndpoint {
  method: "GET";
  /** Path segments after the `/api/open/v1/moenotes/{region}` prefix; `{name}` marks a path parameter. */
  segments: string[];
  /** Query parameters appended to path form of the same endpoint. */
  query?: string[];
}

export interface OpenPlatformScopeDoc {
  id: string;
  /** Scope a key must carry to call these endpoints. */
  scope: string;
  endpoints: OpenPlatformEndpoint[];
  params: OpenPlatformParam[];
  /** Copy-pasteable request for the most typical call. */
  example: string;
}

/** Filesystem-and-lint-safe prefix segments: the leading slash is added by `openPlatformPath`. */
const ROOT = ["api", "open", "v1", "moenotes", "{region}"];
const PREFIX = "/api/open/v1/moenotes/$REGION";
const BASE = "/api/open/v1/moenotes/$REGION";

/** Absolute, `{region}`-templated path of one endpoint, including its query form. */
export function openPlatformPath(endpoint: OpenPlatformEndpoint): string {
  const path = `/${[...ROOT, ...endpoint.segments].join("/")}`;
  return endpoint.query?.length ? `${path}?${endpoint.query.join("&")}` : path;
}

export const OPEN_PLATFORM_SCOPES: readonly OpenPlatformScopeDoc[] = [
  {
    id: "profiles",
    scope: "moenotes:profiles",
    endpoints: [
      { method: "GET", segments: ["profile", "{profileId}"] },
      { method: "GET", segments: ["profile"], query: ["playerProfileId"] },
      { method: "GET", segments: ["profiles", "{accountIds}"] },
      { method: "GET", segments: ["profiles"], query: ["accountIds"] },
      { method: "GET", segments: ["player", "{playerId}", "favorites"] },
      { method: "GET", segments: ["profile", "favorites"], query: ["playerId"] },
    ],
    params: [
      { name: "profileId", required: true },
      { name: "playerProfileId", required: true },
      { name: "accountIds", required: true },
      { name: "playerId", required: true },
    ],
    example: `curl --fail-with-body "${PREFIX}/profile/$PROFILE_ID" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
  {
    id: "profileImages",
    scope: "moenotes:profile-images",
    endpoints: [{ method: "GET", segments: ["profile", "{profileId}", "card", "{page}"] }],
    params: [
      { name: "profileId", required: true },
      { name: "page", required: true },
    ],
    example: `curl --fail-with-body "${PREFIX}/profile/$PROFILE_ID/card/1" \\\n  -H "Authorization: Bearer $CLIENT_SECRET" \\\n  --output card.png`,
  },
  {
    id: "rankings",
    scope: "moenotes:rankings",
    endpoints: [
      { method: "GET", segments: ["music", "ranking"], query: ["musicId"] },
      { method: "GET", segments: ["music", "{musicId}", "ranking"] },
      { method: "GET", segments: ["event", "ranking"], query: ["eventId", "ranks"] },
      { method: "GET", segments: ["event", "{eventId}", "ranking", "{ranks}"] },
      { method: "GET", segments: ["event", "challenge-ranking"], query: ["challengeMusicId"] },
      { method: "GET", segments: ["event", "challenge", "{challengeMusicId}", "ranking"] },
      { method: "GET", segments: ["arena", "ranking"], query: ["arenaSeasonId", "rankingStart", "rankingEnd", "bandId"] },
      { method: "GET", segments: ["arena", "{arenaSeasonId}", "ranking", "{rankingStart}", "{rankingEnd}"] },
    ],
    params: [
      { name: "musicId", required: true },
      { name: "eventId", required: true },
      { name: "ranks", required: true },
      { name: "challengeMusicId", required: true },
      { name: "arenaSeasonId", required: true },
      { name: "rankingStart", required: true },
      { name: "rankingEnd", required: true },
      { name: "bandId", required: false },
    ],
    example: `curl --fail-with-body "${PREFIX}/event/ranking?eventId=$EVENT_ID&ranks=1&ranks=100" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
  {
    id: "decks",
    scope: "moenotes:decks",
    endpoints: [
      { method: "GET", segments: ["event", "deck"], query: ["playerId", "eventId"] },
      { method: "GET", segments: ["event", "{eventId}", "deck", "{playerId}"] },
      { method: "GET", segments: ["arena", "deck-trend"], query: ["musicId", "arenaSeasonId"] },
      { method: "GET", segments: ["arena", "{arenaSeasonId}", "music", "{musicId}", "deck-trend"] },
    ],
    params: [
      { name: "eventId", required: true },
      { name: "playerId", required: true },
      { name: "arenaSeasonId", required: true },
      { name: "musicId", required: true },
    ],
    example: `curl --fail-with-body "${BASE}/event/$EVENT_ID/deck/$PLAYER_ID" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
  {
    id: "circles",
    scope: "moenotes:circles",
    endpoints: [
      { method: "GET", segments: ["circle"], query: ["circleId"] },
      { method: "GET", segments: ["circle", "{circleId}"] },
      { method: "GET", segments: ["circles", "search"] },
      { method: "GET", segments: ["circles", "search", "{name}"] },
    ],
    params: [
      { name: "circleId", required: true },
      { name: "name", required: true },
      { name: "options.name", required: false },
      { name: "options.memberRange", required: false },
      { name: "options.joinRule", required: false },
      { name: "options.playStyle", required: false },
    ],
    example: `curl --fail-with-body "${PREFIX}/circles/search?options.name=$QUERY" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
  {
    id: "gacha",
    scope: "moenotes:gacha",
    endpoints: [
      { method: "GET", segments: ["gacha", "rates"], query: ["gachaId", "productId", "selectedPickUp"] },
      { method: "GET", segments: ["gacha", "{gachaId}", "rates"], query: ["productId", "selectedPickUp"] },
      { method: "GET", segments: ["gacha", "{gachaId}", "rates", "{selectedPickUp}"] },
    ],
    params: [
      { name: "gachaId", required: true },
      { name: "selectedPickUp", required: true },
      { name: "productId", required: false },
    ],
    example: `curl --fail-with-body "${PREFIX}/gacha/rates?gachaId=$GACHA_ID" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
  {
    id: "announcements",
    scope: "moenotes:announcements",
    endpoints: [
      { method: "GET", segments: ["announcements"] },
      { method: "GET", segments: ["announcements", "{selectedTab}"] },
      { method: "GET", segments: ["announcement"], query: ["id"] },
      { method: "GET", segments: ["announcement", "{id}"] },
    ],
    params: [
      { name: "selectedTab", required: true },
      { name: "id", required: true },
    ],
    example: `curl --fail-with-body "${PREFIX}/announcement/$ANNOUNCEMENT_ID" \\\n  -H "Authorization: Bearer $CLIENT_SECRET"`,
  },
];

/** Archive download: bearer key with `saves:read` plus per-archive authorization. */
export const OPEN_PLATFORM_ARCHIVE = {
  scope: "saves:read",
  path: `/${["api", "open", "v1", "saves", "{saveServer}", "{accountID}"].join("/")}`,
  example: 'curl --fail-with-body "$ORIGIN/api/open/v1/saves/$SAVE_SERVER/$ACCOUNT_ID" \\\n  -H "Authorization: Bearer $CLIENT_SECRET" \\\n  --output save.gz',
} as const;

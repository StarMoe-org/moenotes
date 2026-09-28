import { assetConfig } from "@/config/assets";
import { cacheConfig } from "@/config/cache";
import type { AssetCacheStats } from "@/lib/cache/asset-cache";
import { getNativeFetch, isAssetCacheBypassed } from "@/lib/cache/cached-fetch";
import {
  STORE_PLAYER_FILE_INFO,
  STORE_PLAYER_FILES,
  isIndexedDbCacheAvailable,
  openCacheDb,
  requestToPromise,
  waitForTransaction,
} from "@/lib/cache/indexed-db";

/**
 * The player sites' content-addressed files (`assets/<sha256>.<ext>` of the story site, and of the chart site that
 * publishes the charts and the Live2D models), kept in IndexedDB. A chart or a Live2D model is tens of MB and a story
 * with its models up to a few hundred, more than the browser's HTTP cache keeps for long, and a file of a given name
 * never changes (a song's difficulties share almost all their files): a kept file is served without asking the server
 * again, until the budget evicts the least recently used. The players reach it through the fetch function they are
 * given (createPlayerFileFetch); manifests and every other request pass through to the network and the HTTP cache.
 */

/**
 * What a file is: a Live2D model's (the viewer's or a story's), a story's backgrounds, voices, music and sound effects,
 * or the rest of a story, or a chart's. The manifests say it (see classifyManifestFiles); a file no manifest named is
 * its player's kind. The settings group the kinds into fewer categories (`PLAYER_KIND_CATEGORIES`, usage.ts).
 */
export type PlayerFileKind = "live2d" | "background" | "voice" | "sound" | "story" | "chart";
export const PLAYER_FILE_KINDS: readonly PlayerFileKind[] = ["live2d", "background", "voice", "sound", "story", "chart"];

export interface PlayerFileInfo {
  /** The file's URL without query or hash. */
  key: string;
  kind: PlayerFileKind;
  size: number;
  contentType: string;
  cachedAt: number;
  lastAccessedAt: number;
}

/** Info as the store may hold it: files kept before kinds existed name the tool that loaded them instead. */
type StoredPlayerFileInfo = Omit<PlayerFileInfo, "kind"> & { kind?: PlayerFileKind; source?: string };

interface PlayerFileRecord {
  key: string;
  blob: Blob;
}

type EvictionCandidate = Pick<PlayerFileInfo, "key" | "size" | "lastAccessedAt">;

/** A story file's kind by its path in the story manifest: the first match, else "story". */
const STORY_FILE_KINDS: ReadonlyArray<readonly [RegExp, PlayerFileKind]> = [
  // manifest format /1: the models' files among the story's
  [/^live2d\//, "live2d"],
  // an episode's voices, the characters' system voices, a spot talk's voices
  [/^audio\/(?:adv_voice_|VoiceSystem_|spot_)/, "voice"],
  // music, sound effects and their cue sheets
  [/^audio\//, "sound"],
  // backgrounds and still pictures, and the 3D room of spot talks
  [/^textures\/adv_(?:bkg|still)_/, "background"],
  [/^host\/spot\//, "background"],
];
/** The kind of a file kept before kinds existed, by the tool that loaded it. */
const LEGACY_KINDS: Readonly<Record<string, PlayerFileKind>> = { story: "story", live2d: "live2d", chart: "chart" };

const CONTENT_ADDRESSED_NAME = /^[0-9a-f]{64}(?:\.[a-z0-9]+)+$/;
const PRUNE_DELAY_MS = 5_000;
const TOUCH_DELAY_MS = 2_000;

/** The kinds the manifests fetched so far give their files, by file key. */
const manifestKinds = new Map<string, PlayerFileKind>();
/** Files read since the last flush, with the kind to correct theirs to (null: only their last use). */
const pendingTouches = new Map<string, PlayerFileKind | null>();
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
let pruning: Promise<void> | null = null;

/**
 * A fetch function for a player (the `fetch` option of ournotes-player): GET requests of the sites' content-addressed
 * files are answered from the cache, and fetched once and kept when missing; anything else goes to the network as is.
 * The manifests it fetches tell the kinds of the files they list; `fallback` is the kind of a file none of them named.
 */
export function createPlayerFileFetch(fallback: PlayerFileKind): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const network = getNativeFetch();
    const key = getCacheablePlayerFileKey(input, init);
    if (!key) return learnFromManifest(requestUrl(input), await network(input, init));

    const learned = manifestKinds.get(key);
    const cached = await readPlayerFile(key, learned);
    if (cached) return cached;

    const response = await network(input, init);
    if (response.status !== 200 || response.type === "opaque") return response;
    const blob = await response.blob();
    const contentType = normalizeContentType(response.headers.get("content-type") ?? blob.type);
    // An error page some proxy answered with 200 is not the file.
    if (contentType === "text/html") return fileResponse(blob, contentType, "miss");
    const now = Date.now();
    void writePlayerFile({ key, kind: learned ?? fallback, size: blob.size, contentType, cachedAt: now, lastAccessedAt: now }, blob);
    return fileResponse(blob, contentType, "miss");
  }) as typeof globalThis.fetch;
}

/** The cache key of `url` (its URL without query or hash) when it is a content-addressed file of a player site. */
export function getPlayerFileKey(url: string, base = pageBase()): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url, base);
  } catch {
    return null;
  }
  if (parsed.search) return null;
  const href = `${parsed.origin}${parsed.pathname}`;
  const root = siteAssetRoots(base).find((prefix) => href.startsWith(prefix));
  return root && CONTENT_ADDRESSED_NAME.test(href.slice(root.length)) ? href : null;
}

/**
 * The kind of every file a player site's manifest lists, by file key: a model manifest's (`models/<id>.json`) are
 * "live2d", a story manifest's go by their paths (storyFileKind, every language's files included). None for a chart's
 * or any other JSON, whose files keep their player's kind.
 */
export function classifyManifestFiles(manifestUrl: string, manifest: unknown, base = pageBase()): Map<string, PlayerFileKind> {
  const kinds = new Map<string, PlayerFileKind>();
  if (!isRecord(manifest) || !isRecord(manifest.files)) return kinds;
  let url: URL;
  try {
    url = new URL(manifestUrl, base);
  } catch {
    return kinds;
  }
  const story = typeof manifest.format === "string" && manifest.format.startsWith("ournotes.story-manifest/");
  if (!story && !/\/models\/[^/]+\.json$/.test(url.pathname)) return kinds;

  // Asset paths are relative to the site root: a story manifest names it, a model manifest sits one level below it.
  let root: URL;
  try {
    root = new URL(story && typeof manifest.root === "string" ? manifest.root : "../", url);
  } catch {
    return kinds;
  }
  const lists: Record<string, unknown>[] = [manifest.files];
  if (story && isRecord(manifest.languages)) {
    for (const language of Object.values(manifest.languages)) {
      if (isRecord(language) && isRecord(language.files)) lists.push(language.files);
    }
  }
  for (const files of lists) {
    for (const [path, file] of Object.entries(files)) {
      const kind = story ? storyFileKind(path) : "live2d";
      for (const asset of listedAssets(file)) {
        let key: string | null;
        try {
          key = getPlayerFileKey(new URL(asset, root).href, base);
        } catch {
          key = null;
        }
        if (key) kinds.set(key, kind);
      }
    }
  }
  return kinds;
}

/** A story file's kind by its path in the story manifest. */
export function storyFileKind(path: string): PlayerFileKind {
  return STORY_FILE_KINDS.find(([pattern]) => pattern.test(path))?.[1] ?? "story";
}

/** Cached bytes and file count by kind. */
export async function getPlayerFileUsage(): Promise<Record<PlayerFileKind, AssetCacheStats>> {
  const usage = Object.fromEntries(PLAYER_FILE_KINDS.map((kind) => [kind, { entries: 0, bytes: 0 }])) as Record<PlayerFileKind, AssetCacheStats>;
  for (const info of await readAllPlayerFileInfo()) {
    const bucket = usage[info.kind];
    if (!bucket) continue;
    bucket.entries += 1;
    bucket.bytes += info.size;
  }
  return usage;
}

/** The store's budget: `cacheConfig.playerFiles.maxBytes`, less when the browser grants the site a small quota. */
export async function getPlayerFileBudget(): Promise<number> {
  const { maxBytes, quotaShare } = cacheConfig.playerFiles;
  try {
    const quota = typeof navigator !== "undefined" && navigator.storage ? (await navigator.storage.estimate()).quota : undefined;
    if (quota && quota > 0) return Math.min(maxBytes, Math.floor(quota * quotaShare));
  } catch {
    // Without an estimate the configured budget applies.
  }
  return maxBytes;
}

/** Removes the files of the given kinds, or every player file. */
export async function clearPlayerFiles(kinds?: readonly PlayerFileKind[]): Promise<void> {
  if (!isIndexedDbCacheAvailable()) return;
  try {
    if (kinds) {
      await deletePlayerFiles((await readAllPlayerFileInfo()).filter((info) => kinds.includes(info.kind)).map((info) => info.key));
      return;
    }
    const db = await openCacheDb();
    const transaction = db.transaction([STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO], "readwrite");
    transaction.objectStore(STORE_PLAYER_FILES).clear();
    transaction.objectStore(STORE_PLAYER_FILE_INFO).clear();
    await waitForTransaction(transaction);
  } catch {
    // The usage the settings show afterwards tells whether it went through.
  }
}

/** Evicts the least recently used files once the store is over `budget`. */
export function prunePlayerFiles(budget?: number): Promise<void> {
  pruning ??= (async () => {
    try {
      const files = await readAllPlayerFileInfo();
      const keys = selectPlayerFilesToEvict(files, budget ?? await getPlayerFileBudget());
      if (keys.length > 0) await deletePlayerFiles(keys);
    } catch {
      // Eviction is best-effort; the next write tries again.
    } finally {
      pruning = null;
    }
  })();
  return pruning;
}

/**
 * The files to evict, least recently used first, when `files` exceed `budget`: down to `target` of it, so that the
 * next few downloads do not start another eviction. None while the store is within budget.
 */
export function selectPlayerFilesToEvict(
  files: readonly EvictionCandidate[],
  budget: number,
  target: number = cacheConfig.playerFiles.pruneTarget,
): string[] {
  let total = files.reduce((sum, file) => sum + file.size, 0);
  if (total <= budget) return [];
  const floor = budget * target;
  const evicted: string[] = [];
  for (const file of [...files].sort((a, b) => a.lastAccessedAt - b.lastAccessedAt)) {
    if (total <= floor) break;
    evicted.push(file.key);
    total -= file.size;
  }
  return evicted;
}

function getCacheablePlayerFileKey(input: RequestInfo | URL, init?: RequestInit): string | null {
  if (!isIndexedDbCacheAvailable() || isAssetCacheBypassed()) return null;
  const request = input instanceof Request ? input : null;
  if ((init?.method ?? request?.method ?? "GET").toUpperCase() !== "GET") return null;
  const mode = init?.cache ?? request?.cache;
  if (mode === "no-store" || mode === "reload") return null;
  if (new Headers(init?.headers ?? request?.headers).has("range")) return null;
  return getPlayerFileKey(requestUrl(input));
}

/**
 * Reads the kinds of the files a player site's manifest lists (a story's or a model's) from `response`, before the
 * player asks for them, and hands it on. Any other response is handed on unread.
 */
async function learnFromManifest(url: string, response: Response): Promise<Response> {
  if (!response.ok || response.type === "opaque" || !isPlayerSiteManifestUrl(url)) return response;
  let text: string;
  try {
    text = await response.text();
  } catch {
    return response;
  }
  try {
    for (const [key, kind] of classifyManifestFiles(url, JSON.parse(text))) manifestKinds.set(key, kind);
  } catch {
    // Not JSON: the player reports what it cannot read.
  }
  return new Response(text, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function isPlayerSiteManifestUrl(url: string): boolean {
  try {
    const parsed = new URL(url, pageBase());
    const href = `${parsed.origin}${parsed.pathname}`;
    return parsed.pathname.endsWith(".json") && siteRoots(pageBase()).some((root) => href.startsWith(root));
  } catch {
    return false;
  }
}

/** A kept file, or null. `kind` is what a manifest says the file is: a kept file of another kind is corrected. */
async function readPlayerFile(key: string, kind: PlayerFileKind | undefined): Promise<Response | null> {
  try {
    const db = await openCacheDb();
    const transaction = db.transaction([STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO], "readonly");
    const [record, stored] = await Promise.all([
      requestToPromise<PlayerFileRecord | undefined>(transaction.objectStore(STORE_PLAYER_FILES).get(key)),
      requestToPromise<StoredPlayerFileInfo | undefined>(transaction.objectStore(STORE_PLAYER_FILE_INFO).get(key)),
    ]);
    if (!record || !stored) return null;
    const info = normalizeInfo(stored);
    // Read here, so that a body the browser can no longer read goes back to the network rather than into the player.
    const body = await record.blob.arrayBuffer();
    if (body.byteLength !== info.size) return null;
    const reclassify = kind !== undefined && (kind !== info.kind || stored.kind === undefined);
    if (reclassify || Date.now() - info.lastAccessedAt >= cacheConfig.playerFiles.touchIntervalMs) queueTouch(key, reclassify ? kind : null);
    return fileResponse(body, info.contentType, "hit");
  } catch {
    return null;
  }
}

async function writePlayerFile(info: PlayerFileInfo, blob: Blob): Promise<void> {
  try {
    const db = await openCacheDb();
    const transaction = db.transaction([STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO], "readwrite");
    transaction.objectStore(STORE_PLAYER_FILES).put({ key: info.key, blob } satisfies PlayerFileRecord);
    transaction.objectStore(STORE_PLAYER_FILE_INFO).put(info);
    await waitForTransaction(transaction);
    schedulePrune();
  } catch (error) {
    // The site's quota ran out before the budget did (other data of the site, a small grant): make room for later files.
    if (error instanceof DOMException && error.name === "QuotaExceededError") {
      const total = (await readAllPlayerFileInfo()).reduce((sum, file) => sum + file.size, 0);
      void prunePlayerFiles(Math.floor(total * 0.75));
    }
  }
}

async function deletePlayerFiles(keys: readonly string[]): Promise<void> {
  if (keys.length === 0) return;
  const db = await openCacheDb();
  const transaction = db.transaction([STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO], "readwrite");
  const files = transaction.objectStore(STORE_PLAYER_FILES);
  const infos = transaction.objectStore(STORE_PLAYER_FILE_INFO);
  for (const key of keys) {
    files.delete(key);
    infos.delete(key);
  }
  await waitForTransaction(transaction);
}

async function readAllPlayerFileInfo(): Promise<PlayerFileInfo[]> {
  if (!isIndexedDbCacheAvailable()) return [];
  try {
    const db = await openCacheDb();
    const stored = await requestToPromise<StoredPlayerFileInfo[]>(db.transaction(STORE_PLAYER_FILE_INFO, "readonly").objectStore(STORE_PLAYER_FILE_INFO).getAll());
    return stored.map(normalizeInfo);
  } catch {
    return [];
  }
}

function normalizeInfo(stored: StoredPlayerFileInfo): PlayerFileInfo {
  const { source, kind, ...info } = stored;
  return { ...info, kind: kind ?? LEGACY_KINDS[source ?? ""] ?? "story" };
}

function schedulePrune(): void {
  // After the last write of a load, so that a story's hundreds of files start one eviction.
  if (pruneTimer) clearTimeout(pruneTimer);
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    void prunePlayerFiles();
  }, PRUNE_DELAY_MS);
}

function queueTouch(key: string, kind: PlayerFileKind | null): void {
  pendingTouches.set(key, kind ?? pendingTouches.get(key) ?? null);
  touchTimer ??= setTimeout(() => {
    touchTimer = null;
    void flushTouches();
  }, TOUCH_DELAY_MS);
}

/** Writes the last use (and a corrected kind) of the files read since the previous flush, in one transaction. */
async function flushTouches(): Promise<void> {
  const touches = [...pendingTouches];
  pendingTouches.clear();
  if (touches.length === 0) return;
  const now = Date.now();
  try {
    const db = await openCacheDb();
    const transaction = db.transaction(STORE_PLAYER_FILE_INFO, "readwrite");
    const store = transaction.objectStore(STORE_PLAYER_FILE_INFO);
    for (const [key, kind] of touches) {
      const request = store.get(key);
      request.onsuccess = () => {
        const stored = request.result as StoredPlayerFileInfo | undefined;
        if (!stored) return;
        const info = normalizeInfo(stored);
        store.put({ ...info, kind: kind ?? info.kind, lastAccessedAt: now } satisfies PlayerFileInfo);
      };
    }
    await waitForTransaction(transaction);
  } catch {
    // Access times only order the eviction; a kind left uncorrected is corrected at the next read.
  }
}

function fileResponse(body: Blob | ArrayBuffer, contentType: string, cacheState: "hit" | "miss"): Response {
  const size = body instanceof Blob ? body.size : body.byteLength;
  return new Response(body, {
    status: 200,
    headers: {
      "content-type": contentType || "application/octet-stream",
      "content-length": String(size),
      "x-moenotes-cache": cacheState,
    },
  });
}

/** The site roots (`<site>/`) of the story site and the chart site. */
function siteRoots(base: string | undefined): string[] {
  const roots: string[] = [];
  for (const site of [assetConfig.storySite, assetConfig.chartSite]) {
    try {
      roots.push(new URL(`${site}/`, base).href);
    } catch {
      // A site root that is not a URL has no files to keep.
    }
  }
  return roots;
}

function siteAssetRoots(base: string | undefined): string[] {
  return siteRoots(base).map((root) => `${root}assets/`);
}

/** The assets a manifest's file entry lists: `{asset}`, or `{parts: [[key, asset, …], …]}` for a split JSON file. */
function listedAssets(file: unknown): string[] {
  if (!isRecord(file)) return [];
  if (typeof file.asset === "string") return [file.asset];
  if (!Array.isArray(file.parts)) return [];
  return file.parts.flatMap((part: unknown) => (Array.isArray(part) && typeof part[1] === "string" ? [part[1]] : []));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requestUrl(input: RequestInfo | URL): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

function pageBase(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.href;
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

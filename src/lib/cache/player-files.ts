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

/** The tool that loaded a file, for the usage the settings show. */
export type PlayerFileSource = "story" | "live2d" | "chart";
export const PLAYER_FILE_SOURCES: readonly PlayerFileSource[] = ["story", "live2d", "chart"];

export interface PlayerFileInfo {
  /** The file's URL without query or hash. */
  key: string;
  source: PlayerFileSource;
  size: number;
  contentType: string;
  cachedAt: number;
  lastAccessedAt: number;
}

interface PlayerFileRecord {
  key: string;
  blob: Blob;
}

type EvictionCandidate = Pick<PlayerFileInfo, "key" | "size" | "lastAccessedAt">;

const CONTENT_ADDRESSED_NAME = /^[0-9a-f]{64}(?:\.[a-z0-9]+)+$/;
const PRUNE_DELAY_MS = 5_000;
const TOUCH_DELAY_MS = 2_000;

const pendingTouches = new Set<string>();
let touchTimer: ReturnType<typeof setTimeout> | null = null;
let pruneTimer: ReturnType<typeof setTimeout> | null = null;
let pruning: Promise<void> | null = null;

/**
 * A fetch function for a player (the `fetch` option of ournotes-player): GET requests of the sites' content-addressed
 * files are answered from the cache, and fetched once and kept when missing; anything else goes to the network as is.
 */
export function createPlayerFileFetch(source: PlayerFileSource): typeof globalThis.fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const network = getNativeFetch();
    const key = getCacheablePlayerFileKey(input, init);
    if (!key) return network(input, init);

    const cached = await readPlayerFile(key);
    if (cached) return cached;

    const response = await network(input, init);
    if (response.status !== 200 || response.type === "opaque") return response;
    const blob = await response.blob();
    const contentType = normalizeContentType(response.headers.get("content-type") ?? blob.type);
    // An error page some proxy answered with 200 is not the file.
    if (contentType === "text/html") return fileResponse(blob, contentType, "miss");
    const now = Date.now();
    void writePlayerFile({ key, source, size: blob.size, contentType, cachedAt: now, lastAccessedAt: now }, blob);
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

/** Cached bytes and file count by the tool that loaded them. */
export async function getPlayerFileUsage(): Promise<Record<PlayerFileSource, AssetCacheStats>> {
  const usage = Object.fromEntries(PLAYER_FILE_SOURCES.map((source) => [source, { entries: 0, bytes: 0 }])) as Record<PlayerFileSource, AssetCacheStats>;
  for (const info of await readAllPlayerFileInfo()) {
    const bucket = usage[info.source];
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

/** Removes the files one tool loaded, or every player file. */
export async function clearPlayerFiles(source?: PlayerFileSource): Promise<void> {
  if (!isIndexedDbCacheAvailable()) return;
  try {
    if (source) {
      await deletePlayerFiles((await readAllPlayerFileInfo()).filter((info) => info.source === source).map((info) => info.key));
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
  return getPlayerFileKey(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
}

async function readPlayerFile(key: string): Promise<Response | null> {
  try {
    const db = await openCacheDb();
    const transaction = db.transaction([STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO], "readonly");
    const [record, info] = await Promise.all([
      requestToPromise<PlayerFileRecord | undefined>(transaction.objectStore(STORE_PLAYER_FILES).get(key)),
      requestToPromise<PlayerFileInfo | undefined>(transaction.objectStore(STORE_PLAYER_FILE_INFO).get(key)),
    ]);
    if (!record || !info) return null;
    // Read here, so that a body the browser can no longer read goes back to the network rather than into the player.
    const body = await record.blob.arrayBuffer();
    if (body.byteLength !== info.size) return null;
    if (Date.now() - info.lastAccessedAt >= cacheConfig.playerFiles.touchIntervalMs) queueTouch(key);
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
    return await requestToPromise<PlayerFileInfo[]>(db.transaction(STORE_PLAYER_FILE_INFO, "readonly").objectStore(STORE_PLAYER_FILE_INFO).getAll());
  } catch {
    return [];
  }
}

function schedulePrune(): void {
  // After the last write of a load, so that a story's hundreds of files start one eviction.
  if (pruneTimer) clearTimeout(pruneTimer);
  pruneTimer = setTimeout(() => {
    pruneTimer = null;
    void prunePlayerFiles();
  }, PRUNE_DELAY_MS);
}

function queueTouch(key: string): void {
  pendingTouches.add(key);
  touchTimer ??= setTimeout(() => {
    touchTimer = null;
    void flushTouches();
  }, TOUCH_DELAY_MS);
}

/** Writes the last use of the files read since the previous flush, in one transaction. */
async function flushTouches(): Promise<void> {
  const keys = [...pendingTouches];
  pendingTouches.clear();
  if (keys.length === 0) return;
  const now = Date.now();
  try {
    const db = await openCacheDb();
    const transaction = db.transaction(STORE_PLAYER_FILE_INFO, "readwrite");
    const store = transaction.objectStore(STORE_PLAYER_FILE_INFO);
    for (const key of keys) {
      const request = store.get(key);
      request.onsuccess = () => {
        const info = request.result as PlayerFileInfo | undefined;
        if (info) store.put({ ...info, lastAccessedAt: now } satisfies PlayerFileInfo);
      };
    }
    await waitForTransaction(transaction);
  } catch {
    // Access times only order the eviction.
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

function siteAssetRoots(base: string | undefined): string[] {
  const roots: string[] = [];
  for (const site of [assetConfig.storySite, assetConfig.chartSite]) {
    try {
      roots.push(new URL(`${site}/assets/`, base).href);
    } catch {
      // A site root that is not a URL has no files to keep.
    }
  }
  return roots;
}

function pageBase(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.href;
}

function normalizeContentType(contentType: string): string {
  return contentType.split(";", 1)[0]?.trim().toLowerCase() ?? "";
}

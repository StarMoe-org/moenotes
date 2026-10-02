import { assetConfig } from "@/config/assets";
import { cacheConfig } from "@/config/cache";
import { deleteAssetCache, getAssetCache, setAssetCache, type AssetCacheEntry } from "@/lib/cache/asset-cache";
import { getNativeFetch, isAssetCacheBypassed } from "@/lib/cache/cached-fetch";
import type { MusicData } from "./types";

/** The major version of music-data.json this tool reads; a file of another major version is rejected. */
export const MUSIC_DATA_FORMAT = "nnnotes.music-data/1";

export class MusicDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MusicDataError";
  }
}

/** Mutable, self-contained snapshots have a short lifetime, independent of release-asset cache policy. */
export const MUSIC_DATA_CACHE_TTL_MS = 5 * 60 * 1000;

interface MusicDataCacheDependencies {
  fetch: (url: string, init: RequestInit) => Promise<Response>;
  get: (key: string) => Promise<AssetCacheEntry | null>;
  set: (entry: AssetCacheEntry) => Promise<void>;
  delete: (key: string) => Promise<void>;
  now: () => number;
  bypass: () => boolean;
}

function validateMusicData(data: unknown): MusicData {
  if (!data || typeof data !== "object" || !("songs" in data) || !Array.isArray(data.songs)) throw new MusicDataError("music-data.json: no songs");
  if ("format" in data && typeof data.format === "string" && data.format !== MUSIC_DATA_FORMAT) throw new MusicDataError(`music-data.json: format ${data.format}`);
  return data as MusicData;
}

/** A caller can leave a shared load without cancelling the other readers or losing its eventual cache entry. */
function forCaller<T>(task: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return task;
  const reason = () => signal.reason ?? new DOMException("The operation was aborted.", "AbortError");
  if (signal.aborted) return Promise.reject(reason());
  return new Promise((resolve, reject) => {
    const abort = () => { signal.removeEventListener("abort", abort); reject(reason()); };
    signal.addEventListener("abort", abort, { once: true });
    task.then(value => {
      signal.removeEventListener("abort", abort);
      if (signal.aborted) reject(reason());
      else resolve(value);
    }, error => { signal.removeEventListener("abort", abort); reject(error); });
  });
}

/** Parsed snapshots are local to one page; separate pages share only the persisted body. */
export function createMusicDataLoader(overrides: Partial<MusicDataCacheDependencies> = {}) {
  const dependencies: MusicDataCacheDependencies = {
    fetch: (url, init) => getNativeFetch()(url, init),
    get: getAssetCache, set: setAssetCache, delete: deleteAssetCache,
    now: Date.now, bypass: isAssetCacheBypassed, ...overrides,
  };
  const parsed = new Map<string, { data: MusicData; expiresAt: number }>();
  const inFlight = new Map<string, Promise<MusicData>>();
  const remember = (url: string, data: MusicData, expiresAt: number) => {
    parsed.delete(url);
    parsed.set(url, { data, expiresAt });
    // A deployment normally has one source. Bound retained large objects if a caller switches sources.
    while (parsed.size > 2) parsed.delete(parsed.keys().next().value!);
  };
  const network = async (url: string, key: string, cache: boolean): Promise<MusicData> => {
    // Do not give a shared fetch one reader's signal. Bypass also avoids the global release-asset wrapper.
    const response = await dependencies.fetch(url, { credentials: "omit", headers: { Accept: "application/json" } });
    if (!response.ok) throw new MusicDataError(`music-data.json: HTTP ${response.status}`);
    const blob = await response.blob();
    const data = validateMusicData(JSON.parse(await blob.text()));
    if (cache && !dependencies.bypass()) {
      const now = dependencies.now(), expiresAt = now + MUSIC_DATA_CACHE_TTL_MS;
      remember(url, data, expiresAt);
      if (blob.size <= cacheConfig.assets.maxResponseBytes) {
        // Save the downloaded body without stringify or waiting for IndexedDB before displaying the page.
        void Promise.resolve().then(() => dependencies.set({ key, url, blob, contentType: "application/json", size: blob.size,
          status: response.status, statusText: response.statusText, headers: { "content-type": "application/json", "content-length": String(blob.size) },
          cachedAt: now, lastAccessedAt: now, expiresAt, staleUntil: expiresAt })).catch(() => undefined);
      }
    }
    return data;
  };
  const load = async (url: string, key: string): Promise<MusicData> => {
    let cached: AssetCacheEntry | null = null;
    try { cached = await dependencies.get(key); } catch { /* Unavailable/private storage falls back to the network. */ }
    if (dependencies.bypass()) return network(url, key, false);
    if (cached) {
      const now = dependencies.now(), expiresAt = Math.min(cached.expiresAt, cached.cachedAt + MUSIC_DATA_CACHE_TTL_MS);
      if (cached.key === key && cached.url === url && cached.status >= 200 && cached.status < 300 && cached.cachedAt <= now && expiresAt > now) {
        try {
          const data = validateMusicData(JSON.parse(await cached.blob.text()));
          if (dependencies.bypass()) return network(url, key, false);
          if (expiresAt > dependencies.now()) { remember(url, data, expiresAt); return data; }
        } catch { /* A corrupt or incompatible snapshot must never prevent a fresh retry. */ }
      }
      if (dependencies.bypass()) return network(url, key, false);
      try { await dependencies.delete(key); } catch { /* Best-effort cleanup; a good response can replace it. */ }
    }
    return network(url, key, true);
  };
  return (source: string, signal?: AbortSignal): Promise<MusicData> => {
    if (signal?.aborted) return Promise.reject(signal.reason ?? new DOMException("The operation was aborted.", "AbortError"));
    const address = new URL(source, typeof window === "undefined" ? undefined : window.location.href);
    address.hash = "";
    const url = address.href, key = `chart-data:${MUSIC_DATA_FORMAT}:${url}`;
    if (dependencies.bypass()) return forCaller(network(url, key, false), signal);
    const memory = parsed.get(url);
    if (memory && memory.expiresAt > dependencies.now()) return forCaller(Promise.resolve(memory.data), signal);
    parsed.delete(url);
    let task = inFlight.get(url);
    if (!task) {
      const pending = load(url, key).finally(() => { if (inFlight.get(url) === pending) inFlight.delete(url); });
      inFlight.set(url, pending);
      task = pending;
    }
    return forCaller(task, signal);
  };
}

const loadMusicData = createMusicDataLoader();

/** Read one validated snapshot; fresh page loads share its persisted body for five minutes. */
export async function fetchMusicData(signal?: AbortSignal): Promise<MusicData> {
  return loadMusicData(`${assetConfig.musicDataSite}/music-data.json`, signal);
}

/** Transport only. The replay bridge verifies the exact manifest SHA, size and snapshot identity. */
export async function fetchMusicReplayResource(url: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  const response = await fetch(url, { credentials: "omit", signal: signal ?? null });
  if (!response.ok) throw new MusicDataError(`Replay resource: HTTP ${response.status}`);
  return response.arrayBuffer();
}

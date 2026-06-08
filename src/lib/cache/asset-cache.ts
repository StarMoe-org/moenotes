import { cacheConfig } from "@/config/cache";
import { STORE_ASSETS, isIndexedDbCacheAvailable, openCacheDb, requestToPromise, waitForTransaction } from "@/lib/cache/indexed-db";

export interface AssetCacheEntry {
  key: string;
  url: string;
  blob: Blob;
  contentType: string;
  size: number;
  status: number;
  statusText: string;
  headers: Record<string, string>;
  cachedAt: number;
  lastAccessedAt: number;
  expiresAt: number;
  staleUntil: number;
}

export interface AssetCacheStats {
  entries: number;
  bytes: number;
}

export interface GetAssetCacheOptions {
  allowStale?: boolean;
  updateAccessTime?: boolean;
  now?: number;
}

export function isAssetCacheAvailable(): boolean {
  return isIndexedDbCacheAvailable();
}

export async function getAssetCache(key: string, options: GetAssetCacheOptions = {}): Promise<AssetCacheEntry | null> {
  if (!isAssetCacheAvailable()) return null;

  const now = options.now ?? Date.now();

  try {
    const db = await openCacheDb();
    const entry = await requestToPromise<AssetCacheEntry | undefined>(db.transaction(STORE_ASSETS, "readonly").objectStore(STORE_ASSETS).get(key));
    if (!entry) return null;

    const isFresh = entry.expiresAt > now;
    const isUsableStale = options.allowStale === true && entry.staleUntil > now;

    if (!isFresh && !isUsableStale) {
      if (entry.staleUntil <= now) void deleteAssetCache(key);
      return null;
    }

    if (options.updateAccessTime !== false) {
      void touchAssetCache(key, now);
      return { ...entry, lastAccessedAt: now };
    }

    return entry;
  } catch {
    return null;
  }
}

export async function setAssetCache(entry: AssetCacheEntry): Promise<void> {
  if (!isAssetCacheAvailable()) return;

  try {
    const db = await openCacheDb();
    const transaction = db.transaction(STORE_ASSETS, "readwrite");
    transaction.objectStore(STORE_ASSETS).put(entry);
    await waitForTransaction(transaction);
    void pruneAssetCache();
  } catch {
    // Cache writes are best-effort.
  }
}

export async function deleteAssetCache(key: string): Promise<void> {
  if (!isAssetCacheAvailable()) return;

  try {
    const db = await openCacheDb();
    await requestToPromise(db.transaction(STORE_ASSETS, "readwrite").objectStore(STORE_ASSETS).delete(key));
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function clearAssetCache(): Promise<void> {
  if (!isAssetCacheAvailable()) return;

  try {
    const db = await openCacheDb();
    await requestToPromise(db.transaction(STORE_ASSETS, "readwrite").objectStore(STORE_ASSETS).clear());
  } catch {
    // Ignore cache cleanup failures.
  }
}

export async function getAssetCacheStats(): Promise<AssetCacheStats> {
  if (!isAssetCacheAvailable()) return { entries: 0, bytes: 0 };

  try {
    const entries = await getAllAssetEntries();
    return {
      entries: entries.length,
      bytes: entries.reduce((total, entry) => total + entry.size, 0),
    };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

export async function pruneAssetCache(now = Date.now()): Promise<void> {
  if (!isAssetCacheAvailable()) return;

  try {
    const entries = await getAllAssetEntries();
    const keysToDelete = new Set<string>();
    const retained: AssetCacheEntry[] = [];

    for (const entry of entries) {
      if (entry.staleUntil <= now) {
        keysToDelete.add(entry.key);
      } else {
        retained.push(entry);
      }
    }

    retained.sort((a, b) => a.lastAccessedAt - b.lastAccessedAt);
    let retainedBytes = retained.reduce((total, entry) => total + entry.size, 0);

    while (retained.length > cacheConfig.assets.maxEntries || retainedBytes > cacheConfig.assets.maxBytes) {
      const oldest = retained.shift();
      if (!oldest) break;
      retainedBytes -= oldest.size;
      keysToDelete.add(oldest.key);
    }

    if (keysToDelete.size === 0) return;

    const db = await openCacheDb();
    const transaction = db.transaction(STORE_ASSETS, "readwrite");
    const store = transaction.objectStore(STORE_ASSETS);
    for (const key of keysToDelete) store.delete(key);
    await waitForTransaction(transaction);
  } catch {
    // Ignore pruning failures.
  }
}

async function touchAssetCache(key: string, lastAccessedAt: number): Promise<void> {
  try {
    const db = await openCacheDb();
    const entry = await requestToPromise<AssetCacheEntry | undefined>(db.transaction(STORE_ASSETS, "readonly").objectStore(STORE_ASSETS).get(key));
    if (!entry) return;

    const transaction = db.transaction(STORE_ASSETS, "readwrite");
    transaction.objectStore(STORE_ASSETS).put({ ...entry, lastAccessedAt });
    await waitForTransaction(transaction);
  } catch {
    // Ignore best-effort access time updates.
  }
}

async function getAllAssetEntries(): Promise<AssetCacheEntry[]> {
  const db = await openCacheDb();
  return requestToPromise<AssetCacheEntry[]>(db.transaction(STORE_ASSETS, "readonly").objectStore(STORE_ASSETS).getAll());
}

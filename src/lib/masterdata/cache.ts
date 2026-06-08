import { STORE_MASTERDATA, isIndexedDbCacheAvailable, openCacheDb, requestToPromise } from "@/lib/cache/indexed-db";

interface CacheEntry<T> {
  key: string;
  version: string;
  data: T;
  cachedAt: number;
}

export function isMasterdataCacheAvailable(): boolean {
  return isIndexedDbCacheAvailable();
}

export async function getMasterdataCache<T>(key: string, version: string): Promise<T | null> {
  if (!isMasterdataCacheAvailable()) return null;
  try {
    const db = await openCacheDb();
    const request = db.transaction(STORE_MASTERDATA, "readonly").objectStore(STORE_MASTERDATA).get(key);
    const entry = await requestToPromise<CacheEntry<T> | undefined>(request);
    return entry?.version === version ? entry.data : null;
  } catch {
    return null;
  }
}

export async function setMasterdataCache<T>(key: string, version: string, data: T): Promise<void> {
  if (!isMasterdataCacheAvailable()) return;
  try {
    const db = await openCacheDb();
    await requestToPromise(
      db.transaction(STORE_MASTERDATA, "readwrite").objectStore(STORE_MASTERDATA).put({ key, version, data, cachedAt: Date.now() }),
    );
  } catch {
    // ignore cache failures
  }
}

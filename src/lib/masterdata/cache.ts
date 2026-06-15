import { STORE_MASTERDATA, isIndexedDbCacheAvailable, openCacheDb, requestToPromise } from "@/lib/cache/indexed-db";

export interface MasterdataCacheEntry<T> {
  key: string;
  version: string;
  data: T;
  cachedAt: number;
}

export function isMasterdataCacheAvailable(): boolean {
  return isIndexedDbCacheAvailable();
}

export async function getMasterdataCacheEntry<T>(key: string, version?: string): Promise<MasterdataCacheEntry<T> | null> {
  if (!isMasterdataCacheAvailable()) return null;
  try {
    const db = await openCacheDb();
    const request = db.transaction(STORE_MASTERDATA, "readonly").objectStore(STORE_MASTERDATA).get(key);
    const entry = await requestToPromise<MasterdataCacheEntry<T> | undefined>(request);
    if (!entry) return null;
    if (version && entry.version !== version) return null;
    return entry;
  } catch {
    return null;
  }
}

export async function getMasterdataCache<T>(key: string, version: string): Promise<T | null> {
  const entry = await getMasterdataCacheEntry<T>(key, version);
  return entry ? entry.data : null;
}

export async function getStaleMasterdataCache<T>(key: string): Promise<MasterdataCacheEntry<T> | null> {
  return getMasterdataCacheEntry<T>(key);
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

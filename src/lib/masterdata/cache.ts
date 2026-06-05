const DB_NAME = "moenotes-cache";
const DB_VERSION = 1;
const STORE_MASTERDATA = "masterdata";

interface CacheEntry<T> {
  key: string;
  version: string;
  data: T;
  cachedAt: number;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_MASTERDATA)) db.createObjectStore(STORE_MASTERDATA, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

export function isMasterdataCacheAvailable(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

export async function getMasterdataCache<T>(key: string, version: string): Promise<T | null> {
  if (!isMasterdataCacheAvailable()) return null;
  try {
    const db = await openDb();
    return await new Promise<T | null>((resolve, reject) => {
      const request = db.transaction(STORE_MASTERDATA, "readonly").objectStore(STORE_MASTERDATA).get(key);
      request.onsuccess = () => {
        const entry = request.result as CacheEntry<T> | undefined;
        resolve(entry?.version === version ? entry.data : null);
      };
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

export async function setMasterdataCache<T>(key: string, version: string, data: T): Promise<void> {
  if (!isMasterdataCacheAvailable()) return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_MASTERDATA, "readwrite").objectStore(STORE_MASTERDATA).put({ key, version, data, cachedAt: Date.now() });
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } catch {
    // ignore cache failures
  }
}

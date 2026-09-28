export const CACHE_DB_NAME = "moenotes-cache";
export const CACHE_DB_VERSION = 3;
export const STORE_MASTERDATA = "masterdata";
export const STORE_ASSETS = "assets";
/** Player site files: `{ key, blob }` by URL, apart from their info so usage and eviction never read the bodies. */
export const STORE_PLAYER_FILES = "player-files";
/** Player site file info: `{ key, source, size, contentType, cachedAt, lastAccessedAt }` by URL. */
export const STORE_PLAYER_FILE_INFO = "player-file-info";

export type CacheObjectStoreName = typeof STORE_MASTERDATA | typeof STORE_ASSETS | typeof STORE_PLAYER_FILES | typeof STORE_PLAYER_FILE_INFO;
export const CACHE_OBJECT_STORES: readonly CacheObjectStoreName[] = [STORE_MASTERDATA, STORE_ASSETS, STORE_PLAYER_FILES, STORE_PLAYER_FILE_INFO];

let dbPromise: Promise<IDBDatabase> | null = null;

export function isIndexedDbCacheAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.indexedDB !== "undefined";
}

export function openCacheDb(): Promise<IDBDatabase> {
  if (!isIndexedDbCacheAvailable()) return Promise.reject(new Error("IndexedDB is not available."));
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = window.indexedDB.open(CACHE_DB_NAME, CACHE_DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      ensureObjectStores(db);
    };

    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      resolve(db);
    };

    request.onerror = () => {
      dbPromise = null;
      reject(request.error ?? new Error("Failed to open cache database."));
    };

    request.onblocked = () => {
      // Keep the open request pending: blocked is temporary until older tabs close.
    };
  });

  return dbPromise;
}

export function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed."));
  });
}

export function waitForTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error("IndexedDB transaction was aborted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB transaction failed."));
  });
}

function ensureObjectStores(db: IDBDatabase): void {
  if (!db.objectStoreNames.contains(STORE_MASTERDATA)) {
    db.createObjectStore(STORE_MASTERDATA, { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains(STORE_ASSETS)) {
    const assets = db.createObjectStore(STORE_ASSETS, { keyPath: "key" });
    assets.createIndex("expiresAt", "expiresAt", { unique: false });
    assets.createIndex("lastAccessedAt", "lastAccessedAt", { unique: false });
  }

  if (!db.objectStoreNames.contains(STORE_PLAYER_FILES)) {
    db.createObjectStore(STORE_PLAYER_FILES, { keyPath: "key" });
  }

  if (!db.objectStoreNames.contains(STORE_PLAYER_FILE_INFO)) {
    db.createObjectStore(STORE_PLAYER_FILE_INFO, { keyPath: "key" });
  }
}

export const CACHE_DB_NAME = "moenotes-cache";
export const CACHE_DB_VERSION = 2;
export const STORE_MASTERDATA = "masterdata";
export const STORE_ASSETS = "assets";

export type CacheObjectStoreName = typeof STORE_MASTERDATA | typeof STORE_ASSETS;

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
      dbPromise = null;
      reject(new Error("Cache database upgrade was blocked."));
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
}

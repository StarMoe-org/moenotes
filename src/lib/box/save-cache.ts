import type { GameSaveServer } from "@/config/account";
import { sha256Hex } from "@/lib/account/game-saves";

/** One downloaded save, kept so a linked Box opens after a reload and offline. */
export interface CachedGameSave {
  key: string;
  server: GameSaveServer;
  accountId: string;
  sha256: string;
  uploadedAt: number;
  bytes: ArrayBuffer;
}

export const gameSaveCacheKey = (server: GameSaveServer, accountId: string): string => `${server}/${accountId}`;
let database: Promise<IDBDatabase> | undefined;

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") return Promise.reject(new Error("IndexedDB is unavailable"));
  database ??= new Promise<IDBDatabase>((resolve, reject) => {
    let rejected = false;
    const request = indexedDB.open("moenotes-game-saves", 1);
    request.onupgradeneeded = () => { request.result.createObjectStore("saves", { keyPath: "key" }); };
    request.onerror = request.onblocked = () => { rejected = true; database = undefined; reject(new Error("IndexedDB is unavailable")); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => { request.result.close(); database = undefined; };
      resolve(request.result);
    };
  });
  return database;
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction("saves", mode);
    const request = action(transaction.objectStore("saves"));
    transaction.oncomplete = () => resolve(request.result);
    transaction.onabort = transaction.onerror = () => reject(transaction.error ?? new Error("IndexedDB request failed"));
  });
}

/** The cached save of an account, or null. Bytes that no longer hash to the recorded SHA-256 are dropped. */
export async function readCachedGameSave(server: GameSaveServer, accountId: string): Promise<CachedGameSave | null> {
  const key = gameSaveCacheKey(server, accountId);
  const entry = await run<CachedGameSave | undefined>("readonly", store => store.get(key) as IDBRequest<CachedGameSave | undefined>);
  if (!entry) return null;
  if (!(entry.bytes instanceof ArrayBuffer) || await sha256Hex(new Uint8Array(entry.bytes)) !== entry.sha256) {
    await deleteCachedGameSave(server, accountId);
    return null;
  }
  return entry;
}

/** Keeps one save per account: a newer download replaces the older bytes. */
export async function writeCachedGameSave(entry: Omit<CachedGameSave, "key" | "bytes"> & { bytes: Uint8Array }): Promise<void> {
  const bytes = entry.bytes.slice().buffer;
  await run("readwrite", store => store.put({ key: gameSaveCacheKey(entry.server, entry.accountId), server: entry.server, accountId: entry.accountId,
    sha256: entry.sha256, uploadedAt: entry.uploadedAt, bytes } satisfies CachedGameSave));
}

export async function deleteCachedGameSave(server: GameSaveServer, accountId: string): Promise<void> {
  await run("readwrite", store => store.delete(gameSaveCacheKey(server, accountId)));
}

import type { GameSaveServer } from "@/config/account";
import { sha256Hex } from "@/lib/account/game-saves";

/** One downloaded save, kept so a linked Box opens after a reload and offline. */
export interface CachedGameSave {
  key: string;
  server: GameSaveServer;
  accountId: string;
  sha256: string;
  uploadedAt: number;
  cachedAt?: number;
  bytes: ArrayBuffer;
}

const accountKey = (server: GameSaveServer, accountId: string): string => `${server}/${accountId}`;
export const gameSaveCacheKey = (server: GameSaveServer, accountId: string, sha256: string): string => `${accountKey(server, accountId)}/${sha256}`;
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

/** Reads an exact version and also accepts the matching account-keyed cache from an earlier visit. */
export async function readCachedGameSave(server: GameSaveServer, accountId: string, sha256: string): Promise<CachedGameSave | null> {
  const key = gameSaveCacheKey(server, accountId, sha256);
  for (const candidate of [key, accountKey(server, accountId)]) {
    const entry = await run<CachedGameSave | undefined>("readonly", store => store.get(candidate) as IDBRequest<CachedGameSave | undefined>);
    if (!entry) continue;
    if (entry.server !== server || entry.accountId !== accountId || candidate === key && entry.sha256 !== sha256 || !(entry.bytes instanceof ArrayBuffer)
      || await sha256Hex(new Uint8Array(entry.bytes)) !== entry.sha256) {
      await run("readwrite", store => store.delete(candidate));
      continue;
    }
    if (entry.sha256 !== sha256) continue;
    if (candidate !== key) {
      await writeCachedGameSave({ ...entry, bytes: new Uint8Array(entry.bytes) }).catch(() => undefined);
      return { ...entry, key };
    }
    return entry;
  }
  return null;
}

/** Versions have independent keys, so downloads completing out of order cannot replace another version. */
export async function writeCachedGameSave(entry: Omit<CachedGameSave, "key" | "bytes"> & { bytes: Uint8Array }): Promise<void> {
  const bytes = entry.bytes.slice().buffer;
  await run("readwrite", store => store.put({ key: gameSaveCacheKey(entry.server, entry.accountId, entry.sha256), server: entry.server, accountId: entry.accountId,
    sha256: entry.sha256, uploadedAt: entry.uploadedAt, cachedAt: Date.now(), bytes } satisfies CachedGameSave));
}

/** Keeps linked versions, recent writes and two other versions per account for backup restoration. */
export async function pruneCachedGameSaves(server: GameSaveServer, accountId: string, referenced: ReadonlySet<string>, now = Date.now()): Promise<void> {
  const prefix = accountKey(server, accountId);
  await run("readwrite", store => {
    const request = store.getAll(IDBKeyRange.bound(prefix, `${prefix}/\uffff`)) as IDBRequest<CachedGameSave[]>;
    request.onsuccess = () => {
      const entries = request.result.filter(entry => entry.server === server && entry.accountId === accountId);
      const versions = new Set(entries.filter(entry => entry.key !== prefix).map(entry => entry.sha256));
      const unreferenced = entries.filter(entry => !referenced.has(entry.sha256) && entry.key !== prefix)
        .sort((a, b) => (b.cachedAt ?? b.uploadedAt) - (a.cachedAt ?? a.uploadedAt));
      const retained = new Set(unreferenced.slice(0, 2).map(entry => entry.key));
      for (const entry of entries) {
        if (entry.key === prefix && versions.has(entry.sha256)) store.delete(entry.key);
        else if (!referenced.has(entry.sha256) && !retained.has(entry.key) && (entry.cachedAt ?? 0) < now - 60_000) store.delete(entry.key);
      }
    };
    return request;
  });
}

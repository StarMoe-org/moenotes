import "fake-indexeddb/auto";
import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { sha256Hex } from "../src/lib/account/game-saves";
import { fetchGameSave, forgetLoadedGameSave, keepGameSave, openLinkedGameSave } from "../src/lib/box/game-save-source";
import { createBox, mergeBoxBackup, type BoxSaveLink } from "../src/lib/box/model";
import { CardBoxSession } from "../src/lib/box/session";
import { gameSaveCacheKey, pruneCachedGameSaves, readCachedGameSave, writeCachedGameSave, type CachedGameSave } from "../src/lib/box/save-cache";

const accountId = "20000000001";
async function fixture(exp: number) {
  const bytes = new TextEncoder().encode(JSON.stringify({ _characters: [{ _masterId: 1, _exp: exp }] }));
  const sha256 = await sha256Hex(bytes);
  const link: BoxSaveLink = { server: "intl", accountId, sha256, uploadedAt: exp + 100 };
  return { bytes, link, entry: { ...link, bytes } };
}
async function storage<T>(action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("moenotes-game-saves", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("saves", { keyPath: "key" });
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction("saves", "readwrite"), request = action(tx.objectStore("saves"));
      tx.oncomplete = () => resolve(request.result); tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}
beforeEach(async () => { await storage(store => store.clear()); });

describe("versioned game save cache", () => {
  test("out-of-order writes preserve both versions and copy the supplied bytes", async () => {
    const older = await fixture(1), newer = await fixture(2);
    await writeCachedGameSave(newer.entry); await writeCachedGameSave(older.entry);
    older.bytes.fill(0);
    expect((await readCachedGameSave("intl", accountId, newer.link.sha256))?.sha256).toBe(newer.link.sha256);
    expect((await readCachedGameSave("intl", accountId, older.link.sha256))?.sha256).toBe(older.link.sha256);
    expect(await storage(store => store.getAllKeys())).toHaveLength(2);
  });

  test("a matching account-keyed entry is readable and migrated without a download", async () => {
    const save = await fixture(3), another = await fixture(4);
    await storage(store => store.put({ ...save.entry, bytes: save.bytes.slice().buffer, key: `intl/${accountId}` }));
    expect(await readCachedGameSave("intl", accountId, another.link.sha256)).toBeNull();
    const network = globalThis.fetch; let requests = 0;
    globalThis.fetch = (async () => { requests++; return new Response(null, { status: 401 }); }) as typeof fetch;
    try {
      const opened = await openLinkedGameSave(save.link);
      expect(opened.status).toBe("ready"); expect(requests).toBe(0);
      expect(await storage(store => store.get(gameSaveCacheKey("intl", accountId, save.link.sha256)))).toBeDefined();
    } finally { globalThis.fetch = network; forgetLoadedGameSave("intl", accountId, save.link.sha256); }
  });

  test("corrupt bytes remove only their version and never the other cached source", async () => {
    const corrupt = await fixture(5), healthy = await fixture(6);
    await writeCachedGameSave(healthy.entry);
    const key = gameSaveCacheKey("intl", accountId, corrupt.link.sha256);
    await storage(store => store.put({ ...corrupt.entry, key, bytes: new Uint8Array([0]).buffer }));
    expect(await readCachedGameSave("intl", accountId, corrupt.link.sha256)).toBeNull();
    expect(await storage(store => store.get(key))).toBeUndefined();
    expect((await readCachedGameSave("intl", accountId, healthy.link.sha256))?.sha256).toBe(healthy.link.sha256);
  });

  test("a checked account-keyed save remains readable when migration cannot write", async () => {
    const save = await fixture(7);
    await storage(store => store.put({ ...save.entry, bytes: save.bytes.slice().buffer, key: `intl/${accountId}` }));
    const put = spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("Storage full", "QuotaExceededError"); });
    try { expect((await readCachedGameSave("intl", accountId, save.link.sha256))?.sha256).toBe(save.link.sha256); }
    finally { put.mockRestore(); }
  });

  test("two downloaded versions remain independently available in memory", async () => {
    const older = await fixture(8), newer = await fixture(9), network = globalThis.fetch;
    let requests = 0;
    globalThis.fetch = (async () => {
      const save = requests++ === 0 ? newer : older;
      return new Response(save.bytes, { headers: { etag: `"${save.link.sha256}"` } });
    }) as typeof fetch;
    try {
      await fetchGameSave("intl", accountId); await fetchGameSave("intl", accountId);
      globalThis.fetch = (async () => { requests++; return new Response(null, { status: 401 }); }) as typeof fetch;
      expect((await openLinkedGameSave(newer.link)).status).toBe("ready");
      expect((await openLinkedGameSave(older.link)).status).toBe("ready"); expect(requests).toBe(2);
    } finally { globalThis.fetch = network; forgetLoadedGameSave("intl", accountId, older.link.sha256); forgetLoadedGameSave("intl", accountId, newer.link.sha256); }
  });

  test("pruning retains all referenced versions, recent writes and two other versions", async () => {
    const saves = await Promise.all(Array.from({ length: 9 }, (_, i) => fixture(i + 10)));
    const now = 1_000_000;
    for (const [i, save] of saves.entries()) {
      await storage(store => store.put({ ...save.entry, bytes: save.bytes.slice().buffer,
        key: gameSaveCacheKey("intl", accountId, save.link.sha256), cachedAt: i === 4 ? now : now - 120_000 + i }));
    }
    const referenced = new Set(saves.slice(0, 4).map(save => save.link.sha256));
    await storage(store => store.put({ ...saves[0]!.entry, bytes: saves[0]!.bytes.slice().buffer, key: `intl/${accountId}` }));
    const separate = await fixture(99);
    await writeCachedGameSave({ ...separate.entry, accountId: "20000000002" });
    await pruneCachedGameSaves("intl", accountId, referenced, now);
    const entries = await storage(store => store.getAll()) as CachedGameSave[];
    expect(entries.filter(entry => entry.accountId === accountId).map(entry => entry.sha256).sort()).toEqual(
      [0, 1, 2, 3, 4, 8].map(i => saves[i]!.link.sha256).sort());
    expect(entries.find(entry => entry.accountId === "20000000002")).toBeDefined();
    expect(entries.find(entry => entry.key === `intl/${accountId}`)).toBeUndefined();
  });

  test("a late download cannot replace a restored source or prevent signed-out reopening", async () => {
    const older = await fixture(30), restored = await fixture(31);
    const session = new CardBoxSession("tw");
    await session.load(); await session.start("temporary");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const network = globalThis.fetch; let requests = 0, prepared = 0;
    globalThis.fetch = (async () => { requests++; await gate; return new Response(older.bytes, { headers: { etag: `"${older.link.sha256}"` } }); }) as typeof fetch;
    try {
      const updating = fetchGameSave("intl", accountId).then(save => session.linkSave(older.link, null, async () => { prepared++; await keepGameSave(save, 130); }));
      await writeCachedGameSave(restored.entry);
      const backup = { ...createBox("tw", "backup", 100), save: restored.link };
      expect(await session.commit(mergeBoxBackup(session.getSnapshot().box!, backup))).toBe(true);
      release(); expect(await updating).toBe(false); expect(prepared).toBe(0);
      expect(session.getSnapshot().box?.save).toEqual(restored.link);
      expect((await readCachedGameSave("intl", accountId, restored.link.sha256))?.sha256).toBe(restored.link.sha256);
      expect(await readCachedGameSave("intl", accountId, older.link.sha256)).toBeNull();
      forgetLoadedGameSave("intl", accountId, older.link.sha256); forgetLoadedGameSave("intl", accountId, restored.link.sha256);
      globalThis.fetch = (async () => { requests++; return new Response(null, { status: 401 }); }) as typeof fetch;
      const reopened = await openLinkedGameSave(restored.link);
      expect(reopened.status).toBe("ready"); expect(requests).toBe(1);
    } finally { release(); globalThis.fetch = network; forgetLoadedGameSave("intl", accountId, older.link.sha256); forgetLoadedGameSave("intl", accountId, restored.link.sha256); }
  });

  test("a source change while cache storage is pending preserves the replacement bytes", async () => {
    const older = await fixture(40), replacement = await fixture(41);
    const session = new CardBoxSession("kr");
    await session.load(); await session.start("temporary");
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const linking = session.linkSave(older.link, null, async () => { await gate; await writeCachedGameSave(older.entry); });
    await writeCachedGameSave(replacement.entry);
    await session.commit({ ...session.getSnapshot().box!, save: replacement.link });
    release(); expect(await linking).toBe(false);
    expect(session.getSnapshot().box?.save).toEqual(replacement.link);
    expect((await readCachedGameSave("intl", accountId, replacement.link.sha256))?.sha256).toBe(replacement.link.sha256);
  });
});

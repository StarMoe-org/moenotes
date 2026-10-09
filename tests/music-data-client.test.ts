import { describe, expect, mock, test } from "bun:test";
import { createMusicDataLoader, MUSIC_DATA_CACHE_TTL_MS, MUSIC_DATA_FORMAT } from "../src/lib/chart-data/client";
import type { AssetCacheEntry } from "../src/lib/cache/asset-cache";

const SOURCE_A = "https://a.invalid/music-data/music-data.json";
const SOURCE_B = "https://b.invalid/music-data/music-data.json";
const snapshot = (version: string) => ({ format: MUSIC_DATA_FORMAT, songs: [],
  provenance: { region: "tw", master: { version }, deck: { commit: `model-${version}` } },
  replay: { format: "nnnotes.replay-manifest/1", manifestUrl: `replay/${version}/manifest.json`, sha256: version.repeat(64), charts: 0 } });
const response = (version = "a") => new Response(JSON.stringify(snapshot(version)), { headers: { "content-type": "application/json" } });
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function environment() {
  let now = 1000, bypass = false;
  const disk = new Map<string, AssetCacheEntry>();
  const fetch = mock(async (_url: string, _init: RequestInit) => response());
  const get = mock(async (key: string) => disk.get(key) ?? null);
  const set = mock(async (entry: AssetCacheEntry) => { disk.set(entry.key, entry); });
  const remove = mock(async (key: string) => { disk.delete(key); });
  const dependencies = { fetch, get, set, delete: remove, now: () => now, bypass: () => bypass };
  return { disk, fetch, get, set, remove, page: () => createMusicDataLoader(dependencies),
    time: (value: number) => { now = value; }, bypass: (value: boolean) => { bypass = value; } };
}

describe("music-data short-lived snapshot cache", () => {
  test("concurrent readers download and parse once, then reuse the same object", async () => {
    const env = environment(), gate = deferred<Response>(), load = env.page();
    env.fetch.mockImplementation(() => gate.promise);
    const first = load(SOURCE_A), second = load(SOURCE_A);
    await Promise.resolve();
    expect(env.fetch).toHaveBeenCalledTimes(1);
    gate.resolve(response());
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(await load(SOURCE_A)).toBe(a);
    expect(env.get).toHaveBeenCalledTimes(1);
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(env.set).toHaveBeenCalledTimes(1);
    const stored = [...env.disk.values()][0]!;
    expect(JSON.parse(await stored.blob.text())).toEqual(snapshot("a"));
    expect(stored.expiresAt - stored.cachedAt).toBe(MUSIC_DATA_CACHE_TTL_MS);
    expect(stored.staleUntil).toBe(stored.expiresAt);
  });

  test("a page reload reuses the persisted body without extending its lifetime", async () => {
    const env = environment();
    await env.page()(SOURCE_A);
    const expiresAt = [...env.disk.values()][0]!.expiresAt;
    env.time(expiresAt - 1);
    const reload = env.page(), old = await reload(SOURCE_A);
    expect(old).toEqual(snapshot("a"));
    expect(await reload(SOURCE_A)).toBe(old);
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect([...env.disk.values()][0]!.expiresAt).toBe(expiresAt);
    env.time(expiresAt);
    env.fetch.mockImplementation(async () => response("b"));
    expect(await reload(SOURCE_A)).toEqual(snapshot("b"));
    expect(env.fetch).toHaveBeenCalledTimes(2);
    // Provenance and replay references always come from the same complete JSON body.
    expect(old).toEqual(snapshot("a"));
  });

  test("different source URLs never share memory, storage keys or replay identities", async () => {
    const env = environment(), load = env.page();
    env.fetch.mockImplementation(async url => response(url === SOURCE_A ? "a" : "b"));
    const a = await load(SOURCE_A), b = await load(SOURCE_B);
    expect(a).toEqual(snapshot("a"));
    expect(b).toEqual(snapshot("b"));
    expect(await load(`${SOURCE_A}#ignored`)).toBe(a);
    expect(env.disk.size).toBe(2);
    const reload = env.page();
    expect(await reload(SOURCE_B)).toEqual(snapshot("b"));
    expect(await reload(SOURCE_A)).toEqual(snapshot("a"));
    expect(env.fetch).toHaveBeenCalledTimes(2);
  });

  test("a stored longer TTL cannot turn this mutable file into a seven-day cache", async () => {
    const env = environment();
    await env.page()(SOURCE_A);
    const [key, entry] = [...env.disk.entries()][0]!;
    env.disk.set(key, { ...entry, expiresAt: entry.cachedAt + 7 * 86400000, staleUntil: entry.cachedAt + 30 * 86400000 });
    env.time(entry.cachedAt + MUSIC_DATA_CACHE_TTL_MS);
    env.fetch.mockImplementation(async () => response("b"));
    expect(await env.page()(SOURCE_A)).toEqual(snapshot("b"));
    expect(env.remove).toHaveBeenCalledWith(key);
    expect(env.fetch).toHaveBeenCalledTimes(2);
  });

  test("malformed, incompatible and wrongly attributed cached bodies retry the network", async () => {
    for (const poison of [
      { blob: new Blob(["{broken"]) },
      { blob: new Blob([JSON.stringify({ ...snapshot("a"), format: "nnnotes.music-data/99" })]) },
      { blob: new Blob([JSON.stringify({ ...snapshot("a"), songs: null })]) },
      { url: SOURCE_B },
    ]) {
      const env = environment();
      await env.page()(SOURCE_A);
      const [key, entry] = [...env.disk.entries()][0]!;
      env.disk.set(key, { ...entry, ...poison });
      env.fetch.mockImplementation(async () => response("b"));
      expect(await env.page()(SOURCE_A)).toEqual(snapshot("b"));
      expect(env.remove).toHaveBeenCalledWith(key);
      expect(env.fetch).toHaveBeenCalledTimes(2);
      expect(JSON.parse(await env.disk.get(key)!.blob.text())).toEqual(snapshot("b"));
    }
  });

  test("pre-aborted calls reject before touching either cache or network", async () => {
    const env = environment(), controller = new AbortController();
    controller.abort();
    await expect(env.page()(SOURCE_A, controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(env.get).not.toHaveBeenCalled();
    expect(env.fetch).not.toHaveBeenCalled();
    expect(env.set).not.toHaveBeenCalled();
  });

  test("aborting one reader does not cancel a shared download or the surviving reader", async () => {
    const env = environment(), gate = deferred<Response>(), load = env.page(), controller = new AbortController();
    env.fetch.mockImplementation(() => gate.promise);
    const cancelled = load(SOURCE_A, controller.signal).catch(error => error);
    const survivor = load(SOURCE_A);
    await Promise.resolve();
    controller.abort();
    expect(await cancelled).toMatchObject({ name: "AbortError" });
    expect(env.fetch.mock.calls[0]![1].signal).toBeUndefined();
    gate.resolve(response());
    const data = await survivor;
    expect(data).toEqual(snapshot("a"));
    expect(await load(SOURCE_A)).toBe(data);
    expect(env.fetch).toHaveBeenCalledTimes(1);
  });

  test("a failed shared request does not poison the next retry", async () => {
    const env = environment(), gate = deferred<Response>(), load = env.page();
    env.fetch.mockImplementationOnce(() => gate.promise);
    const first = load(SOURCE_A).catch(error => error), second = load(SOURCE_A).catch(error => error);
    await Promise.resolve();
    gate.reject(new Error("offline"));
    expect(await first).toMatchObject({ message: "offline" });
    expect(await second).toMatchObject({ message: "offline" });
    expect(env.set).not.toHaveBeenCalled();
    expect(await load(SOURCE_A)).toEqual(snapshot("a"));
    expect(env.fetch).toHaveBeenCalledTimes(2);
  });

  test("invalid network responses are never remembered or written", async () => {
    for (const bad of [new Response("unavailable", { status: 503 }), new Response("{broken"),
      new Response(JSON.stringify({ ...snapshot("a"), format: "nnnotes.music-data/99" }))]) {
      const env = environment(), load = env.page();
      env.fetch.mockImplementationOnce(async () => bad);
      await expect(load(SOURCE_A)).rejects.toThrow();
      expect(env.disk.size).toBe(0);
      expect(env.set).not.toHaveBeenCalled();
      expect(await load(SOURCE_A)).toEqual(snapshot("a"));
      expect(env.fetch).toHaveBeenCalledTimes(2);
    }
  });

  test("expired snapshots are not served when the fresh network request fails", async () => {
    const env = environment(), load = env.page();
    await load(SOURCE_A);
    env.time(1000 + MUSIC_DATA_CACHE_TTL_MS);
    env.fetch.mockImplementationOnce(async () => new Response("unavailable", { status: 503 }));
    await expect(load(SOURCE_A)).rejects.toThrow("HTTP 503");
    expect(await load(SOURCE_A)).toEqual(snapshot("a"));
    expect(env.fetch).toHaveBeenCalledTimes(3);
  });

  test("cache bypass reads the network every time without reading or populating caches", async () => {
    const env = environment(), load = env.page();
    await load(SOURCE_A);
    env.bypass(true);
    env.fetch.mockImplementation(async () => response("b"));
    expect(await load(SOURCE_A)).toEqual(snapshot("b"));
    expect(await load(SOURCE_A)).toEqual(snapshot("b"));
    expect(env.get).toHaveBeenCalledTimes(1);
    expect(env.set).toHaveBeenCalledTimes(1);
    expect(env.fetch).toHaveBeenCalledTimes(3);
    expect(JSON.parse(await [...env.disk.values()][0]!.blob.text())).toEqual(snapshot("a"));
  });

  test("unavailable or private storage falls back to memory and network", async () => {
    const env = environment(), load = env.page();
    env.get.mockImplementation(async () => { throw new Error("private mode"); });
    env.set.mockImplementation(async () => { throw new Error("quota"); });
    const data = await load(SOURCE_A);
    expect(await load(SOURCE_A)).toBe(data);
    expect(env.fetch).toHaveBeenCalledTimes(1);
    expect(await env.page()(SOURCE_A)).toEqual(snapshot("a"));
    expect(env.fetch).toHaveBeenCalledTimes(2);
  });

  test("the parsed response resolves while its background storage write is pending", async () => {
    const env = environment(), write = deferred<void>();
    env.set.mockImplementation(async entry => { await write.promise; env.disk.set(entry.key, entry); });
    expect(await env.page()(SOURCE_A)).toEqual(snapshot("a"));
    expect(env.disk.size).toBe(0);
    expect(env.set).toHaveBeenCalledTimes(1);
    write.resolve();
    await Promise.resolve();
    expect(env.disk.size).toBe(1);
  });
});

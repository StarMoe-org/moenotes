import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cacheConfig } from "@/config/cache";
import { setBuildFetchTransportForTests } from "@/lib/build/fetch";
import { memo, state } from "@/lib/masterdata/build-core";
import { currentMasterDataEpochSync, getBuildManifest, isMasterDataManifestFresh, resetMasterDataSnapshotForTests } from "@/lib/masterdata/build-snapshot";

const ENV_KEYS = ["MOENOTES_MASTERDATA_DIR", "MOENOTES_MASTERDATA_MAX_SELECTORS", "MOENOTES_MASTERDATA_VERSION_TTL_MS"] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** Runs the async part of a memo() call, up to its load(). */
const settle = () => Bun.sleep(0);

async function fill(...keys: string[]): Promise<void> {
  for (const key of keys) await memo(key, async () => key);
}

describe("memo() selector LRU", () => {
  const saved: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(async () => {
    for (const key of ENV_KEYS) saved[key] = process.env[key];
    delete process.env.MOENOTES_MASTERDATA_DIR;
    delete process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS;
    process.env.MOENOTES_MASTERDATA_MAX_SELECTORS = "3";
    setBuildFetchTransportForTests(async () => new Response(JSON.stringify({
      regions: { "hk-tw-mo": { version: "a1ba9587e3255fddc96e2c88f511b18f" } },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    resetMasterDataSnapshotForTests();
    await getBuildManifest();
    state.selectors.clear();
  });

  afterEach(() => {
    state.selectors.clear();
    setBuildFetchTransportForTests(null);
    resetMasterDataSnapshotForTests();
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  test("evicts the oldest selectors once the limit is exceeded", async () => {
    await fill("a", "b", "c", "d", "e");
    expect([...state.selectors.keys()]).toEqual(["c", "d", "e"]);
  });

  test("defaults to the configured limit when the environment sets no valid one", async () => {
    expect(cacheConfig.masterdata.maxSelectors).toBe(1500);
    for (const value of ["", "0", "-1", "not-a-number"]) {
      process.env.MOENOTES_MASTERDATA_MAX_SELECTORS = value;
      state.selectors.clear();
      await fill(...Array.from({ length: cacheConfig.masterdata.maxSelectors + 2 }, (_, index) => `key-${index}`));
      expect(state.selectors.size).toBe(cacheConfig.masterdata.maxSelectors);
    }
  });

  test("a hit on the fresh-manifest fast path renews the selector", async () => {
    expect(isMasterDataManifestFresh()).toBe(true);
    await fill("a", "b", "c");
    let runs = 0;
    await memo("a", async () => ++runs);
    await fill("d");
    expect(runs).toBe(0);
    expect([...state.selectors.keys()]).toEqual(["c", "a", "d"]);
  });

  test("a hit on the async path renews the selector", async () => {
    process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = "0";
    expect(isMasterDataManifestFresh()).toBe(false);
    await fill("a", "b", "c");
    let runs = 0;
    await memo("a", async () => ++runs);
    await fill("d");
    expect(runs).toBe(0);
    expect([...state.selectors.keys()]).toEqual(["c", "a", "d"]);
  });

  test("a failed load drops its selector so the next call retries", async () => {
    await expect(memo("a", async () => {
      throw new Error("load failed");
    })).rejects.toThrow("load failed");
    expect(state.selectors.has("a")).toBe(false);
    expect(await memo("a", async () => "retried")).toBe("retried");
  });

  test("a new epoch clears every selector", async () => {
    await fill("a", "b");
    state.epoch = currentMasterDataEpochSync() - 1;
    expect(await memo("a", async () => "rebuilt")).toBe("rebuilt");
    expect([...state.selectors.keys()]).toEqual(["a"]);
  });

  test("evicting an in-flight selector leaves the callers holding it unaffected", async () => {
    const pending = deferred<string>();
    const holder = memo("a", () => pending.promise);
    await settle();
    await fill("b", "c", "d");
    expect(state.selectors.has("a")).toBe(false);
    pending.resolve("held");
    expect(await holder).toBe("held");
    expect(state.selectors.has("a")).toBe(false);
  });

  test("a stale load failing does not drop the newer selector of the same key", async () => {
    const stale = deferred<string>();
    const holder = memo("a", () => stale.promise);
    await settle();
    await fill("b", "c", "d");
    expect(await memo("a", async () => "fresh")).toBe("fresh");
    stale.reject(new Error("stale load failed"));
    await expect(holder).rejects.toThrow("stale load failed");
    let runs = 0;
    expect(await memo("a", async () => `rerun-${++runs}`)).toBe("fresh");
    expect(runs).toBe(0);
  });

  test("nested selectors finish, each loading once, when dependencies are evicted mid-flight", async () => {
    const leaf = deferred<number>();
    const runs = { leaf: 0, middle: 0, outer: 0 };
    const loadLeaf = () => memo("leaf", () => {
      runs.leaf += 1;
      return leaf.promise;
    });
    const loadMiddle = () => memo("middle", async () => {
      runs.middle += 1;
      return (await loadLeaf()) + 1;
    });
    const loadOuter = () => memo("outer", async () => {
      runs.outer += 1;
      return (await loadMiddle()) + 1;
    });

    const callers = [loadOuter(), loadOuter(), loadOuter()];
    await settle();
    await fill("x", "y", "z");
    expect([...state.selectors.keys()]).toEqual(["x", "y", "z"]);
    leaf.resolve(1);
    expect(await Promise.all(callers)).toEqual([3, 3, 3]);
    expect(runs).toEqual({ leaf: 1, middle: 1, outer: 1 });
  });
});

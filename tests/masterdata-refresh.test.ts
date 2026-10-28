import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { setBuildFetchTransportForTests } from "@/lib/build/fetch";
import { memo, state } from "@/lib/masterdata/build-core";
import {
  currentMasterDataEpochSync,
  forceRefreshMasterData,
  getBuildManifest,
  getBuildMasterData,
  getMasterDataCacheStats,
  isMasterDataManifestFresh,
  resetMasterDataSnapshotForTests,
  shouldBypassMasterDataCache,
  withMasterDataVersionParam,
} from "@/lib/masterdata/build-snapshot";
import { formatMasterDataVersionLabel, withClientMasterDataVersion } from "@/lib/masterdata/client-version";

describe("Runtime MasterData version cache, versioned table cache & forced cache penetration", () => {
  test("memo caches selectors per epoch and invalidates when epoch advances", async () => {
    await getBuildManifest();
    expect(isMasterDataManifestFresh()).toBe(true);

    let runs = 0;
    const key = "test:masterdata-epoch-probe";
    state.selectors.delete(key);

    const first = await memo(key, async () => ++runs);
    const second = await memo(key, async () => ++runs);
    expect(first).toBe(1);
    expect(second).toBe(1);

    const beforeEpoch = currentMasterDataEpochSync();
    state.epoch = beforeEpoch - 1;
    const third = await memo(key, async () => ++runs);
    expect(third).toBe(2);
    expect(state.epoch).toBe(beforeEpoch);

    state.selectors.delete(key);
    resetMasterDataSnapshotForTests();
    const manifestAfterReset = await getBuildManifest();
    expect(manifestAfterReset.dataVersion.length).toBeGreaterThan(0);
  });

  test("current_version.json always penetrates cache, all MasterData fetches carry ?v=, and forceRefreshMasterData bypasses memory/disk/CDN caches", async () => {
    const savedMasterdataDir = process.env.MOENOTES_MASTERDATA_DIR;
    const savedCacheDir = process.env.MOENOTES_MASTERDATA_CACHE_DIR;
    const savedFetchCacheDir = process.env.MOENOTES_FETCH_CACHE_DIR;
    const savedVersionTtl = process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS;

    const tempRoot = mkdtempSync(join(tmpdir(), "moenotes-md-cache-"));
    const mdCacheDir = join(tempRoot, "masterdata_cache");
    const fetchCacheDir = join(tempRoot, "fetch_cache");

    interface SeenCall {
      url: string;
      cache: RequestCache | undefined;
      cacheControl: string | null;
      pragma: string | null;
    }
    const calls: SeenCall[] = [];

    let twVersion = "a1ba9587e3255fddc96e2c88f511b18f";
    let jpVersion = "1.1.0.100/9cb2cd74f02a7b69ba4069f064f177fe";
    let twCardTitle = "Card v1";

    delete process.env.MOENOTES_MASTERDATA_DIR;
    process.env.MOENOTES_MASTERDATA_CACHE_DIR = mdCacheDir;
    process.env.MOENOTES_FETCH_CACHE_DIR = fetchCacheDir;
    process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = "60000";

    setBuildFetchTransportForTests(async (input, init) => {
      const url = String(input);
      const headers = new Headers(init?.headers);
      calls.push({
        url,
        cache: init?.cache,
        cacheControl: headers.get("cache-control"),
        pragma: headers.get("pragma"),
      });

      const parsed = new URL(url);
      if (parsed.pathname === "/current_version.json") {
        return new Response(
          JSON.stringify({
            schema_version: 1,
            regions: {
              "hk-tw-mo": { version: twVersion, resource_version: "0.0.1.78_hash" },
              jp: { version: jpVersion, resource_version: "1.1.0.100_hash" },
            },
          }),
          {
            status: 200,
            headers: {
              "content-type": "application/json",
              etag: '"ver-etag"',
            },
          },
        );
      }

      if (parsed.pathname === "/index.json") {
        return new Response(
          JSON.stringify({
            regions: {
              "hk-tw-mo": {
                path: "hk-tw-mo",
                files: { "MasterTestCard.json": `sha-tw-${twVersion}` },
              },
              jp: {
                path: "jp",
                files: { "MasterTestCard.json": `sha-jp-${jpVersion}` },
              },
            },
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }

      if (parsed.pathname === "/tw/master/MasterTestCard.json") {
        return new Response(JSON.stringify([{ id: 1, title: twCardTitle }]), {
          status: 200,
          headers: { "content-type": "application/json", etag: `"tw-${twCardTitle}"` },
        });
      }

      if (parsed.pathname === "/jp/master/MasterTestCard.json") {
        return new Response(JSON.stringify([{ id: 2, title: "JP Card" }]), {
          status: 200,
          headers: { "content-type": "application/json", etag: '"jp-card"' },
        });
      }

      return new Response("Not Found", { status: 404 });
    });

    try {
      resetMasterDataSnapshotForTests();

      // 1. Initial load: current_version.json penetrates cache (_t + no-cache, no-store), index.json & tables carry ?v=
      const twRows = await getBuildMasterData(
        "MasterTestCard.json",
        (raw) => raw as Array<{ id: number; title: string }>,
        "tw",
      );
      const jpRows = await getBuildMasterData(
        "MasterTestCard.json",
        (raw) => raw as Array<{ id: number; title: string }>,
        "jp",
      );
      expect(twRows[0]?.title).toBe("Card v1");
      expect(jpRows[0]?.title).toBe("JP Card");

      const versionCalls = calls.filter((c) => new URL(c.url).pathname === "/current_version.json");
      expect(versionCalls.length).toBe(1);
      expect(new URL(versionCalls[0]!.url).searchParams.get("_t")).toBeTruthy();
      expect(versionCalls[0]!.cache).toBe("no-store");
      expect(versionCalls[0]!.cacheControl).toBe("no-cache, no-store, max-age=0, must-revalidate");
      expect(versionCalls[0]!.pragma).toBe("no-cache");

      const indexCall = calls.find((c) => new URL(c.url).pathname === "/index.json");
      expect(indexCall).toBeDefined();
      expect(new URL(indexCall!.url).searchParams.get("v")).toContain(twVersion);

      const twTableCall = calls.find((c) => new URL(c.url).pathname === "/tw/master/MasterTestCard.json");
      expect(twTableCall).toBeDefined();
      expect(new URL(twTableCall!.url).searchParams.get("v")).toBe(twVersion);

      const jpTableCall = calls.find((c) => new URL(c.url).pathname === "/jp/master/MasterTestCard.json");
      expect(jpTableCall).toBeDefined();
      expect(new URL(jpTableCall!.url).searchParams.get("v")).toBe(jpVersion);

      // 2. Repeated reads within TTL hit in-memory version + table cache (zero extra network calls)
      const beforeCount = calls.length;
      await getBuildMasterData("MasterTestCard.json", (raw) => raw, "tw");
      expect(calls.length).toBe(beforeCount);

      // 3. Process memory reset: current_version.json STILL penetrates network with a NEW _t token,
      //    while version-matched MasterTestCard.json loads from persistent versioned disk cache!
      resetMasterDataSnapshotForTests();
      const fromDisk = await getBuildMasterData(
        "MasterTestCard.json",
        (raw) => raw as Array<{ id: number; title: string }>,
        "tw",
      );
      expect(fromDisk[0]?.title).toBe("Card v1");

      const allVersionCalls = calls.filter((c) => new URL(c.url).pathname === "/current_version.json");
      expect(allVersionCalls.length).toBe(2);
      expect(new URL(allVersionCalls[0]!.url).searchParams.get("_t")).not.toBe(
        new URL(allVersionCalls[1]!.url).searchParams.get("_t"),
      );
      const twTableCallsAfterDiskHit = calls.filter((c) => new URL(c.url).pathname === "/tw/master/MasterTestCard.json");
      expect(twTableCallsAfterDiskHit.length).toBe(1);

      // 4. Force cache penetration (强制穿透) even when version string hasn't changed yet (e.g. hotfix / manual refresh):
      //    bypasses Version Cache TTL, Disk Cache, and CDN URL cache (`_t` + `no-cache, no-store` on table fetch too!)
      twCardTitle = "Card hotfixed";
      const epochBeforeForce = currentMasterDataEpochSync();
      await forceRefreshMasterData({ purgeTables: true });
      expect(currentMasterDataEpochSync()).toBeGreaterThan(epochBeforeForce);

      const hotfixed = await getBuildMasterData(
        "MasterTestCard.json",
        (raw) => raw as Array<{ id: number; title: string }>,
        "tw",
      );
      expect(hotfixed[0]?.title).toBe("Card hotfixed");

      const latestTwCall = calls.filter((c) => new URL(c.url).pathname === "/tw/master/MasterTestCard.json").at(-1)!;
      expect(new URL(latestTwCall.url).searchParams.get("v")).toBe(twVersion);
      expect(new URL(latestTwCall.url).searchParams.get("_t")).toBeTruthy();
      expect(latestTwCall.cache).toBe("no-store");
      expect(latestTwCall.cacheControl).toBe("no-cache, no-store, max-age=0, must-revalidate");

      // 5. Upstream version rotation cleanly isolates new version key (?v=new-hash)
      twVersion = "b2cb0698f4366geed07f3d99g622c29g";
      twCardTitle = "Card v2";
      const rotatedManifest = await forceRefreshMasterData({ purgeTables: true });
      expect(rotatedManifest.dataVersion).toContain(twVersion);
      const v2Rows = await getBuildMasterData(
        "MasterTestCard.json",
        (raw) => raw as Array<{ id: number; title: string }>,
        "tw",
      );
      expect(v2Rows[0]?.title).toBe("Card v2");
      const v2Call = calls.filter((c) => new URL(c.url).pathname === "/tw/master/MasterTestCard.json").at(-1)!;
      expect(new URL(v2Call.url).searchParams.get("v")).toBe(twVersion);

      const stats = getMasterDataCacheStats();
      expect(stats.regionVersions["hk-tw-mo"]).toBe(twVersion);
      expect(stats.cachedTables).toBeGreaterThanOrEqual(1);
    } finally {
      setBuildFetchTransportForTests(undefined);
      if (savedMasterdataDir === undefined) delete process.env.MOENOTES_MASTERDATA_DIR;
      else process.env.MOENOTES_MASTERDATA_DIR = savedMasterdataDir;
      if (savedCacheDir === undefined) delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
      else process.env.MOENOTES_MASTERDATA_CACHE_DIR = savedCacheDir;
      if (savedFetchCacheDir === undefined) delete process.env.MOENOTES_FETCH_CACHE_DIR;
      else process.env.MOENOTES_FETCH_CACHE_DIR = savedFetchCacheDir;
      if (savedVersionTtl === undefined) delete process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS;
      else process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = savedVersionTtl;
      resetMasterDataSnapshotForTests();
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  test("shouldBypassMasterDataCache and version URL helpers handle query & header triggers", () => {
    expect(withMasterDataVersionParam("https://metadata.bdon.moe/tw/master/MasterEvent.json", "abc123")).toBe(
      "https://metadata.bdon.moe/tw/master/MasterEvent.json?v=abc123",
    );
    expect(withClientMasterDataVersion("/search-index.json")).toBe("/search-index.json");
    expect(withClientMasterDataVersion("/search-index.json", { forceBypass: true })).toContain("refresh_masterdata=1");

    expect(shouldBypassMasterDataCache({ searchParams: new URLSearchParams("refresh_masterdata=1") })).toBe(true);
    expect(shouldBypassMasterDataCache({ searchParams: new URLSearchParams("_refresh=1793250000") })).toBe(true);
    expect(shouldBypassMasterDataCache({ searchParams: new URLSearchParams("__refresh=true") })).toBe(true);
    expect(shouldBypassMasterDataCache({ searchParams: new URLSearchParams("nocache=1") })).toBe(true);
    expect(shouldBypassMasterDataCache({ headers: new Headers({ "x-moenotes-bypass-cache": "1" }) })).toBe(true);
    expect(shouldBypassMasterDataCache({ searchParams: new URLSearchParams("page=2"), headers: new Headers() })).toBe(false);

    expect(formatMasterDataVersionLabel("1.1.0.100/9cb2cd74f02a7b69ba4069f064f177fe")).toBe("1.1.0.100 · 9cb2cd74");
    expect(
      formatMasterDataVersionLabel(
        "a1ba9587e3255fddc96e2c88f511b18f",
        "0.0.1.78_5a972f86b779b5b33d60b649b76508d86bc556bc5e96dc8da818e0ab298b827b",
      ),
    ).toBe("0.0.1.78 · a1ba9587");
  });
});

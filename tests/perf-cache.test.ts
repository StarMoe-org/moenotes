import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { NextRequest } from "next/server";
import { SUPPORTED_LOCALES } from "@/config/locales";
import { setBuildFetchTransportForTests } from "@/lib/build/fetch";
import { memo, state as coreState, table } from "@/lib/masterdata/build-core";
import { getBuildThemeBandsByLocale } from "@/lib/masterdata/build-data";
import {
  currentMasterDataEpochSync,
  forceRefreshMasterData,
  getBuildManifest,
  getBuildTableKey,
  isMasterDataPurgeAuthorized,
  resetMasterDataSnapshotForTests,
  resolveBypassMasterDataManifest,
} from "@/lib/masterdata/build-snapshot";
import { withClientMasterDataVersion } from "@/lib/masterdata/client-version";
import { GET as searchIndexGet } from "@/app/search-index.json/route";

const ENV_KEYS = [
  "MOENOTES_MASTERDATA_DIR",
  "MOENOTES_MASTERDATA_CACHE_DIR",
  "MOENOTES_MASTERDATA_MAX_TABLES",
  "MOENOTES_MASTERDATA_MAX_SELECTORS",
  "MOENOTES_MASTERDATA_VERSION_TTL_MS",
  "MOENOTES_SERVERS",
  "MOENOTES_CACHE_PURGE_TOKEN",
] as const;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("performance & cache hardening", () => {
  const savedEnv: Partial<Record<(typeof ENV_KEYS)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    delete process.env.MOENOTES_MASTERDATA_DIR;
    delete process.env.MOENOTES_MASTERDATA_CACHE_DIR;
    delete process.env.MOENOTES_MASTERDATA_MAX_TABLES;
    delete process.env.MOENOTES_MASTERDATA_MAX_SELECTORS;
    delete process.env.MOENOTES_CACHE_PURGE_TOKEN;
    process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = "60000";
    process.env.MOENOTES_SERVERS = "tw,jp";
    resetMasterDataSnapshotForTests();
    coreState.tables.clear();
    coreState.selectors.clear();
  });

  afterEach(() => {
    setBuildFetchTransportForTests(null);
    resetMasterDataSnapshotForTests();
    coreState.tables.clear();
    coreState.selectors.clear();
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });

  test("preserves unchanged sha256 tables (including @+09:00 tagged JP tables) across natural epoch bumps and avoids redundant UTC+8 cloning", async () => {
    let twVersion = "tw-v1";
    let jpVersion = "jp-v1";
    let jpChangedSha = "c".repeat(64);
    const sharedEventSha = "a".repeat(64);
    const twOnlySha = "b".repeat(64);

    let eventFetchCount = 0;
    let jpChangedFetchCount = 0;

    setBuildFetchTransportForTests(async (input) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === "/current_version.json") {
        return Response.json({
          regions: {
            "hk-tw-mo": { version: twVersion },
            jp: { version: jpVersion },
          },
        });
      }
      if (parsed.pathname === "/index.json") {
        return Response.json({
          regions: {
            "hk-tw-mo": {
              path: "hk-tw-mo",
              files: {
                "MasterTestEvent.json": sharedEventSha,
                "MasterTwOnly.json": twOnlySha,
              },
            },
            jp: {
              path: "jp",
              files: {
                "MasterTestEvent.json": sharedEventSha,
                "MasterChanged.json": jpChangedSha,
              },
            },
          },
        });
      }
      if (parsed.pathname.endsWith("/MasterTestEvent.json")) {
        eventFetchCount += 1;
        return Response.json({
          _allData: [{ _id: 1, _startAt: "2026/10/01 12:00:00" }],
        });
      }
      if (parsed.pathname.endsWith("/MasterTwOnly.json")) {
        return Response.json({
          _allData: [{ _id: 2, _startAt: "2026/10/02 12:00:00" }],
        });
      }
      if (parsed.pathname.endsWith("/MasterChanged.json")) {
        jpChangedFetchCount += 1;
        return Response.json({
          _allData: [{ _id: 3, _name: `changed-${jpVersion}` }],
        });
      }
      return new Response("Not Found", { status: 404 });
    });

    await getBuildManifest();
    const tableKey = await getBuildTableKey("jp", "MasterTestEvent.json");
    expect(tableKey.startsWith("v:")).toBe(true);

    // Load TW (UTC+8) and JP (UTC+9) tables with identical SHA-256 bytes.
    const twEvent1 = await table<{ id: number; startAt: string }>("MasterTestEvent.json", "tw");
    const jpEvent1 = await table<{ id: number; startAt: string }>("MasterTestEvent.json", "jp");
    const twOnly1 = await table<{ id: number; startAt: string }>("MasterTwOnly.json", "tw");
    const jpChanged1 = await table<{ id: number; name: string }>("MasterChanged.json", "jp");

    expect(eventFetchCount).toBe(1);
    expect(jpChangedFetchCount).toBe(1);
    expect(twEvent1._allData[0]?.startAt).toBe("2026/10/01 12:00:00");
    expect(jpEvent1._allData[0]?.startAt).toBe("2026/10/01 12:00:00+09:00");
    expect(twOnly1._allData[0]?.id).toBe(2);
    expect(jpChanged1._allData[0]?.name).toBe("changed-jp-v1");

    // UTC+8 tables do not duplicate into build-core's tagged table map; only JP tagged tables are stored there.
    expect(coreState.tables.has(`sha256:${twOnlySha}`)).toBe(false);
    expect(coreState.tables.has(`sha256:${sharedEventSha}@+09:00`)).toBe(true);

    // Repeated read in the same epoch reuses the exact same validated/tagged table object (no redundant cloning).
    const twEvent1Repeat = await table<{ id: number; startAt: string }>("MasterTestEvent.json", "tw");
    expect(twEvent1Repeat).toBe(twEvent1);

    // Rotate upstream version naturally (TTL expired, dataVersion changed, MasterTestEvent SHA-256 unchanged).
    const epochBefore = currentMasterDataEpochSync();
    jpVersion = "jp-v2";
    jpChangedSha = "d".repeat(64);
    process.env.MOENOTES_MASTERDATA_VERSION_TTL_MS = "0";
    await getBuildManifest();
    expect(currentMasterDataEpochSync()).toBeGreaterThan(epochBefore);

    const twEvent2 = await table<{ id: number; startAt: string }>("MasterTestEvent.json", "tw");
    const jpEvent2 = await table<{ id: number; startAt: string }>("MasterTestEvent.json", "jp");
    const jpChanged2 = await table<{ id: number; name: string }>("MasterChanged.json", "jp");

    // Unchanged sha256 tables survived epoch rotation in both UTC+8 and @+09:00 caches with zero extra fetches.
    expect(eventFetchCount).toBe(1);
    expect(twEvent2).toBe(twEvent1);
    expect(jpEvent2).toBe(jpEvent1);
    expect(jpEvent2._allData[0]?.startAt).toBe("2026/10/01 12:00:00+09:00");
    // Changed table was fetched for the new SHA-256.
    expect(jpChangedFetchCount).toBe(2);
    expect(jpChanged2._allData[0]?.name).toBe("changed-jp-v2");

    // Explicit purgeTables: true clears even sha256: tables so hotfixes re-fetch.
    await forceRefreshMasterData({ purgeTables: true });
    await table<{ id: number; startAt: string }>("MasterTestEvent.json", "jp");
    expect(eventFetchCount).toBe(2);
  });

  test("tagged table cache honors MOENOTES_MASTERDATA_MAX_TABLES above hardcoded 256", async () => {
    process.env.MOENOTES_MASTERDATA_MAX_TABLES = "300";
    const files: Record<string, string> = {};
    for (let i = 0; i < 270; i += 1) {
      files[`MasterTable${i}.json`] = String(i).padStart(64, "0");
    }

    setBuildFetchTransportForTests(async (input) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === "/current_version.json") {
        return Response.json({ regions: { "hk-tw-mo": { version: "tw-1" }, jp: { version: "jp-1" } } });
      }
      if (parsed.pathname === "/index.json") {
        return Response.json({ regions: { jp: { path: "jp", files } } });
      }
      return Response.json({ _allData: [{ _id: 1 }] });
    });

    await getBuildManifest();
    for (let i = 0; i < 270; i += 1) {
      await table(`MasterTable${i}.json`, "jp");
    }
    expect(coreState.tables.size).toBe(270);
  });

  test("protects core global selectors from detail-page LRU eviction", async () => {
    process.env.MOENOTES_MASTERDATA_MAX_SELECTORS = "4";
    setBuildFetchTransportForTests(async () => Response.json({ regions: { "hk-tw-mo": { version: "tw-1" } } }));
    await getBuildManifest();

    let coreRuns = 0;
    const coreKeys = ["texts:tw", "cards:tw:en-US", "stories:tw:en-US", "content-search-index", "theme-bands-by-locale"];
    for (const key of coreKeys) {
      await memo(key, async () => {
        coreRuns += 1;
        return `value:${key}`;
      });
    }
    expect(coreRuns).toBe(coreKeys.length);

    // Churn 20 detail selectors past maxSelectors = 4.
    let detailRuns = 0;
    for (let i = 1; i <= 20; i += 1) {
      await memo(`card-detail:en-US:${i}`, async () => {
        detailRuns += 1;
        return i;
      });
    }
    expect(coreState.selectors.size).toBe(4);
    expect(detailRuns).toBe(20);

    // Every core selector is still warm (0 recomputations).
    for (const key of coreKeys) {
      const val = await memo(key, async () => {
        coreRuns += 1;
        return "rebuilt";
      });
      expect(val).toBe(`value:${key}`);
    }
    expect(coreRuns).toBe(coreKeys.length);

    // Evicted detail selector recomputes, while recent one hits.
    await memo("card-detail:en-US:1", async () => {
      detailRuns += 1;
      return 1;
    });
    expect(detailRuns).toBe(21);
    await memo("card-detail:en-US:20", async () => {
      detailRuns += 1;
      return 20;
    });
    expect(detailRuns).toBe(21);

    // Epoch bump clears both core and detail selectors.
    await forceRefreshMasterData({ purgeTables: true });
    await memo("texts:tw", async () => {
      coreRuns += 1;
      return "epoch-2";
    });
    expect(coreRuns).toBe(coreKeys.length + 1);
  });

  test("deduplicates concurrent /search-index.json requests (singleflight) and protects against unauthenticated purgeTables", async () => {
    process.env.MOENOTES_SERVERS = "tw";
    process.env.MOENOTES_CACHE_PURGE_TOKEN = "secret-purge-token";

    let versionCalls = 0;
    let memberCardCalls = 0;
    const gate = deferred<void>();
    let gateArmed = true;

    setBuildFetchTransportForTests(async (input) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === "/current_version.json") {
        versionCalls += 1;
        return Response.json({ regions: { "hk-tw-mo": { version: "tw-v1" } } });
      }
      if (parsed.pathname === "/index.json") {
        return Response.json({ regions: {} });
      }
      if (parsed.pathname.endsWith("/MasterMemberCard.json")) {
        memberCardCalls += 1;
        if (gateArmed) {
          await gate.promise;
        }
        return Response.json({ _allData: [] });
      }
      if (parsed.pathname.endsWith("/MasterText.json")) {
        return Response.json({ _allData: [] });
      }
      return Response.json({ _allData: [] });
    });

    // Warm manifest first, then fire 5 concurrent GET /search-index.json calls while MasterMemberCard is pending.
    await getBuildManifest();
    const epochBefore = currentMasterDataEpochSync();

    const pendingResponses = Array.from({ length: 5 }, () =>
      searchIndexGet(new NextRequest("http://localhost/search-index.json")),
    );
    await Bun.sleep(20);
    expect(memberCardCalls).toBe(1);
    gateArmed = false;
    gate.resolve();

    const responses = await Promise.all(pendingResponses);
    const bodies = await Promise.all(responses.map((res) => res.text()));
    expect(responses.every((res) => res.status === 200)).toBe(true);
    expect(new Set(bodies).size).toBe(1);
    expect(JSON.parse(bodies[0]!).dataVersion).toContain("tw-v1");
    expect(memberCardCalls).toBe(1);

    // Unauthenticated ?refresh_masterdata=1 / ?nocache=1 must NOT purge tables or bump epoch.
    const unauthReq = new NextRequest("http://localhost/search-index.json?refresh_masterdata=1&nocache=1");
    const unauthRes = await searchIndexGet(unauthReq);
    expect(unauthRes.status).toBe(200);
    expect(currentMasterDataEpochSync()).toBe(epochBefore);
    expect(memberCardCalls).toBe(1);

    // Unauthenticated resolveBypassMasterDataManifest also rate-limits version checks & never purges tables.
    const callsBeforeRateLimit = versionCalls;
    await resolveBypassMasterDataManifest(new Headers({ "x-moenotes-bypass-cache": "1" }));
    expect(versionCalls).toBe(callsBeforeRateLimit);
    expect(currentMasterDataEpochSync()).toBe(epochBefore);
    expect(isMasterDataPurgeAuthorized(new Headers({ "x-moenotes-purge-token": "wrong" }))).toBe(false);
    expect(isMasterDataPurgeAuthorized(new Headers({ authorization: "Bearer secret-purge-token" }))).toBe(true);

    // Authorized purge token DOES purge tables, increment epoch, and rebuild /search-index.json.
    const authReq = new NextRequest("http://localhost/search-index.json?refresh_masterdata=1", {
      headers: { "x-moenotes-purge-token": "secret-purge-token" },
    });
    const authRes = await searchIndexGet(authReq);
    expect(authRes.status).toBe(200);
    expect(authRes.headers.get("Cache-Control")).toBe("no-store");
    expect(currentMasterDataEpochSync()).toBeGreaterThan(epochBefore);
    expect(memberCardCalls).toBe(2);
  });

  test("withClientMasterDataVersion never appends refresh_masterdata=1 from page query or bypass session", () => {
    const savedWindow = (globalThis as Record<string, unknown>).window;
    const savedSession = (globalThis as Record<string, unknown>).sessionStorage;
    const savedDocument = (globalThis as Record<string, unknown>).document;

    try {
      (globalThis as Record<string, unknown>).window = { location: { search: "?_refresh=12345&refresh_masterdata=1" } };
      (globalThis as Record<string, unknown>).sessionStorage = {
        getItem: (key: string) => (key === "moenotes.masterdata.bypass-session" ? "1" : null),
      };
      (globalThis as Record<string, unknown>).document = {
        documentElement: {
          getAttribute: (attr: string) => (attr === "data-masterdata-version" ? "tw-v1" : null),
        },
      };

      expect(withClientMasterDataVersion("/search-index.json")).toBe("/search-index.json?v=tw-v1");
      expect(withClientMasterDataVersion("/search-index.json", { forceBypass: true })).toContain("refresh_masterdata=1");
    } finally {
      if (savedWindow === undefined) delete (globalThis as Record<string, unknown>).window;
      else (globalThis as Record<string, unknown>).window = savedWindow;
      if (savedSession === undefined) delete (globalThis as Record<string, unknown>).sessionStorage;
      else (globalThis as Record<string, unknown>).sessionStorage = savedSession;
      if (savedDocument === undefined) delete (globalThis as Record<string, unknown>).document;
      else (globalThis as Record<string, unknown>).document = savedDocument;
    }
  });

  test("getBuildThemeBandsByLocale caches all 13 locales in one core selector per epoch", async () => {
    process.env.MOENOTES_SERVERS = "tw";
    let characterFetches = 0;

    setBuildFetchTransportForTests(async (input) => {
      const parsed = new URL(String(input));
      if (parsed.pathname === "/current_version.json") {
        return Response.json({ regions: { "hk-tw-mo": { version: "tw-v1" } } });
      }
      if (parsed.pathname === "/index.json") {
        return Response.json({ regions: {} });
      }
      if (parsed.pathname.endsWith("/MasterBand.json")) {
        return Response.json({
          _allData: [{ _id: 1, _nameTextID: "band_1", _mainColorCode: "#ff3366" }],
        });
      }
      if (parsed.pathname.endsWith("/MasterCharacter.json")) {
        characterFetches += 1;
        return Response.json({
          _allData: [
            {
              _id: 101,
              _bandID: 1,
              _displayOrder: 1,
              _isNonPlayable: false,
              _nameTextID: "char_101",
              _enDisplayNameTextId: "char_101",
              _shortNameTextID: "char_101",
              _mainColorCode: "#112233",
              _subColorCode: "#445566",
              _bandPart: "Vocal",
              _birthdayMonth: 1,
              _birthdayDay: 1,
              _bloodTypeTextId: "",
              _catchCopyTextId: "",
              _constellationTextId: "",
              _descriptionTextId: "",
              _favoriteFoodTextId: "",
              _heightTextId: "",
              _hobbyTextId: "",
              _schoolClassTextId: "",
              _schoolTextId: "",
              _voiceActorTextId: "",
            },
          ],
        });
      }
      if (parsed.pathname.endsWith("/MasterText.json")) {
        return Response.json({
          _allData: [
            {
              _id: "band_1",
              _japanese: "JP Band",
              _english: "EN Band",
              _simplifiedChinese: "CN Band",
              _traditionalChinese: "TW Band",
              _korean: "KO Band",
            },
            {
              _id: "char_101",
              _japanese: "JP Char",
              _english: "EN Char",
              _simplifiedChinese: "CN Char",
              _traditionalChinese: "TW Char",
              _korean: "KO Char",
            },
          ],
        });
      }
      return Response.json({ _allData: [] });
    });

    const first = await getBuildThemeBandsByLocale();
    const second = await getBuildThemeBandsByLocale();
    expect(second).toBe(first);
    expect(characterFetches).toBe(1);
    for (const locale of SUPPORTED_LOCALES) {
      expect(first[locale]?.length).toBe(1);
    }
    expect(first["zh-CN"]?.[0]?.name).toBe("CN Band");
    expect(first["ja-JP"]?.[0]?.name).toBe("JP Band");
    expect(first["fr-FR"]).toBe(first["en-US"]);
    expect(first["fr-FR"]?.[0]?.name).toBe("EN Band");
  });
});

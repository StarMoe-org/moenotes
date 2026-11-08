import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";
import { gzipSync } from "node:zlib";
import { NextRequest } from "next/server";
import { GET as getDeckChartsRoute } from "@/app/api/v1/meta/deck-charts/route";
import { setBuildFetchTransportForTests } from "@/lib/build/fetch";
import { convertRawScoreBytesToDeckChart, convertRawScoreToDeckChart } from "@/lib/deck/chart-convert";
import { deckDataGap } from "@/lib/deck/data-coverage";
import { defaultDeckGoalInput, type DeckEvent } from "@/lib/deck/goals";
import { adaptData, chartSource, type DeckData } from "@/lib/deck/haneoka/data";
import { adaptRequest, type RecommendationRequest } from "@/lib/deck/haneoka/request";
import {
  buildDeckChartsOverlayUrl,
  buildDeckMasterOverlayUrl,
  resolveLiveDeckRuntimeFallback,
} from "@/lib/deck/runtime-source";
import { DECK_WORKER_PROTOCOL } from "@/lib/deck/worker-protocol";
import { resetMasterDataSnapshotForTests } from "@/lib/masterdata/build-snapshot";
import {
  DECK_CHART_OVERLAY_FORMAT,
  getDeckChartOverlay,
  parseScoreIdList,
  resetDeckChartOverlayCacheForTests,
} from "@/lib/masterdata/deck-charts";
import { getDeckMasterOverlay } from "@/lib/masterdata/deck-master";
import { runtimeChart } from "@/lib/music/gekiso-timing";

const runtimeDir = path.join(import.meta.dir, "..", "public", "deck");
const { createDeckWorkerCore } = (await import(path.join(runtimeDir, "deck-worker-core.mjs"))) as {
  createDeckWorkerCore(platform: Record<string, unknown>): { handle(message: unknown): Promise<void> };
};

function loadSlice(): { rawBytes: Uint8Array; data: DeckData } {
  const rawBytes = new Uint8Array(readFileSync(path.join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  return { rawBytes, data };
}

const originalMasterDataDir = process.env.MOENOTES_MASTERDATA_DIR;
const tempDirs: string[] = [];

afterEach(() => {
  setBuildFetchTransportForTests(undefined);
  resetDeckChartOverlayCacheForTests();
  if (originalMasterDataDir === undefined) {
    delete process.env.MOENOTES_MASTERDATA_DIR;
  } else {
    process.env.MOENOTES_MASTERDATA_DIR = originalMasterDataDir;
  }
  resetMasterDataSnapshotForTests();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

function createSyntheticRawScore(skillTicks: number[] = [480, 960, 1920, 2880, 4320]) {
  return {
    score: {
      events: {
        bpm: [
          { t: 0, bpm: 120 },
          { t: 3840, bpm: 180 },
        ],
        sig: [{ t: 0, sig: [4, 4] }],
        skill: skillTicks,
        fever: [[1440, 3840]],
      },
      notes: [
        { type: "tap", t: 0, pos: 2, size: 4, crit: false },
        { type: "flick", t: 960, pos: 6, size: 4, crit: true, dir: "right" },
        // Long slide from t=1920 (pos=2, size=4) to t=3840 (pos=10, size=8), generating 8th-note combo ticks (op 120/121)
        // whose `by_key` insertion happens when the slide end at t=3840 closes!
        {
          type: "long",
          node: [
            { type: "tap", t: 1920, pos: 2, size: 4, crit: false, ease: "linear", visible: true },
            { type: "tap", t: 3840, pos: 10, size: 8, crit: false, ease: "linear", visible: true },
          ],
        },
        { type: "trace", t: 4800, pos: 4, size: 6, crit: false },
      ],
    },
  };
}

function writeMasterFixtureDir(): { root: string; eventId: number; oldMusicId: number } {
  const root = mkdtempSync(join(tmpdir(), "moenotes-deck-charts-test-"));
  tempDirs.push(root);
  const { data: baseData } = loadSlice();
  const musicIdCol = baseData.master.MasterLiveMusic?.columns.indexOf("_id") ?? 0;
  const eventId = 888;
  const oldMusicId = (baseData.master.MasterLiveMusic?.rows?.[0]?.[musicIdCol] as number | undefined) ?? 100001;

  writeFileSync(
    join(root, "manifest.json"),
    JSON.stringify({
      schemaVersion: 1,
      fetchedAt: "2026-10-27T00:00:00Z",
      dataVersion: "test-v1",
      regions: {
        jp: { version: "1.2.0.10/jp-hash", assetVersion: "1.2.0", requiredTables: 2, availableTables: 2 },
        "hk-tw-mo": { version: "1.2.0.10/tw-hash", assetVersion: "1.2.0", requiredTables: 2, availableTables: 2 },
        kr: { version: "1.2.0.10/kr-hash", assetVersion: "1.2.0", requiredTables: 2, availableTables: 2 },
      },
    }),
  );

  for (const region of ["jp", "hk-tw-mo", "kr"]) {
    const regionDir = join(root, region);
    mkdirSync(regionDir, { recursive: true });
    for (const [tableName, columnar] of Object.entries(baseData.master)) {
      const objects = columnar.rows.map((row) =>
        Object.fromEntries(columnar.columns.map((col, idx) => [col, row[idx]])),
      );
      if (tableName === "MasterLiveMusic") {
        const template = structuredClone(objects[0]!) as Record<string, unknown>;
        objects.push({
          ...template,
          _id: 999,
          _easyID: 9991,
          _normalID: 9992,
          _hardID: 9993,
          _expertID: 9994,
        });
      }
      if (tableName === "MasterEvent") {
        objects.push({
          _id: eventId,
          _nameTextId: 888,
          _startAt: "2026-10-01 00:00:00",
          _endAt: "2026-11-30 23:59:59",
          _displayEndAt: "2026-12-01 23:59:59",
          _eventType: 2,
          _storyChapterId: 0,
          _eventItemId: 0,
          _isRankingDisabled: false,
          _isMusicRankingDisabled: false,
          _isTotalMusicRankingDisabled: false,
          _liveEventRewardGroup: 0,
          _liveEventPointGroup: 0,
          _challengeLiveEventRewardGroup: 0,
          _challengeLiveEventPointGroup: 0,
          _gekisouLiveRankingEventPointGroup: 0,
          _gekisouLiveRankingEventRewardGroup: 0,
          _musicId: 999,
          _imageAsset: "",
          _logoAsset: "",
          _backgroundAsset: "",
          _bannerAsset: "",
          _backgroundVideoAsset: "",
          _carouselHelpId: 0,
        });
      }
      if (tableName === "MasterChallengeMusic") {
        objects.push({
          _id: 777,
          _eventId: eventId,
          _liveMusicId: 999,
          _musicType: 1,
          _gekisouMission1: 0,
          _gekisouMission2: 0,
          _gekisouMission3: 0,
          _rankingRewardGroup: 0,
          _stratAt: "2026-10-01 00:00:00",
          _endAt: "2026-11-30 23:59:59",
        });
      }
      writeFileSync(join(regionDir, `${tableName}.json`), JSON.stringify({ _allData: objects }));
    }
    writeFileSync(
      join(regionDir, "MasterLiveMusicScore.json"),
      JSON.stringify({
        _allData: [
          { _id: 9993, _musicScoreTextFileName: "m999_hard" },
          { _id: 9994, _musicScoreTextFileName: "m999_expert" },
          { _id: 9999, _musicScoreTextFileName: "../blocked" },
        ],
      }),
    );
  }
  return { root, eventId, oldMusicId };
}

describe("Raw score -> DeckChart binary32 & Haneoka runtime_chart parity", () => {
  test("converts raw & gzipped scores with exact BPM timing, combo line interpolation, by_key enumeration, fevers, and 5 skills", async () => {
    const raw = createSyntheticRawScore();
    const chart = convertRawScoreToDeckChart(9994, raw);
    const gekisoRef = runtimeChart(raw);

    // Tick 0..3840 @ 120 BPM = 4000ms; Tick 3840..4800 (960 ticks = 2 beats) @ 180 BPM = 666ms -> maxPosMs = 4666ms -> durationMs = 5666ms.
    expect(chart.scoreId).toBe(9994);
    expect(chart.durationMs).toBe(5666);
    expect(chart.skillEvents.timeMs).toEqual([500, 1000, 2000, 3000, 4333]);
    expect(chart.fevers).toEqual({
      startMs: gekisoRef.feverMs.map(([s]) => s),
      endMs: gekisoRef.feverMs.map(([, e]) => e),
    });

    // Exact 1:1 parity between `chart.enumeration` and `gekiso-timing.ts` `runtimeChart(raw).enumeration`!
    expect(chart.enumeration).toEqual({
      op: gekisoRef.enumeration.map((n) => n.op),
      judgementType: gekisoRef.enumeration.map((n) => n.judgementType),
      timeMs: gekisoRef.enumeration.map((n) => n.timeMs),
    });

    // `notes` is sorted monotonically by `timeMs`, whereas `enumeration` has slide combo ticks appended after slide end (t=3840 -> 4000ms).
    for (let i = 1; i < chart.notes.timeMs.length; i++) {
      expect(chart.notes.timeMs[i]!).toBeGreaterThanOrEqual(chart.notes.timeMs[i - 1]!);
    }
    expect(chart.enumeration.timeMs).not.toEqual(chart.notes.timeMs);

    // Critical flick at t=960 (op=40, crit=true, dir="right"=2) -> judgementAreaOffsetType = 4, direction = 2.
    const flickIdx = chart.notes.op.indexOf(40);
    expect(chart.inputs[flickIdx]).toMatchObject({
      judgementAreaOffsetType: 4,
      lane: 6,
      width: 4,
      direction: 2,
    });

    // Halfway combo tick on the long slide (t=2880 -> 3000ms, halfway between pos 2..10 & size 4..8 -> lane=6, width=6).
    const midComboIdx = chart.notes.timeMs.findIndex((ms, idx) => ms === 3000 && chart.notes.op[idx] === 120);
    expect(midComboIdx).toBeGreaterThanOrEqual(0);
    expect(chart.inputs[midComboIdx]).toEqual({
      judgementAreaOffsetType: 1,
      lane: 6,
      width: 6,
      direction: 0,
      ease: 0,
      easeRight: 0,
      lines: [1],
    });

    // Gzipped asset bytes decode identically.
    const gz = gzipSync(Buffer.from(JSON.stringify(raw), "utf8"));
    const fromGzip = await convertRawScoreBytesToDeckChart(9994, new Uint8Array(gz));
    expect(fromGzip).toEqual(chart);

    // chartSource feeds durationMs, native inputs, and by_key enumeration into Haneoka's WASM load_source.
    const syntheticDeckData: DeckData = {
      format: "nnnotes.deck-data/1",
      provenance: { region: "tw", deck: { commit: "test" }, replay: { musicLengthsMs: {} } },
      master: {},
      charts: [chart],
    };
    const source = chartSource(syntheticDeckData, 9994);
    expect(source.durationMs).toBe(5666);
    expect(source.notes[midComboIdx]).toMatchObject({
      operateType: 120,
      judged: true,
      input: { judgementAreaOffsetType: 1, lane: 6, width: 6 },
    });
  });

  test("rejects unplayable charts missing 5 skill markers or judged notes (matching pt.rs invariants)", () => {
    const missingSkill = createSyntheticRawScore([480, 960, 1920, 2880]);
    expect(() => convertRawScoreToDeckChart(9994, missingSkill)).toThrow(/Unsupported skill event schedule/);
  });
});

describe("/api/v1/meta/deck-charts allowlist, caching, retry & fallback", () => {
  test("hydrates allowlisted scoreIds, caches hits, bypasses negative 404 cache on retry, and falls back kr -> tw", async () => {
    const { root } = writeMasterFixtureDir();
    process.env.MOENOTES_MASTERDATA_DIR = root;
    resetMasterDataSnapshotForTests();

    expect(parseScoreIdList("9994, 9993, 9994, -1, abc, 0")).toEqual([9993, 9994]);

    let hardAvailable = false;
    const requestedUrls: string[] = [];
    const scoreJsonBytes = new TextEncoder().encode(JSON.stringify(createSyntheticRawScore()));

    setBuildFetchTransportForTests(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.includes("/Live/MusicScore/m999_expert/m999_expert.json")) {
        // Simulate KR not having uploaded the chart yet while TW (PRIMARY_SERVER) already has it.
        if (url.includes("/kr/assets/")) return new Response("Not Found", { status: 404 });
        return new Response(scoreJsonBytes, { status: 200, headers: { "content-type": "application/json" } });
      }
      if (url.includes("/Live/MusicScore/m999_hard/m999_hard.json") && hardAvailable) {
        return new Response(scoreJsonBytes, { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("Not Found", { status: 404 });
    });

    // 1. Partial availability: 9994 resolves, 9993 is still 404 -> Route returns Cache-Control: no-store!
    const partialRes = await getDeckChartsRoute(
      new NextRequest("http://localhost:3000/api/v1/meta/deck-charts?server=tw&v=1.2.0&ids=9993,9994,9999"),
    );
    expect(partialRes.status).toBe(200);
    expect(partialRes.headers.get("Cache-Control")).toContain("no-store");
    const partialPayload = await partialRes.json();
    expect(partialPayload.format).toBe(DECK_CHART_OVERLAY_FORMAT);
    expect(partialPayload.charts.map((c: { scoreId: number }) => c.scoreId)).toEqual([9994]);
    expect(partialPayload.musicLengthsMs).toEqual({ "9994": 5666 });
    // Path-traversal entry 9999 (`../blocked`) was never fetched.
    expect(requestedUrls.some((u) => u.includes("blocked"))).toBe(false);

    // 2. Now m999_hard finishes uploading to moenotes-assets; Retry (`retry=1`) bypasses the negative 404 cache!
    hardAvailable = true;
    const withoutRetry = await getDeckChartOverlay("tw", [9993, 9994]);
    expect(withoutRetry.charts.map((c) => c.scoreId)).toEqual([9994]);

    const withRetry = await getDeckChartOverlay("tw", [9993, 9994], { retry: true });
    expect(withRetry.charts.map((c) => c.scoreId)).toEqual([9993, 9994]);

    // 3. Subsequent normal versioned GET when all requested IDs resolve returns private short cache!
    const fullRes = await getDeckChartsRoute(
      new NextRequest("http://localhost:3000/api/v1/meta/deck-charts?server=tw&v=1.2.0&ids=9993,9994"),
    );
    expect(fullRes.headers.get("Cache-Control")).toContain("max-age=60");

    // 4. KR falls back to TW (`PRIMARY_SERVER`) on 404, whereas JP never cross-reads TW.
    const krOverlay = await getDeckChartOverlay("kr", [9994]);
    expect(krOverlay.charts.map((c) => c.scoreId)).toEqual([9994]);
  });
});

describe("End-to-end Worker missing-chart hydration & empty-baseline fallback", () => {
  test("eliminates solver.dataUpdating for new Free Live & Challenge Event songs when music-data.yml lags", async () => {
    const { root, eventId, oldMusicId } = writeMasterFixtureDir();
    process.env.MOENOTES_MASTERDATA_DIR = root;
    resetMasterDataSnapshotForTests();

    const rawScoreBytes = new TextEncoder().encode(JSON.stringify(createSyntheticRawScore()));
    setBuildFetchTransportForTests(async (input) => {
      const url = String(input);
      if (url.includes("/Live/MusicScore/m999_hard/") || url.includes("/Live/MusicScore/m999_expert/")) {
        return new Response(rawScoreBytes, { status: 200 });
      }
      return new Response("Not Found", { status: 404 });
    });

    const masterOverlay = await getDeckMasterOverlay("tw");
    expect(masterOverlay.chartsOverlayUrl).toContain("/api/v1/meta/deck-charts?server=tw");

    const { rawBytes: baseBytes } = loadSlice();
    const baseHashBuf = await crypto.subtle.digest("SHA-256", baseBytes);
    const baseSha256 = [...new Uint8Array(baseHashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    const dummyBytes = new Uint8Array([1, 2, 3, 4]);
    const dummyHashBuf = await crypto.subtle.digest("SHA-256", dummyBytes);
    const dummySha256 = [...new Uint8Array(dummyHashBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

    let capturedMergedData: DeckData | null = null;
    let capturedDatasetId = "";
    const events: Record<string, unknown>[] = [];
    const core = createDeckWorkerCore({
      post: (msg: Record<string, unknown>) => events.push(msg),
      fetch: async (url: string) => {
        if (url === "https://data.example.invalid/deck-data.json") return new Response(baseBytes, { status: 200 });
        if (url === "https://data.example.invalid/engine.wasm" || url === "https://data.example.invalid/engine.js") {
          return new Response(dummyBytes, { status: 200 });
        }
        if (url.startsWith("https://data.example.invalid/api/v1/meta/deck-master")) {
          return new Response(JSON.stringify(masterOverlay), { status: 200 });
        }
        if (url.startsWith("https://data.example.invalid/api/v1/meta/deck-charts")) {
          const parsedUrl = new URL(url);
          const ids = parseScoreIdList(parsedUrl.searchParams.get("ids"));
          const chartOverlay = await getDeckChartOverlay("tw", ids);
          return new Response(JSON.stringify(chartOverlay), { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      },
      loadSolver: async () =>
        class MockDeckSolver {
          datasetId: string;
          constructor(bytes: Uint8Array, options: { datasetId: string }) {
            capturedMergedData = JSON.parse(new TextDecoder().decode(bytes)) as DeckData;
            capturedDatasetId = options.datasetId;
            this.datasetId = options.datasetId;
          }
          capabilities() {
            return JSON.stringify({ scenes: ["free", "event", "challenge", "arena"] });
          }
        },
    });

    await core.handle({
      type: "init",
      protocol: DECK_WORKER_PROTOCOL,
      deckDataUrl: "https://data.example.invalid/deck-data.json",
      deckDataSha256: baseSha256,
      deckDataBytes: baseBytes.byteLength,
      wasmUrl: "https://data.example.invalid/engine.wasm",
      wasmSha256: dummySha256,
      wasmBytes: dummyBytes.byteLength,
      glueUrl: "https://data.example.invalid/engine.js",
      glueSha256: dummySha256,
      glueBytes: dummyBytes.byteLength,
      modelCommit: null,
      masterOverlayUrl: "https://data.example.invalid" + buildDeckMasterOverlayUrl("tw", "1.2.0", undefined, 1),
      chartsOverlayUrl: "https://data.example.invalid" + buildDeckChartsOverlayUrl("tw", "1.2.0", undefined, 1),
    });

    expect(events).toHaveLength(1);
    const ready = events[0] as {
      type: string;
      catalog: Parameters<typeof deckDataGap>[2];
    };
    expect(ready.type).toBe("ready");
    const newMusic = ready.catalog?.musics.find((m) => m.id === 999);
    expect(newMusic?.difficulties).toEqual(["hard", "expert"]);

    const testEvent: DeckEvent = {
      id: eventId,
      name: "Challenge Test Event",
      startAt: "2026-10-01 00:00:00",
      endAt: "2026-11-30 23:59:59",
      itemId: null,
      challengeMusics: [{ id: 777, musicId: 999 }],
    };

    // Both Free Live on new song 999 AND Challenge Event valuation (which inspects Challenge song 999) now pass deckDataGap!
    expect(
      deckDataGap(
        { ...defaultDeckGoalInput("free"), musicId: 999, difficulty: "expert" },
        null,
        ready.catalog,
      ),
    ).toBeNull();

    expect(
      deckDataGap(
        {
          ...defaultDeckGoalInput("eventPoints"),
          venue: "freeLive",
          musicId: oldMusicId,
          difficulty: "expert",
          challengeMusicId: 777,
          rateDifficulty: "expert",
          rewards: {
            ...defaultDeckGoalInput("eventPoints").rewards,
            challengePoints: { kind: "challengeLive" },
          },
        },
        testEvent,
        ready.catalog,
      ),
    ).toBeNull();

    // Verify Haneoka's data & request adapters resolve chartIndex cleanly against the hydrated dataset!
    expect(capturedMergedData).not.toBeNull();
    expect(() => adaptData(capturedMergedData!, capturedDatasetId)).not.toThrow();
    const freeReq: RecommendationRequest = {
      format: "ournotes-deck.recommendation-request/2",
      goal: { kind: "freeLive", musicId: 999, difficulty: "expert" },
      aggregation: "expected",
      k: 1,
    };
    const adapted = adaptRequest(capturedMergedData!, freeReq);
    expect(adapted.charts).toHaveLength(1);
    expect(adapted.charts[0]?.song).toEqual({ songId: 999, difficulty: 3 });
    expect(adapted.charts[0]?.source.durationMs).toBe(5666);
    expect(chartSource(capturedMergedData!, 9994).durationMs).toBe(5666);
  });

  test("resolveLiveDeckRuntimeFallback synthesizes a self-contained runtime when external music-data is unreachable", async () => {
    const jsBytes = new TextEncoder().encode("export class DeckSolver {}");
    const wasmBytes = new Uint8Array([0x00, 0x61, 0x73, 0x6d]);
    const fallback = await resolveLiveDeckRuntimeFallback("jp", {
      engineOverride: {
        model: { commit: "live-test" },
        js: { url: "https://site.example.invalid/solver.mjs" },
        wasm: { url: "https://site.example.invalid/team-engine.wasm" },
      },
      fetch: async (url) => {
        if (url.endsWith("solver.mjs")) return new Response(jsBytes, { status: 200 });
        if (url.endsWith("team-engine.wasm")) return new Response(wasmBytes, { status: 200 });
        return new Response("Not Found", { status: 404 });
      },
    });

    expect(fallback).not.toBeNull();
    expect(fallback!.server).toBe("jp");
    expect(fallback!.modelCommit).toBeNull();
    expect(fallback!.deckData.url.startsWith("data:application/json;base64,")).toBe(true);
  });
});

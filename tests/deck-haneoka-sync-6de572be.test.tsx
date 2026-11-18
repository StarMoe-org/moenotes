import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "@/components/md3/Md3Provider";
import DeckArenaControls from "@/components/deck/DeckArenaControls";
import DeckParkingPanel from "@/components/deck/DeckParkingPanel";
import DeckResult from "@/components/deck/DeckResult";
import { SUPPORTED_LOCALES } from "@/config/locales";
import type { GameSaveTables } from "@/lib/box/game-save";
import { boxAccountJson } from "@/lib/deck/account-envelope";
import { buildTheoreticalMaxBox } from "@/lib/deck/theoretical-box";
import { HaneokaWasm } from "@/lib/deck/haneoka/wasm";
import {
  hasActionableOrderTiming,
  hasAlternateFrameOrigin,
  parseDeckAnswer,
  timingPlanDelta,
} from "@/lib/deck/answer";
import { isValidArenaRule, resolveArenaRule } from "@/lib/deck/arena";
import { toggleLeaderSelection, toggleRequiredSelection } from "@/lib/deck/card-selection";
import { checkGekisoConstraintFeasibility } from "@/lib/deck/feasibility";
import {
  challengeEventMusicType,
  computes,
  defaultDeckGoalInput,
  effectiveAggregation,
  effectiveJustWindowPolicy,
  effectiveMinJustWindowMs,
  parseCapabilities,
  recommendationRequest,
  type DeckEvent,
} from "@/lib/deck/goals";
import type { DeckData } from "@/lib/deck/haneoka/data";
import { adaptRequest, CAPABILITIES, HANEOKA_COMMIT, HANEOKA_PATCH_SHA } from "@/lib/deck/haneoka/request";
import {
  parkingPlan,
  parkingPlaysForDeckData,
  parkingPlaysFromRules,
  scoreRankName,
  settleEventPoints,
  settleEventReward,
} from "@/lib/deck/parking";

const CORE_LOCALES = SUPPORTED_LOCALES.slice(0, 5);

const SAMPLE_EVENT: DeckEvent = {
  id: 50,
  name: "Sync 6de572be Event",
  startAt: "2026/09/01 15:00:00",
  endAt: "2026/09/09 20:59:59",
  itemId: 90,
  challengeMusics: [
    { id: 501, musicId: 1, musicType: 3 },
    { id: 502, musicId: 2, musicType: 3 },
  ],
};

function loadFixtureWithEvent(): {
  data: DeckData;
  bytes: Uint8Array;
  datasetId: string;
  saveTables: GameSaveTables;
  accountJson: string;
} {
  const rawBytes = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  data.master.MasterEvent = {
    columns: ["_id", "_eventType", "_startAt", "_endAt", "_liveEventPointGroup", "_liveEventRewardGroup", "_eventItemId"],
    rows: [[50, 1, "2026/09/01 15:00:00", "2026/09/09 20:59:59", 1, 1, 90]],
  };
  data.master.MasterLiveEventPoint = {
    columns: ["_id", "_group", "_scoreRank", "_value"],
    rows: [
      [1, 1, 2, 100],
      [2, 1, 3, 120],
      [3, 1, 4, 140],
      [4, 1, 5, 160],
      [5, 1, 6, 180],
      [6, 1, 7, 200],
    ],
  };
  data.master.MasterLiveEventReward = {
    columns: ["_id", "_eventGroup", "_scoreRank", "_probability", "_resourceType", "_resourceId", "_resourceCount"],
    rows: [
      [1, 1, 2, 10000, 1, 90, 5],
      [2, 1, 3, 10000, 1, 90, 6],
      [3, 1, 4, 10000, 1, 90, 7],
      [4, 1, 5, 10000, 1, 90, 8],
      [5, 1, 6, 10000, 1, 90, 9],
      [6, 1, 7, 10000, 1, 90, 10],
    ],
  };
  for (const chart of data.charts) {
    chart.notes.judgementType = chart.notes.op.map((op, i) =>
      chart.notes.judgementType[i] === 0 && op === 1 ? 1 : chart.notes.judgementType[i]!,
    );
  }
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const datasetId = createHash("sha256").update(bytes).digest("hex");
  const saveTables: GameSaveTables = {
    server: "jp",
    characters: Array.from({ length: 25 }, (_, i) => String(i + 1)),
    characterRanks: [[1, 0], [2, 1]],
    members: Object.fromEntries([51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map((id) => [String(id), 4])),
    memberLevels: { "4": [[1, 0], [60, 321650]] },
    snaps: { "76": 4 },
    snapLevels: { "4": [[1, 0], [60, 321650]] },
    bandItems: {},
    memories: {},
    musicRanks: {},
  };
  const box = buildTheoreticalMaxBox(
    null,
    "jp",
    {
      members: [51, 52, 53, 54, 55].map((id, idx) => ({ id, rarity: 4, characterId: idx + 1 }) as never),
      snaps: [{ id: 76, rarity: 4 } as never],
    },
    saveTables,
  );
  const accountJson = boxAccountJson({ datasetId, server: "jp" }, box, saveTables, { fallbackBandItems: true });
  return { data, bytes, datasetId, saveTables, accountJson };
}

describe("Haneoka 6de572be sync — optimal timing, partial JUST windows, Arena sections, parking & UI polish", () => {
  test("verifies pinned commit, LF-only patch SHA-256, and capabilities round-trip", () => {
    expect(HANEOKA_COMMIT).toBe("6de572be31b0fd8e4ab50825bd92c81ac625bc78");
    const patchBytes = readFileSync(join(process.cwd(), "patches/haneoka-rewards.patch"));
    expect(patchBytes.includes(13)).toBe(false);
    expect(createHash("sha256").update(patchBytes).digest("hex")).toBe(HANEOKA_PATCH_SHA);

    const parsed = parseCapabilities(JSON.stringify(CAPABILITIES));
    expect(parsed).not.toBeNull();
    expect(parsed?.arenaSections).toBe(true);
    expect(parsed?.justWindowCoverage).toBe(true);
    expect(parsed?.optimalTimingGuide).toBe(true);
    expect(parsed?.gekisoTimingGuide).toBe(true);
    expect(parsed?.eventParking).toBe(true);
  });

  test("HaneokaWasm wires synchronous haneoka_cooperative_clock(0) and handles pointer===0 yield beats safely", async () => {
    const origInstantiate = WebAssembly.instantiate;
    let capturedProgress: ((ptr: number) => void) | undefined;
    const coopCalls: number[] = [];
    const mem = new WebAssembly.Memory({ initial: 1 });
    const writeCString = (ptr: number, text: string) => {
      const encoded = new TextEncoder().encode(text);
      const view = new Uint8Array(mem.buffer);
      view.set(encoded, ptr);
      view[ptr + encoded.length] = 0;
    };
    writeCString(64, JSON.stringify({ hits: [{ key: 42 }] }));

    WebAssembly.instantiate = (async (_bytes: unknown, imports?: WebAssembly.Imports) => {
      capturedProgress = imports?.env?.haneoka_progress as (ptr: number) => void;
      const instance = {
        exports: {
          memory: mem,
          haneoka_cooperative_clock(flag: number) {
            coopCalls.push(flag);
          },
          haneoka_buffer_alloc() {
            return 256;
          },
          haneoka_buffer_free() {},
          haneoka_string_free() {},
          haneoka_context_json() {
            // Emit cooperative yield beat first, then real JSON progress, then C-string result.
            capturedProgress?.(0);
            capturedProgress?.(64);
            writeCString(512, JSON.stringify({ ok: true, data: 7 }));
            return 512;
          },
          haneoka_context_stream_wasm() {
            return 512;
          },
        },
      };
      return { instance, module: {} as WebAssembly.Module } as never;
    }) as typeof WebAssembly.instantiate;

    try {
      const engine = await HaneokaWasm.create(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]));
      expect(engine.supportsCooperativeClock).toBe(true);
      let yields = 0;
      const payloads: Record<string, unknown>[] = [];
      engine.onYield = () => { yields += 1; };
      engine.onProgress = (v) => { payloads.push(v); };
      const out = engine.invoke<{ ok: boolean; data: number }>({ op: "ping" });
      expect(out).toEqual({ ok: true, data: 7 });
      expect(coopCalls).toEqual([0]);
      expect(yields).toBe(1);
      expect(payloads).toEqual([{ hits: [{ key: 42 }] }]);

      // Cooperative mode enables (1) for the call and resets (0) in finally.
      engine.invoke<{ ok: boolean; data: number }>({ op: "ping" }, true, true);
      expect(coopCalls).toEqual([0, 1, 0]);
    } finally {
      WebAssembly.instantiate = origInstantiate;
    }
  });

  test("forwards steady and partial skill-covered JUST window policies across Gekiso score and reward goals", () => {
    const { data } = loadFixtureWithEvent();
    const firstMusicId = data.master.MasterLiveMusic.rows[0]![0] as number;
    const caps = parseCapabilities(JSON.stringify(CAPABILITIES))!;

    const partialInput = {
      ...defaultDeckGoalInput("battle"),
      musicId: firstMusicId,
      justWindowMode: "partial" as const,
      justWindowUnit: "ms" as const,
      justWindowMs: 32,
      justWindowCoveragePercent: 85,
      justWindowDurationSec: 12.5,
      justWindowContinuousSec: 6,
    };
    expect(effectiveMinJustWindowMs(partialInput)).toBe(0);
    expect(effectiveJustWindowPolicy(partialInput)).toEqual({
      minimumMs: 32,
      minCoverage: 0.85,
      minDurationMs: 12500,
      minContinuousMs: 6000,
    });
    expect(computes(caps, partialInput)).toBe(true);
    expect(computes({ ...caps, justWindowCoverage: false }, partialInput)).toBe(false);

    const reqText = recommendationRequest(partialInput, {
      event: null,
      now: Date.parse("2026-09-05T00:00:00Z"),
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
    });
    const adaptedScore = adaptRequest(data, JSON.parse(reqText));
    expect(adaptedScore.goal.kind).toBe("gekiso");
    if (adaptedScore.goal.kind === "gekiso") {
      expect(adaptedScore.goal.justWindow).toEqual({
        minimumMs: 32,
        minCoverage: 0.85,
        minDurationMs: 12500,
        minContinuousMs: 6000,
        partial: true,
      });
      expect("minJustWindowMs" in adaptedScore.goal).toBe(false);
    }

    const rewardInput = {
      ...partialInput,
      goal: "eventPoints" as const,
      venue: "battleLive" as const,
      boosts: 3,
    };
    const rewardReq = recommendationRequest(rewardInput, {
      event: SAMPLE_EVENT,
      now: Date.parse("2026-09-05T00:00:00Z"),
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
    });
    const adaptedReward = adaptRequest(data, JSON.parse(rewardReq));
    expect(adaptedReward.goal.kind).toBe("event");
    if (adaptedReward.goal.kind === "event" && "gekiso" in adaptedReward.goal) {
      expect(adaptedReward.goal.gekiso?.justWindow).toEqual({
        minimumMs: 32,
        minCoverage: 0.85,
        minDurationMs: 12500,
        minContinuousMs: 6000,
        partial: true,
      });
    }

    // Off mode omits both fields even if a prior ms target sits in state.
    expect(effectiveMinJustWindowMs({ ...partialInput, justWindowMode: "off" })).toBe(0);
    expect(effectiveJustWindowPolicy({ ...partialInput, justWindowMode: "off" })).toBeNull();

    // Reject partial JUST windows on non-Gekiso goals and invalid coverage fractions.
    expect(() =>
      adaptRequest(data, {
        format: "ournotes-deck.recommendation-request/2",
        goal: {
          kind: "freeLive",
          musicId: firstMusicId,
          difficulty: "expert",
          accuracy: { greatFraction: 0 },
          justWindow: { minimumMs: 30, minCoverage: 0.5 },
        },
        metric: { kind: "score" },
        k: 1,
      }),
    ).toThrow("haneoka-just-window");
    expect(() =>
      adaptRequest(data, {
        format: "ournotes-deck.recommendation-request/2",
        goal: {
          kind: "battleLive",
          musicId: firstMusicId,
          difficulty: "expert",
          accuracy: { greatFraction: 0, justFraction: 1 },
          justWindow: { minimumMs: 30, minCoverage: 1.2 },
        },
        metric: { kind: "score" },
        k: 1,
      }),
    ).toThrow("haneoka-just-window-coverage");

    // Feasibility guard catches continuous > duration.
    expect(
      checkGekisoConstraintFeasibility({
        box: null,
        memberCatalog: new Map(),
        constraints: { includeMembers: [], excludeMembers: [] },
        justWindowPolicy: { minimumMs: 30, minCoverage: 0.8, minDurationMs: 5000, minContinuousMs: 8000 },
      }),
    ).toEqual({ code: "invalid_just_window_coverage" });
  });

  test("supports Gekiso Arena section-priority search with maxBaseLoss and rejects rewards/maximum", () => {
    const { data } = loadFixtureWithEvent();
    const firstMusicId = data.master.MasterLiveMusic.rows[0]![0] as number;
    const caps = parseCapabilities(JSON.stringify(CAPABILITIES))!;

    const { rule } = resolveArenaRule({
      catalog: null,
      ruleSource: "custom",
      leagueId: 1,
      customBandId: 1,
      customMusicType: 2,
      customMissions: [1, 2, 3],
      mode: "shared",
      objective: "sections",
      maxBaseLossPercent: 4.5,
      now: Date.parse("2026-09-05T00:00:00Z"),
    });
    expect(rule).toEqual({
      bandId: 1,
      musicType: 2,
      missions: [1, 2, 3],
      mode: "shared",
      objective: "sections",
      maxBaseLoss: 0.045,
    });
    expect(isValidArenaRule(rule)).toBe(true);
    expect(isValidArenaRule({ ...rule!, maxBaseLoss: 1.5 })).toBe(false);

    const arenaInput = {
      ...defaultDeckGoalInput("arena"),
      aggregation: "maximum" as const,
      musicId: firstMusicId,
      arenaRule: { ...rule!, mode: "individual" as const },
      arenaSongEntries: [{ musicId: firstMusicId, difficulty: "expert" as const }],
    };
    expect(effectiveAggregation(arenaInput)).toBe("expected");
    expect(computes(caps, arenaInput)).toBe(true);
    expect(computes({ ...caps, arenaSections: false }, arenaInput)).toBe(false);

    const reqText = recommendationRequest(arenaInput, {
      event: null,
      now: Date.parse("2026-09-05T00:00:00Z"),
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
    });
    const adapted = adaptRequest(data, JSON.parse(reqText));
    expect(adapted.goal.kind).toBe("gekiso");
    if (adapted.goal.kind === "gekiso") {
      expect(adapted.goal.arena).toEqual({
        bandId: 1,
        musicType: 2,
        missions: [1, 2, 3],
        mode: "individual",
        objective: "sections",
        maxBaseLoss: 0.045,
      });
    }

    // Default maxBaseLoss = 0.03 when omitted; reject on maximum aggregation.
    const defaultAdapted = adaptRequest(data, {
      format: "ournotes-deck.recommendation-request/2",
      goal: {
        kind: "arenaLive",
        arena: { bandId: 1, musicType: 0, missions: [0, 0, 0], mode: "individual", objective: "sections" },
        musicId: firstMusicId,
        difficulty: "expert",
        accuracy: { greatFraction: 0, justFraction: 1 },
      },
      metric: { kind: "score" },
      k: 3,
    });
    if (defaultAdapted.goal.kind === "gekiso") {
      expect(defaultAdapted.goal.arena?.maxBaseLoss).toBe(0.03);
    }
    expect(() =>
      adaptRequest(data, {
        format: "ournotes-deck.recommendation-request/2",
        aggregation: "maximum",
        goal: {
          kind: "arenaLive",
          arena: { bandId: 1, musicType: 0, missions: [0, 0, 0], mode: "individual", objective: "sections" },
          musicId: firstMusicId,
          difficulty: "expert",
          accuracy: { greatFraction: 0, justFraction: 1 },
        },
        metric: { kind: "score" },
        k: 3,
      }),
    ).toThrow("haneoka-arena-sections");
  });

  test("resolves challenge event attribute and auto-selects pinned leader in constraints", () => {
    expect(challengeEventMusicType(SAMPLE_EVENT)).toBe(3);
    expect(
      challengeEventMusicType({
        challengeMusics: [
          { id: 1, musicId: 10, musicType: 1 },
          { id: 2, musicId: 11, musicType: 2 },
        ],
      }),
    ).toBe(0);
    expect(challengeEventMusicType({ challengeMusics: [{ id: 1, musicId: 10 }] })).toBe(0);

    // Pinning an unselected or excluded card promotes it to Leader + Required.
    const pinned = toggleLeaderSelection({ leaderKey: null, required: ["c2"], excluded: ["c1", "c3"] }, "c1");
    expect(pinned).toEqual({ leaderKey: "c1", required: ["c2", "c1"], excluded: ["c3"] });

    // Unpinning Leader keeps the member selected in Required.
    const unpinned = toggleLeaderSelection(pinned, "c1");
    expect(unpinned).toEqual({ leaderKey: null, required: ["c2", "c1"], excluded: ["c3"] });

    // Removing the active Leader from Required also clears leaderKey.
    const removed = toggleRequiredSelection(pinned, "c1");
    expect(removed).toEqual({ leaderKey: null, required: ["c2"] });
  });

  test("computes exact Int32/Int64 event settlements and modular-lattice PT parking plans", () => {
    // 100 base PT, +150.00% bonus (15000 bp), 5x boost -> trunc(100 * 25000 * 5 / 10000) = 1250
    expect(settleEventPoints(100, 15000, 5)).toBe(1250);
    // Non-exact fraction floors toward zero: 103 * 12300 * 1 / 10000 = 126.69 -> 126
    expect(settleEventPoints(103, 2300, 1)).toBe(126);
    expect(settleEventReward(5, 15000, 5, 2)).toBe(64);
    expect(scoreRankName(7)).toBe("SS");

    const plays = parkingPlaysFromRules({
      route: "live",
      challenge: false,
      consumption: 3,
      bonusBp: 5000, // 1.5x
      scoreMin: 850_000,
      scoreMax: 950_000,
      basePointsByRank: new Map([
        [5, 100], // 150 PT @ 0 boost
        [6, 120], // 180 PT @ 0 boost
        [7, 150], // 225 PT @ 0 boost
      ]),
      cpByRank: new Map([[5, 20], [6, 25], [7, 30]]),
      boostRates: new Map([[0, 1], [1, 5], [2, 10], [3, 15]]),
      rankThresholds: [
        { rank: 5, required: 500_000 },
        { rank: 6, required: 700_000 },
        { rank: 7, required: 900_000 },
      ],
      includeAllBoosts: true,
    });
    expect(plays.length).toBeGreaterThan(0);

    // Exact target reachable via 225 (0b, SS) + 1125 (1b, SS) = 1350.
    const exactRes = parkingPlan(1350, plays);
    expect(exactRes.exact).not.toBeNull();
    expect(exactRes.exact!.points).toBe(1350);
    expect(exactRes.exact!.steps.reduce((s, st) => s + st.count * st.play.points, 0)).toBe(1350);

    // Unreachable target when all coin values are multiples of 15.
    const missRes = parkingPlan(1357, plays);
    expect(missRes.exact).toBeNull();
    expect(missRes.below.points).toBeLessThan(1357);
    expect(missRes.above).not.toBeNull();
    expect(missRes.above!.points).toBeGreaterThan(1357);

    // Large target exercise through the modular Dijkstra lattice branch.
    const largeTarget = 225 * 400 + 180 * 3;
    const largeRes = parkingPlan(largeTarget, plays);
    expect(largeRes.exact?.points).toBe(largeTarget);

    // DeckData extraction against MasterLiveScoreRank.
    const { data } = loadFixtureWithEvent();
    const dataPlays = parkingPlaysForDeckData(data, {
      eventId: 50,
      songId: data.master.MasterLiveMusic.rows[0]![0] as number,
      route: "live",
      challenge: false,
      consumption: 1,
      bonusBp: 2000,
      scoreMin: 500_000,
      scoreMax: 1_500_000,
      includeAllBoosts: true,
    });
    expect(dataPlays.length).toBeGreaterThan(0);
  });

  test("parses and renders optimal timing, Gekiso guide, partial JUST window, Arena sections, and Parking across all 5 core locales", () => {
    const raw = {
      format: "ournotes-deck.account-recommendation/1",
      final: true,
      status: "ok",
      missing: [],
      errors: [],
      result: {
        phase: "done",
        elapsedMs: 38,
        optimality: { proven: false, lowerBound: 1280000, upperBound: null, fraction: null },
        account: { cards: { coversAllOwnedCards: true } },
        metric: { kind: "score" },
        aggregation: "expected",
        goal: { kind: "arenaLive" },
        exitReason: "completed",
        teams: [
          {
            rank: 1,
            rankCertified: false,
            leader: { member: 51, snap: 76 },
            others: [
              { member: 52, snap: null },
              { member: 53, snap: null },
              { member: 54, snap: null },
              { member: 55, snap: null },
            ],
            power: 280000,
            bonusPercent: 140,
            value: { score: 1280000, exact: null, interval: null, payoff: null },
            orders: {
              count: 120,
              min: { score: 1210000, order: [51, 52, 53, 54, 55] },
              median: { score: 1250000, order: [51, 52, 53, 54, 55] },
              max: { score: 1295000, order: [51, 52, 53, 54, 55] },
            },
            bestOrder: { score: 1295000, order: [51, 52, 53, 54, 55] },
            sectionPerformance: {
              versus: false,
              sampled: false,
              ranges: [0.92, 0.85, 0.96],
              baseMean: 1180000,
              referenceBaseMean: 1200000,
              bonusMean: 100000,
              totalMean: 1280000,
              maxBaseLoss: 0.03,
              allWin: 0.75,
            },
            justWindow: {
              beforeMs: 25,
              afterMs: 30,
              meetsTarget: true,
              coverage: {
                targetMs: 35,
                plays: 120,
                ranges: [
                  { notes: 80, coveredNotes: 72, minimumCoveredNotes: 68, coverage: 0.9, minimumCoverage: 0.85, durationMs: 14000, coveredMs: 12600, minimumCoveredMs: 12000, longestMs: 9000, minimumLongestMs: 8500, peakMs: 40, minimumPeakMs: 38 },
                  { notes: 90, coveredNotes: 81, minimumCoveredNotes: 76, coverage: 0.9, minimumCoverage: 0.844, durationMs: 15000, coveredMs: 13200, minimumCoveredMs: 12400, longestMs: 9500, minimumLongestMs: 8800, peakMs: 40, minimumPeakMs: 38 },
                  { notes: 100, coveredNotes: 92, minimumCoveredNotes: 88, coverage: 0.92, minimumCoverage: 0.88, durationMs: 16000, coveredMs: 14500, minimumCoveredMs: 13800, longestMs: 10200, minimumLongestMs: 9600, peakMs: 42, minimumPeakMs: 40 },
                ],
              },
            },
            timing: {
              order: [51, 52, 53, 54, 55],
              score: 1295000,
              planBaseScore: 1294000,
              frameOriginMs: 8.33,
              best: 1302500,
              worst: 1288000,
              optimal: 1302500,
              guideAvailable: true,
              planIsOptimal: true,
              advanceMs: 17,
              windows: [
                {
                  event: 1,
                  member: 52,
                  startMs: 15000,
                  endMs: 21000,
                  unit: 5,
                  notes: [15500, 16800, 18200],
                  steps: [
                    {
                      step: 1,
                      timeMs: 16800,
                      notes: 2,
                      noteIndices: [42, 43],
                      noteTimesMs: [16800, 16800],
                      inputTimesMs: [16783, 16783],
                      inputKinds: ["flick", "hit"],
                      deliveryTimesMs: [16800, 16800],
                      gain: 8500,
                    },
                  ],
                },
              ],
            },
            gekisoGuide: {
              order: [51, 52, 53, 54, 55],
              frameRate: 60,
              score: 1295000,
              best: 1304000,
              actions: [
                {
                  kind: "skill",
                  event: 2,
                  member: 53,
                  range: 1,
                  timeMs: 42150,
                  noteIndices: [120, 121],
                  noteTimesMs: [42150, 42150],
                  inputTimesMs: [42130, 42130],
                  included: true,
                  gain: 9000,
                  comboGain: 2,
                },
              ],
            },
            parking: {
              plays: [{ rank: 7, points: 225, scoreMin: 900000, scoreMax: 1500000, boosts: 0, cpCost: 0, cpGain: 30 }],
              allBoostPlays: [
                { rank: 7, points: 225, scoreMin: 900000, scoreMax: 1500000, boosts: 0, cpCost: 0, cpGain: 30 },
                { rank: 7, points: 1125, scoreMin: 900000, scoreMax: 1500000, boosts: 1, cpCost: 0, cpGain: 150 },
              ],
            },
            layout: { members: [52, 53, 51, 54, 55], snaps: [null, null, 76, null, null] },
          },
        ],
      },
    };

    const parsed = parseDeckAnswer(JSON.stringify(raw));
    const team = parsed.result!.teams[0]!;
    expect(timingPlanDelta(team.timing!)).toBe(8500);
    expect(hasAlternateFrameOrigin(team.timing!)).toBe(true);
    expect(hasActionableOrderTiming(team.timing)).toBe(true);
    expect(team.timing?.planIsOptimal).toBe(true);
    expect(team.timing?.windows[0]?.steps[0]?.inputKinds).toEqual(["flick", "hit"]);
    expect(team.gekisoGuide?.actions.length).toBe(1);
    expect(team.justWindow?.coverage?.ranges.length).toBe(3);
    expect(team.sectionPerformance?.ranges).toEqual([0.92, 0.85, 0.96]);
    expect(team.parking?.allBoostPlays?.length).toBe(2);

    for (const locale of CORE_LOCALES) {
      const html = renderToStaticMarkup(
        <Md3Provider>
          <DeckResult
            locale={locale}
            job={{ status: "done", answer: parsed, stale: false }}
            box={null}
            catalog={{ members: [], snaps: [] }}
            goal="arena"
            canContinue={false}
            onContinue={() => {}}
            onStop={() => {}}
            onRetry={() => {}}
            onOpenBox={() => {}}
          />
          <DeckParkingPanel locale={locale} parking={team.parking!} />
          <DeckArenaControls
            locale={locale}
            catalog={{ seasons: [], leagues: [{ id: 1, bandId: 1 }], regulations: [] }}
            period={{ season: null, regulation: null, nextAt: null }}
            rule={{ bandId: 1, musicType: 0, missions: [0, 0, 0], mode: "shared", objective: "sections", maxBaseLoss: 0.03 }}
            ruleSource="custom"
            leagueId={1}
            customBandId={1}
            customMusicType={0}
            customMissions={[0, 0, 0]}
            mode="shared"
            canChooseMode
            objective="sections"
            maxBaseLossPercent={3}
            canChooseObjective
            allSongs={false}
            entries={[]}
            eligibleSongs={[]}
            bandNames={new Map([[1, "MyGO!!!!!"]])}
            formatEnd={(d) => d}
            onRuleSourceChange={() => {}}
            onLeagueChange={() => {}}
            onCustomBandChange={() => {}}
            onCustomMusicTypeChange={() => {}}
            onCustomMissionChange={() => {}}
            onModeChange={() => {}}
            onObjectiveChange={() => {}}
            onMaxBaseLossPercentChange={() => {}}
            onEntriesChange={() => {}}
            onOpenSongPicker={() => {}}
          />
        </Md3Provider>,
      );
      expect(html).toContain("deck-section-performance");
      expect(html).toContain("deck-just-window");
      expect(html).toContain("deck-gekiso-guide");
      expect(html).toContain("deck-parking-panel");
      expect(html).toContain("+8.3");
      expect(html).toContain("92.0%");
    }
  });

  const wasmPath = join(process.cwd(), "public/haneoka-team-engine/team-engine.wasm");
  const solverPath = join(process.cwd(), "public/haneoka-team-engine/solver.mjs");
  const runLiveWasm = existsSync(wasmPath) && existsSync(solverPath);

  (runLiveWasm ? test : test.skip)(
    "live WASM end-to-end: cooperative clock ABI, timing guide, partial JUST window, Arena sections, and Moenotes rewards",
    async () => {
      const mod = (await import(pathToFileURL(solverPath).href)) as {
        default: (options: { module_or_path: Uint8Array }) => Promise<void>;
        DeckSolver: new (bytes: Uint8Array, options: { datasetId: string }) => {
          datasetId: string;
          capabilities(): string;
          recommend(
            account: string,
            request: string,
            progress?: (json: string) => void,
            intervalMs?: number,
          ): string;
          evaluateGrowth(account: string, request: string, teamJson: string): string;
          free(): void;
        };
      };
      const wasmBytes = new Uint8Array(readFileSync(wasmPath));
      await mod.default({ module_or_path: wasmBytes });
      const { data, bytes, datasetId, accountJson } = loadFixtureWithEvent();
      const firstMusicId = data.master.MasterLiveMusic.rows[0]![0] as number;
      const justMusicId = (data.master.MasterLiveMusic.rows[1]?.[0] as number | undefined) ?? firstMusicId;
      const solver = new mod.DeckSolver(bytes, { datasetId });
      try {
        expect(solver.datasetId).toBe(datasetId);
        const caps = parseCapabilities(solver.capabilities());
        expect(caps?.arenaSections).toBe(true);
        expect(caps?.justWindowCoverage).toBe(true);
        expect(caps?.optimalTimingGuide).toBe(true);
        expect(caps?.gekisoTimingGuide).toBe(true);
        expect(caps?.eventParking).toBe(true);

        // 1. Free Live score + optimal timing enrichment
        const freeAns = parseDeckAnswer(
          solver.recommend(
            accountJson,
            JSON.stringify({
              format: "ournotes-deck.recommendation-request/2",
              goal: { kind: "freeLive", musicId: firstMusicId, difficulty: "expert", accuracy: { greatFraction: 0 } },
              metric: { kind: "score" },
              k: 3,
              limits: { timeLimitMs: 15000 },
            }),
          ),
        );
        expect(freeAns.status).toBe("ok");
        expect(freeAns.engine?.commit).toBe(HANEOKA_COMMIT);
        expect(freeAns.result!.teams.length).toBeGreaterThan(0);

        // 2. Battle Live Gekiso on JUST-mission song with partial JUST window policy + Gekiso guide
        const battleAns = parseDeckAnswer(
          solver.recommend(
            accountJson,
            JSON.stringify({
              format: "ournotes-deck.recommendation-request/2",
              goal: {
                kind: "battleLive",
                musicId: justMusicId,
                difficulty: "expert",
                rank: 1,
                justWindow: { minimumMs: 2, minCoverage: 0.5, minDurationMs: 0, minContinuousMs: 0 },
                accuracy: { greatFraction: 0, justFraction: 1 },
              },
              metric: { kind: "score" },
              k: 3,
              limits: { timeLimitMs: 15000 },
            }),
          ),
        );
        expect(battleAns.status).toBe("ok");
        expect(battleAns.result!.teams.length).toBeGreaterThan(0);
        expect(battleAns.result!.teams[0]?.justWindow?.meetsTarget).toBe(true);
        expect(battleAns.result!.teams[0]?.justWindow?.coverage?.ranges[0]?.notes).toBeGreaterThan(0);

        // 3. Arena Live section-priority objective (reference hit stripped, sectionPerformance populated, growth valid)
        const arenaReq = JSON.stringify({
          format: "ournotes-deck.recommendation-request/2",
          goal: {
            kind: "arenaLive",
            arena: {
              bandId: 1,
              musicType: 0,
              missions: [1, 3, 1],
              mode: "individual",
              objective: "sections",
              maxBaseLoss: 0.05,
            },
            musicId: firstMusicId,
            difficulty: "expert",
            rank: 1,
            accuracy: { greatFraction: 0, justFraction: 1 },
          },
          metric: { kind: "score" },
          k: 3,
          limits: { timeLimitMs: 15000 },
        });
        const arenaAns = parseDeckAnswer(solver.recommend(accountJson, arenaReq));
        expect(arenaAns.status).toBe("ok");
        expect(arenaAns.result!.teams.length).toBeGreaterThan(0);
        {
          const t0 = arenaAns.result!.teams[0]!;
          expect(t0.sectionPerformance).toBeDefined();
          expect(t0.value?.score).toBeCloseTo(t0.sectionPerformance!.totalMean, 2);
          const growth = JSON.parse(
            solver.evaluateGrowth(
              accountJson,
              arenaReq,
              JSON.stringify({
                members: [t0.leader.member, ...t0.others.map((o) => o.member)],
                snaps: [t0.leader.snap, ...t0.others.map((o) => o.snap)],
                song: { musicId: firstMusicId, difficulty: "expert" },
              }),
            ),
          ) as { status: string };
          expect(growth.status).toBe("ok");
        }

        // 4. Moenotes event PT on JUST-mission song + partial JUST window + attached parking plays
        const eventReqText = recommendationRequest(
          {
            ...defaultDeckGoalInput("eventPoints"),
            venue: "battleLive",
            musicId: justMusicId,
            difficulty: "expert",
            boosts: 1,
            justWindowMode: "partial",
            justWindowUnit: "ms",
            justWindowMs: 2,
            justWindowCoveragePercent: 50,
          },
          {
            event: SAMPLE_EVENT,
            now: Date.parse("2026-09-05T00:00:00Z"),
            constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
          },
        );
        const eventAns = parseDeckAnswer(solver.recommend(accountJson, eventReqText));
        expect(eventAns.status).toBe("ok");
        expect(eventAns.result!.teams.length).toBeGreaterThan(0);
        expect(eventAns.result!.teams[0]?.value?.payoff?.score).toBeGreaterThan(0);
        expect(eventAns.result!.teams[0]?.justWindow?.meetsTarget).toBe(true);
        expect(eventAns.result!.teams[0]?.parking?.plays.length).toBeGreaterThan(0);
      } finally {
        solver.free();
      }
    },
    { timeout: 60_000 },
  );
});

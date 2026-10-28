import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckResult from "../src/components/deck/DeckResult";
import DeckArenaControls from "../src/components/deck/DeckArenaControls";
import DeckGoalConditions from "../src/components/deck/DeckGoalConditions";
import DeckWorkspace from "../src/components/deck/DeckWorkspace";
import { GameSaveBanner, StarMoeBoxTokenNotice } from "../src/components/box/GameSave";
import { Md3Provider } from "../src/components/md3/Md3Provider";
import { STARMOE_BOX_APP } from "../src/config/account";
import {
  activeSongRules, arenaPeriod, arenaSongMatchesBand, effectiveArenaSongRule, isValidArenaRule, isValidSongRules, resolveArenaRule,
  type DeckArenaCatalog, type DeckArenaRule,
} from "../src/lib/deck/arena";
import {
  computes, defaultDeckGoalInput, goalGap, parseCapabilities, recommendationRequest, type DeckGoalInput,
} from "../src/lib/deck/goals";
import { deckDataGap, type DeckDataCatalog } from "../src/lib/deck/data-coverage";
import { parseDeckAnswer } from "../src/lib/deck/answer";
import { adaptData, type DeckData } from "../src/lib/deck/haneoka/data";
import { adaptAccount, type AccountInput } from "../src/lib/deck/haneoka/account";
import {
  adaptRequest, CAPABILITIES, HANEOKA_COMMIT, HANEOKA_PATCH_SHA, type RecommendationRequest,
} from "../src/lib/deck/haneoka/request";
import { parseMasterDate } from "../src/lib/schedule";

const SAMPLE_CATALOG: DeckArenaCatalog = {
  seasons: [
    { id: 1, name: "第1赛季", startAt: "2026/10/28 0:00:00", endAt: "2026/11/28 14:59:58" },
  ],
  leagues: [
    { id: 1, bandId: 1 },
    { id: 2, bandId: 2 },
    { id: 3, bandId: 3 },
    { id: 4, bandId: 4 },
    { id: 5, bandId: 5 },
  ],
  regulations: [
    {
      id: 1, seasonId: 1, leagueId: 1, musicType: 0, missions: [2, 2, 2],
      startAt: "2026/10/28 0:00:00", endAt: "2026/11/04 14:59:59",
    },
    {
      id: 2, seasonId: 1, leagueId: 1, musicType: 3, missions: [1, 3, 1],
      startAt: "2026/11/04 15:00:00", endAt: "2026/11/11 14:59:59",
    },
  ],
};

function loadReal110Slice(): { rawBytes: Uint8Array; data: DeckData; datasetId: string } {
  const rawBytes = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  const datasetId = createHash("sha256").update(rawBytes).digest("hex");
  return { rawBytes, data, datasetId };
}

describe("1.1.0.100 Gekiso Arena schedule and regulations", () => {
  test("resolves active JST regulations, nextAt boundaries, and custom rule overrides", () => {
    const beforeSeason = parseMasterDate("2026/10/27 23:00:00")!;
    const pre = arenaPeriod(SAMPLE_CATALOG, 1, beforeSeason);
    expect(pre.season).toBeNull();
    expect(pre.regulation).toBeNull();
    expect(pre.nextAt).toBe(parseMasterDate("2026/10/28 0:00:00"));

    const duringReg1 = parseMasterDate("2026/10/28 12:00:00")!;
    const auto1 = resolveArenaRule({
      catalog: SAMPLE_CATALOG,
      ruleSource: "auto",
      leagueId: 1,
      customBandId: 3,
      customMusicType: 2,
      customMissions: [1, 1, 1],
      mode: "shared",
      now: duringReg1,
    });
    expect(auto1.rule).toEqual({
      bandId: 1,
      musicType: 0,
      missions: [2, 2, 2],
      mode: "shared",
    });
    expect(auto1.period.nextAt).toBe(parseMasterDate("2026/11/04 15:00:00"));

    const duringReg2 = parseMasterDate("2026/11/05 12:00:00")!;
    const auto2 = resolveArenaRule({
      catalog: SAMPLE_CATALOG,
      ruleSource: "auto",
      leagueId: 1,
      customBandId: 1,
      customMusicType: 0,
      customMissions: [0, 0, 0],
      mode: "individual",
      now: duringReg2,
    });
    expect(auto2.rule).toEqual({
      bandId: 1,
      musicType: 3,
      missions: [1, 3, 1],
      mode: "individual",
    });

    const custom = resolveArenaRule({
      catalog: SAMPLE_CATALOG,
      ruleSource: "custom",
      leagueId: 1,
      customBandId: 4,
      customMusicType: 99,
      customMissions: [0, 2, 3],
      mode: "shared",
      now: beforeSeason,
    });
    expect(custom.rule).toEqual({
      bandId: 4,
      musicType: 99,
      missions: [0, 2, 3],
      mode: "shared",
    });
    expect(isValidArenaRule(custom.rule)).toBe(true);
    expect(isValidArenaRule({ bandId: 9, musicType: 0, missions: [0, 0, 0], mode: "shared" })).toBe(false);
  });

  test("matches band songs via _bandId or multi-band _bandIds, filters unreleased songs, and computes effective song rules", () => {
    const now = parseMasterDate("2026/10/28 12:00:00")!;
    expect(arenaSongMatchesBand({ bandId: 1, bandIds: [], startAt: "2026/10/01 0:00:00" }, 1, now)).toBe(true);
    expect(arenaSongMatchesBand({ bandId: 2, bandIds: [], startAt: "2026/10/01 0:00:00" }, 1, now)).toBe(false);
    expect(arenaSongMatchesBand({ bandId: 0, bandIds: [1, 3], startAt: "2026/10/01 0:00:00" }, 3, now)).toBe(true);
    expect(arenaSongMatchesBand({ bandId: 1, bandIds: [], startAt: "2026/12/01 0:00:00" }, 1, now)).toBe(false);

    const song = { musicType: 2, gekisouMissions: [1, 3, 1] };
    expect(effectiveArenaSongRule(song, { bandId: 1, musicType: 0, missions: [0, 2, 0], mode: "shared" }))
      .toEqual({ musicType: 2, missions: [1, 2, 1] });
    expect(effectiveArenaSongRule(song, { bandId: 1, musicType: 99, missions: [0, 0, 0], mode: "shared" }))
      .toEqual({ musicType: 99, missions: [1, 3, 1] });
  });
});

describe("Arena goals, placement, constraints and data coverage", () => {
  const sharedRule: DeckArenaRule = { bandId: 1, musicType: 0, missions: [2, 2, 2], mode: "shared" };
  const individualRule: DeckArenaRule = { bandId: 1, musicType: 2, missions: [1, 3, 1], mode: "individual" };

  test("builds shared and individual Arena recommendation requests, Gekisou placement, leader and noSnaps", () => {
    const base = defaultDeckGoalInput("arena");
    expect(goalGap({ ...base, arenaRule: null, arenaSongEntries: [{ musicId: 101, difficulty: "expert" }] }, null)).toBe("arenaSchedule");
    expect(goalGap({ ...base, arenaRule: sharedRule, arenaSongEntries: [] }, null)).toBe("arenaSong");

    const sharedInput: DeckGoalInput = {
      ...base,
      arenaRule: sharedRule,
      arenaSongEntries: [
        { musicId: 101, difficulty: "expert" },
        { musicId: 102, difficulty: "hard" },
      ],
      gekisouRank: 3,
      aggregation: "maximum",
    };
    expect(goalGap(sharedInput, null)).toBeNull();
    expect(computes(CAPABILITIES, sharedInput)).toBe(true);

    const sharedReq = JSON.parse(recommendationRequest(sharedInput, {
      event: null,
      now: 1_760_000_000_000,
      constraints: { leader: "1001", includeMembers: ["1001", "1002"], excludeMembers: [], excludeSnaps: [], noSnaps: true },
    }));
    expect(sharedReq.aggregation).toBeUndefined();
    expect(sharedReq.goal).toMatchObject({
      kind: "arenaLive",
      rank: 3,
      arena: sharedRule,
      songs: [
        { musicId: 101, difficulty: "expert" },
        { musicId: 102, difficulty: "hard" },
      ],
    });
    expect(sharedReq.constraints).toEqual({
      leader: 1001,
      includeMembers: [1001, 1002],
      excludeMembers: [],
      excludeSnaps: [],
      noSnaps: true,
    });

    const allSongsInput: DeckGoalInput = {
      ...base,
      allSongs: true,
      difficulty: "expert",
      arenaRule: individualRule,
      arenaSongEntries: [],
    };
    const allSongsReq = JSON.parse(recommendationRequest(allSongsInput, {
      event: null,
      now: 1_760_000_000_000,
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
    }, {
      songScope: { field: "musicIds", ids: [101, 102] },
    }));
    expect(allSongsReq.goal).toMatchObject({
      kind: "arenaLive",
      rank: 1,
      arena: individualRule,
      difficulty: "expert",
      musicIds: [101, 102],
    });
  });

  test("applies Arena mission overrides when checking LUCK and Great conversion data coverage", () => {
    const catalog: DeckDataCatalog = {
      eventIds: [],
      eventItemRewards: [],
      musics: [
        { id: 101, difficulties: ["expert"], hasLuck: false },
        { id: 102, difficulties: ["expert"], hasLuck: true },
      ],
      challengeMusics: [],
      arenaMusics: [],
    };
    const base = defaultDeckGoalInput("arena");
    const tripleLuckInput: DeckGoalInput = {
      ...base,
      arenaRule: sharedRule,
      arenaSongEntries: [{ musicId: 101, difficulty: "expert" }],
      greatPercent: 10,
    };
    const noLuckGreatCap = { luckMissions: true, luckGreatConversions: false };
    // Song 101 has no LUCK natively, but [2, 2, 2] overrides it to LUCK -> blocks Great > 0 when LUCK Great conversion is unsupported, while Haneoka CAPABILITIES allows it.
    expect(deckDataGap(tripleLuckInput, null, catalog, [], { luckMissions: false, luckGreatConversions: false })).toBe("luck");
    expect(deckDataGap(tripleLuckInput, null, catalog, [], noLuckGreatCap)).toBe("luckGreat");
    expect(deckDataGap(tripleLuckInput, null, catalog, [], CAPABILITIES)).toBeNull();

    // Song 102 has LUCK natively, but [1, 3, 1] overrides every slot to non-LUCK -> allows Great > 0 even without LUCK support!
    const nonLuckOverrideInput: DeckGoalInput = {
      ...base,
      arenaRule: individualRule,
      arenaSongEntries: [{ musicId: 102, difficulty: "expert" }],
      greatPercent: 10,
    };
    expect(deckDataGap(nonLuckOverrideInput, null, catalog, [], { luckMissions: false, luckGreatConversions: false })).toBeNull();
  });
});

describe("Shared Arena aggregate answer parsing and UI rendering", () => {
  test("parses shared Arena aggregate song breakdown and renders DeckResult + DeckArenaControls", () => {
    const raw = JSON.stringify({
      format: "ournotes-deck.account-recommendation/1",
      final: true,
      status: "ok",
      engine: {
        name: "Haneoka",
        source: "https://github.com/haneoka-gakuen/ournotes-team-builder",
        commit: HANEOKA_COMMIT,
        patchSha256: HANEOKA_PATCH_SHA,
      },
      result: {
        goal: { kind: "arenaLive" },
        metric: { kind: "score" },
        aggregation: "expected",
        phase: "done",
        elapsedMs: 42,
        optimality: { proven: true },
        teams: [{
          rank: 1,
          rankCertified: true,
          leader: { member: 1, snap: null },
          others: [2, 3, 4, 5].map(member => ({ member, snap: null })),
          power: 250000,
          value: { score: 1500000, payoff: null },
          orders: null,
          layout: { members: [1, 2, 3, 4, 5], snaps: [null, null, null, null, null] },
          aggregate: {
            kind: "mean",
            songs: [
              { song: { musicId: 101, difficulty: "expert" }, power: 250000, mean: 1520000, min: 1490000, median: 1520000, max: 1550000 },
              { song: { musicId: 102, difficulty: "hard" }, power: 250000, mean: 1480000, min: 1450000, median: 1480000, max: 1510000 },
            ],
          },
        }],
      },
    });
    const answer = parseDeckAnswer(raw);
    expect(answer.result?.teams[0]?.aggregate?.songs).toHaveLength(2);

    const html = renderToStaticMarkup(
      <DeckResult
        locale="en-US"
        goal="arena"
        rateBasis={null}
        stale={false}
        timeLimit={30}
        box={null}
        catalog={{ members: [], snaps: [] }}
        songNames={{ 101: "Ringing Bloom", 102: "FIRE BIRD" }}
        linked={false}
        busy={false}
        job={{ status: "done", key: "arena-shared", answer, rate: null, stopped: false }}
        onStop={() => {}}
        onRerun={() => {}}
        onEditCard={() => {}}
        onPlayer={() => {}}
        onAnswerAll={() => {}}
      />,
    );
    expect(html).toContain("Shared song pool breakdown");
    expect(html).toContain("Ringing Bloom");
    expect(html).toContain("FIRE BIRD");
    expect(html).toContain("Team-building algorithm from Haneoka");

    const now = parseMasterDate("2026/10/28 12:00:00")!;
    const resolved = resolveArenaRule({
      catalog: SAMPLE_CATALOG,
      ruleSource: "auto",
      leagueId: 1,
      customBandId: 1,
      customMusicType: 0,
      customMissions: [0, 0, 0],
      mode: "shared",
      now,
    });
    const controlsHtml = renderToStaticMarkup(
      <DeckArenaControls
        locale="zh-CN"
        catalog={SAMPLE_CATALOG}
        period={resolved.period}
        rule={resolved.rule}
        ruleSource="auto"
        leagueId={1}
        customBandId={1}
        customMusicType={0}
        customMissions={[0, 0, 0]}
        mode="shared"
        canChooseMode
        allSongs={false}
        entries={[{ musicId: 101, difficulty: "expert" }]}
        eligibleSongs={[{
          id: 101,
          title: "ときめきエクスペリエンス！",
          jacketUrl: "/j.png",
          bandId: 1,
          bandIds: [],
          bandName: "Poppin'Party",
          musicType: 1,
          startAt: "2026/01/01 0:00:00",
          gekisouMissions: [1, 1, 1],
          difficulties: [{ difficulty: "expert", level: 25 }],
        } as never]}
        bandNames={new Map([[1, "Poppin'Party"]])}
        formatEnd={end => end}
        onRuleSourceChange={() => {}}
        onLeagueChange={() => {}}
        onCustomBandChange={() => {}}
        onCustomMusicTypeChange={() => {}}
        onCustomMissionChange={() => {}}
        onModeChange={() => {}}
        onEntriesChange={() => {}}
        onOpenSongPicker={() => {}}
      />,
    );
    expect(controlsHtml).toContain("竞技场规则来源");
    expect(controlsHtml).toContain("LUCK / LUCK / LUCK");
    expect(controlsHtml).toContain("5 曲共用一队");
    expect(controlsHtml).toContain("候选曲池（1/5）");
    expect(controlsHtml).toContain("ときめきエクスペリエンス！");
  });
});

describe("Haneoka patch identity and 1.1.0.100 Arena + cumulative Snap adaptation", () => {
  test("matches patches/haneoka-rewards.patch SHA-256 and adapts 1.1.0.100 Arena requests and band-scoped accounts", () => {
    const patchBytes = readFileSync(join(process.cwd(), "patches/haneoka-rewards.patch"));
    const actualSha = createHash("sha256").update(patchBytes).digest("hex");
    expect(actualSha).toBe(HANEOKA_PATCH_SHA);
    expect(HANEOKA_COMMIT).toBe("cf9b3c64f517e5033e0280e65a556bb7a67a83e3");

    const { data, datasetId } = loadReal110Slice();
    const engineData = adaptData(data, datasetId);
    expect((engineData.songs["100001"] as { bandIds: number[] }).bandIds).toEqual([1]);
    expect((engineData.songs["100002"] as { bandIds: number[] }).bandIds).toEqual([1, 2]);
    // Support card 76 is the real 1.1.0.100 cumulative support skill Snap (_supportSkillID 74, _skillCumulativeConditionID 72/73)!
    expect(engineData.snapshots["76"]).toBeDefined();

    const sharedReq: RecommendationRequest = {
      format: "ournotes-deck.recommendation-request/2",
      goal: {
        kind: "arenaLive",
        rank: 2,
        arena: { bandId: 1, musicType: 0, missions: [2, 2, 2], mode: "shared" },
        songs: [
          { musicId: 100001, difficulty: "expert" },
          { musicId: 100002, difficulty: "expert" },
        ],
      },
      aggregation: "expected",
      k: 3,
    };
    const adaptedReq = adaptRequest(data, sharedReq);
    expect(adaptedReq.goal).toMatchObject({
      kind: "gekiso",
      criterion: "mean",
      rank: 2,
      arena: { bandId: 1, musicType: 0, missions: [2, 2, 2], mode: "shared" },
      songs: [
        { songId: 100001, difficulty: 3 },
        { songId: 100002, difficulty: 3 },
      ],
    });

    // Band-2 member card 56 has null skill levels, which would report `missing` on a non-Arena run,
    // while Band-1 Arena skips off-band member cards cleanly!
    const account: AccountInput = {
      format: "ournotes.account/1",
      datasetId,
      server: "jp",
      revision: "rev-1",
      coverage: {
        "_player._characters": "complete",
        "_player._bandItems": "complete",
        "_player._memberCards": "complete",
        "_player._supportCards": "complete",
      },
      declared: { _vip: { _rank: 1 } },
      account: {
        _player: {
          _memberCards: [
            ...[51, 52, 53, 54, 55].map(id => ({
              _masterId: id, _exp: 0, _awakeCount: 1, _rank: 1, _liveSkillLevel: 1, _performanceSkillLevel: 1,
            })),
            { _masterId: 56, _exp: 0, _awakeCount: 1, _rank: 1, _liveSkillLevel: null, _performanceSkillLevel: null },
          ],
          _supportCards: [{ _masterId: 76, _exp: 0, _rank: 1 }],
          _characters: [],
          _bandItems: [],
        },
      },
    };
    const adaptedAcc = adaptAccount(data, account, sharedReq, datasetId);
    expect(adaptedAcc.missing).toEqual([]);
    expect(adaptedAcc.errors).toEqual([]);
    expect(adaptedAcc.members.map(m => m.cardId)).toEqual([51, 52, 53, 54, 55]);
  });

  test("executes compiled WASM engine on 1.1.0.100 cumulative Snap and shared Gekiso Arena when .haneoka/dist is built", async () => {
    const { rawBytes, data, datasetId } = loadReal110Slice();
    const e2eAccount: AccountInput = {
      format: "ournotes.account/1",
      datasetId,
      server: "jp",
      revision: "e2e",
      coverage: {
        "_player._characters": "complete",
        "_player._bandItems": "complete",
        "_player._memberCards": "complete",
        "_player._supportCards": "complete",
      },
      declared: { _vip: { _rank: 1 } },
      account: {
        _player: {
          _memberCards: [51, 52, 53, 54, 55, 56, 57, 58, 59, 60].map(id => ({
            _masterId: id, _exp: 0, _awakeCount: 1, _rank: 1, _liveSkillLevel: 1, _performanceSkillLevel: 1,
          })),
          _supportCards: [{ _masterId: 76, _exp: 0, _rank: 1 }],
          _characters: [],
          _bandItems: [],
        },
      },
    };
    const freeReq: RecommendationRequest = {
      format: "ournotes-deck.recommendation-request/2",
      goal: { kind: "freeLive", musicId: 100001, difficulty: "expert" },
      aggregation: "expected",
      k: 1,
    };
    const e2eFreeAcc = adaptAccount(data, e2eAccount, freeReq, datasetId);
    expect(e2eFreeAcc.missing).toEqual([]);
    expect(e2eFreeAcc.errors).toEqual([]);
    expect(adaptRequest(data, freeReq).charts).toHaveLength(1);

    const distDir = join(process.cwd(), ".haneoka/dist");
    const wasmPath = join(distDir, "team-engine.wasm");
    const gluePath = join(distDir, "solver.mjs");
    if (!existsSync(wasmPath) || !existsSync(gluePath)) {
      const cacheKey = `${HANEOKA_COMMIT.slice(0, 12)}-${HANEOKA_PATCH_SHA.slice(0, 12)}`;
      const hasCachedWasm = existsSync(join(process.cwd(), ".haneoka/wasm-cache", cacheKey, "team-engine.wasm"));
      let hasCargo = false;
      if (!hasCachedWasm) {
        try {
          execFileSync("cargo", ["--version"], { stdio: "ignore" });
          hasCargo = true;
        } catch {
          hasCargo = false;
        }
      }
      if (!hasCachedWasm && !hasCargo) return;
      const buildArgs = [
        join(process.cwd(), "scripts/build-haneoka-engine.mjs"),
        ...(process.env.MOENOTES_TEST_HANEOKA_RUST === "1" ? ["--test"] : []),
        "--out",
        distDir,
      ];
      try {
        execFileSync(process.execPath, buildArgs, {
          cwd: process.cwd(),
          encoding: "utf8",
        });
      } catch (error: unknown) {
        const execErr = error as { message?: string; stdout?: string; stderr?: string };
        const tail = [execErr.stdout, execErr.stderr].filter(Boolean).join("\n").slice(-3500);
        throw new Error(`build-haneoka-engine failed:\n${tail || execErr.message || String(error)}`);
      }
    }

    const mod = await import(pathToFileURL(gluePath).href) as {
      default: (input: { module_or_path: Uint8Array }) => Promise<void>;
      DeckSolver: new (bytes: Uint8Array, options: { datasetId: string }) => {
        datasetId: string;
        capabilities: () => string;
        recommend: (acc: string, req: string, cb: (p: string) => void) => string;
        free: () => void;
      };
    };
    await mod.default({ module_or_path: new Uint8Array(readFileSync(wasmPath)) });

    const solver = new mod.DeckSolver(rawBytes, { datasetId });
    try {
      expect(solver.datasetId).toBe(datasetId);
      expect(JSON.parse(solver.capabilities())).toMatchObject({
        arenaRules: true,
        gekisouRank: true,
        songRules: true,
        crossSongMean: true,
      });

      const accountJson = JSON.stringify(e2eAccount);

      // 1) Free Live with real 1.1.0.100 cumulative support Snap 76 (previously crashed ournotes-deck 0.0.12!)
      const freeAnswer = parseDeckAnswer(solver.recommend(accountJson, JSON.stringify({
        format: "ournotes-deck.recommendation-request/2",
        goal: { kind: "freeLive", musicId: 100001, difficulty: "expert" },
        aggregation: "expected",
        k: 1,
      }), () => {}));
      expect(freeAnswer.status).toBe("ok");
      expect(freeAnswer.result?.teams).toHaveLength(1);

      // 2) Gekiso Arena Season 1 Regulation 1 ([2, 2, 2] triple-LUCK, shared 2-song pool, Band 1, Rank 2)
      const sharedArenaAnswer = parseDeckAnswer(solver.recommend(accountJson, JSON.stringify({
        format: "ournotes-deck.recommendation-request/2",
        goal: {
          kind: "arenaLive",
          rank: 2,
          arena: { bandId: 1, musicType: 0, missions: [2, 2, 2], mode: "shared" },
          songs: [
            { musicId: 100001, difficulty: "expert" },
            { musicId: 100002, difficulty: "expert" },
          ],
        },
        room: { players: 5, othersAverageScore: null },
        aggregation: "expected",
        k: 1,
      }), () => {}));
      expect(sharedArenaAnswer.status).toBe("ok");
      expect(sharedArenaAnswer.result?.teams[0]?.layout.members.sort((a, b) => a - b)).toEqual([51, 52, 53, 54, 55]);
      expect(sharedArenaAnswer.result?.teams[0]?.aggregate?.kind).toBe("mean");
      expect(sharedArenaAnswer.result?.teams[0]?.aggregate?.songs).toHaveLength(2);
    } finally {
      solver.free();
    }
  }, 300_000);

  test("adapts songRules overrides and cross-song mean formation optimization across Haneoka cf9b3c6 features", () => {
    const { data } = loadReal110Slice();
    const caps = parseCapabilities(JSON.stringify(CAPABILITIES))!;
    expect(caps.songRules).toBe(true);
    expect(caps.crossSongMean).toBe(true);

    expect(isValidSongRules({ musicType: 99, missions: [1, 2, 3] })).toBe(true);
    expect(isValidSongRules({ musicType: 6, missions: [0, 0, 0] })).toBe(false);
    expect(activeSongRules({ musicType: 0, missions: [0, 0, 0] }, true)).toBeUndefined();
    expect(activeSongRules({ musicType: 0, missions: [1, 2, 3] }, false)).toBeUndefined();
    expect(activeSongRules({ musicType: 3, missions: [1, 2, 3] }, false)).toEqual({ musicType: 3, missions: [0, 0, 0] });
    expect(activeSongRules({ musicType: 3, missions: [1, 2, 3] }, true)).toEqual({ musicType: 3, missions: [1, 2, 3] });

    const battleGoal: DeckGoalInput = {
      ...defaultDeckGoalInput("battle"),
      musicId: 100001,
      difficulty: "expert",
      songRules: { musicType: 99, missions: [1, 2, 3] },
    };
    expect(computes(caps, battleGoal)).toBe(true);
    expect(computes({ ...caps, songRules: false }, battleGoal)).toBe(false);
    const battleReqJson = recommendationRequest(battleGoal, {
      event: null,
      now: Date.now(),
      constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
    });
    const adaptedBattle = adaptRequest(data, JSON.parse(battleReqJson) as RecommendationRequest);
    expect(adaptedBattle.songRules).toEqual({ musicType: 99, missions: [1, 2, 3] });

    const freeMeanGoal: DeckGoalInput = {
      ...defaultDeckGoalInput("free"),
      allSongs: true,
      multiSongMode: "mean",
      difficulty: "expert",
      songRules: { musicType: 2, missions: [2, 2, 2] },
    };
    expect(computes(caps, freeMeanGoal)).toBe(true);
    expect(computes({ ...caps, crossSongMean: false }, freeMeanGoal)).toBe(false);
    const freeMeanReqJson = recommendationRequest(
      freeMeanGoal,
      {
        event: null,
        now: Date.now(),
        constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
      },
      { songScope: { field: "musicIds", ids: [100001, 100002] } },
    );
    const adaptedFreeMean = adaptRequest(data, JSON.parse(freeMeanReqJson) as RecommendationRequest);
    expect((adaptedFreeMean as { aggregation?: string }).aggregation).toBe("mean");
    expect(adaptedFreeMean.songRules).toEqual({ musicType: 2, missions: [0, 0, 0] });
    expect((adaptedFreeMean.goal as { songs: unknown[] }).songs).toHaveLength(2);

    // Rejects cross-song mean on event reward metrics or maximum aggregation
    expect(() =>
      adaptRequest(data, {
        format: "ournotes-deck.recommendation-request/2",
        goal: { kind: "freeLive", musicIds: [100001, 100002], multiSong: "mean", difficulty: "expert" },
        metric: { kind: "score" },
        aggregation: "maximum",
        k: 3,
      }),
    ).toThrow("haneoka-cross-song-mean");

    const conditionsHtml = renderToStaticMarkup(
      <Md3Provider>
        <DeckGoalConditions locale="zh-CN" input={battleGoal} capabilities={caps} onChange={() => {}} />
      </Md3Provider>,
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
    expect(conditionsHtml).not.toContain("<select");
    expect(conditionsHtml).toContain("歌曲属性");
    expect(conditionsHtml).toContain("任务 1");
    expect(conditionsHtml).toContain("COMBO");
    expect(conditionsHtml).toContain("LUCK");
    expect(conditionsHtml).toContain("JUST");
  });
});

describe("StarMoe Box refresh-token expiry notice and v0.1.4+ upgrade guidance", () => {
  test("points STARMOE_BOX_APP to latest release APK and renders refresh-token expiry notice on Deck & Save UI", () => {
    expect(STARMOE_BOX_APP.minRecommendedVersion).toBe("0.1.4");
    expect(STARMOE_BOX_APP.download).toBe("https://github.com/StarMoe-org/StarMoe-box/releases/latest/download/app-release.apk");
    expect(STARMOE_BOX_APP.releases).toBe("https://github.com/StarMoe-org/StarMoe-box/releases/latest");

    const zhWorkspaceHtml = renderToStaticMarkup(
      <DeckWorkspace locale="zh-CN" page="deck" servers={["jp"]} members={[]} snaps={[]} songs={[]} />,
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
    expect(zhWorkspaceHtml).toContain("unable to fetch refresh token");
    expect(zhWorkspaceHtml).toContain("登录状态已过期");
    expect(zhWorkspaceHtml).toContain("v0.1.4+");
    expect(zhWorkspaceHtml).toContain(STARMOE_BOX_APP.download);

    const enNoticeHtml = renderToStaticMarkup(
      <Md3Provider>
        <StarMoeBoxTokenNotice locale="en-US" />
      </Md3Provider>,
    ).replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
    expect(enNoticeHtml).toContain("unable to fetch refresh token");
    expect(enNoticeHtml).toContain("expired");
    expect(enNoticeHtml).toContain("v0.1.4+");

    const bannerHtml = renderToStaticMarkup(
      <GameSaveBanner
        locale="zh-CN"
        link={{ server: "jp", accountId: "10000001", sha256: "a".repeat(64), uploadedAt: 1_760_000_000_000 }}
        state={{ status: "ready", save: { server: "jp", accountId: "10000001", sha256: "a".repeat(64), player: {} } }}
        derivation={null}
        list={{ access: "signed-in", saves: [], error: false, refresh: async () => [] }}
        busy={false}
        returnTo="/tools/card-box"
        onRetry={() => {}}
        onUpdate={async () => true}
        onUnlink={async () => true}
      />,
    );
    expect(bannerHtml).toContain("unable to fetch refresh token");
    expect(bannerHtml).toContain("v0.1.4+");
  });
});

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Md3Provider } from "@/components/md3/Md3Provider";
import DeckResult from "@/components/deck/DeckResult";
import DeckTeamGrowthPanel from "@/components/deck/DeckTeamGrowthPanel";
import type { GameSaveTables } from "@/lib/box/game-save";
import { createBox, createCard, type CardBox } from "@/lib/box/model";
import { boxAccountJson } from "@/lib/deck/account-envelope";
import { parseDeckAnswer } from "@/lib/deck/answer";
import { reconcileCardSelections } from "@/lib/deck/card-selection";
import { checkGekisoConstraintFeasibility, MAX_GEKISO_COUNT } from "@/lib/deck/feasibility";
import {
  computes,
  defaultDeckGoalInput,
  effectiveMinJustWindowMs,
  parseCapabilities,
  recommendationRequest,
  type DeckEvent,
} from "@/lib/deck/goals";
import type { DeckData } from "@/lib/deck/haneoka/data";
import { evaluateTeamGrowth, type GrowthInvoker } from "@/lib/deck/haneoka/growth";
import { adaptRequest, CAPABILITIES } from "@/lib/deck/haneoka/request";
import { buildTheoreticalMaxBox } from "@/lib/deck/theoretical-box";

const SAMPLE_EVENT: DeckEvent = {
  id: 50,
  name: "Sync Event",
  startAt: "2026/09/01 15:00:00",
  endAt: "2026/09/09 20:59:59",
  itemId: 90,
  challengeMusics: [],
};

function loadFixtureWithEvent(): { data: DeckData; datasetId: string; saveTables: GameSaveTables } {
  const rawBytes = new Uint8Array(readFileSync(join(process.cwd(), "tests/fixtures/haneoka-110-slice.json")));
  const data = JSON.parse(new TextDecoder().decode(rawBytes)) as DeckData;
  data.master.MasterEvent = {
    columns: ["_id", "_eventType", "_startAt", "_endAt", "_liveEventPointGroup", "_liveEventRewardGroup", "_eventItemId"],
    rows: [[50, 1, "2026/09/01 15:00:00", "2026/09/09 20:59:59", 1, 1, 90]],
  };
  data.master.MasterLiveEventPoint = {
    columns: ["_id", "_group", "_scoreRank", "_value"],
    rows: [[1, 1, 1, 100], [2, 1, 2, 120]],
  };
  data.master.MasterLiveEventReward = {
    columns: ["_id", "_eventGroup", "_scoreRank", "_probability", "_resourceType", "_resourceId", "_resourceCount"],
    rows: [[1, 1, 1, 10000, 1, 90, 5], [2, 1, 2, 10000, 1, 90, 6]],
  };
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const datasetId = createHash("sha256").update(bytes).digest("hex");
  const saveTables: GameSaveTables = {
    server: "jp",
    characters: Array.from({ length: 25 }, (_, i) => String(i + 1)),
    characterRanks: [[1, 0], [2, 1]],
    members: Object.fromEntries([51, 52, 53, 54, 55].map((id) => [String(id), 3])),
    memberLevels: { "3": [[1, 0], [60, 321650]] },
    snaps: { "76": 3 },
    snapLevels: { "3": [[1, 0], [60, 321650]] },
    bandItems: {},
    memories: {},
    musicRanks: {},
  };
  return { data, datasetId, saveTables };
}

describe("Haneoka 7c167c95 sync — timing extrema, frame rates, accuracy, Gekiso constraints & Box reconciliation", () => {
  test("OrderTimingPanel computes planDelta against nominal score, formats dynamic advanceMs, and handles guideAvailable=false", () => {
    const rawAnswer = {
      format: "ournotes-deck.account-recommendation/1",
      final: true,
      status: "ok",
      missing: [],
      errors: [],
      result: {
        phase: "done",
        elapsedMs: 42,
        optimality: { proven: true, lowerBound: 1050000, upperBound: 1050000, fraction: null },
        account: { cards: { coversAllOwnedCards: true } },
        metric: { kind: "score" },
        aggregation: "maximum",
        goal: { kind: "freeLive" },
        exitReason: "complete",
        teams: [
          {
            rank: 1,
            rankCertified: true,
            leader: { member: 51, snap: 76 },
            others: [
              { member: 52, snap: null },
              { member: 53, snap: null },
              { member: 54, snap: null },
              { member: 55, snap: null },
            ],
            power: 250000,
            value: { score: 1050000, exact: { numerator: "1050000", denominator: "1" }, interval: null, payoff: null },
            orders: null,
            bestOrder: { score: 1050000, order: [51, 52, 53, 54, 55] },
            timing: {
              order: [51, 52, 53, 54, 55],
              worst: 990000,
              score: 1000000,
              best: 1035000,
              optimal: 1050000,
              guideAvailable: true,
              advanceMs: 9,
              windows: [
                {
                  event: 0,
                  member: 51,
                  startMs: 12000,
                  endMs: 17000,
                  unit: 20,
                  notes: [12500, 13000],
                  steps: [{ step: 1, timeMs: 13000, notes: 1, noteIndices: [14], gain: 35000 }],
                },
              ],
            },
            layout: { members: [52, 53, 51, 54, 55], snaps: [null, null, 76, null, null] },
          },
        ],
      },
    };
    const parsed = parseDeckAnswer(JSON.stringify(rawAnswer));
    expect(parsed.result?.teams[0]?.timing?.advanceMs).toBe(9);
    expect(parsed.result?.teams[0]?.timing?.guideAvailable).toBe(true);

    const html120Hz = renderToStaticMarkup(
      <Md3Provider>
        <DeckResult
          locale="zh-CN"
          job={{ status: "done", key: "k1", answer: parsed, rate: null, stopped: false }}
          goal="free"
          rateBasis={null}
          stale={false}
          timeLimit={60}
          box={null}
          catalog={{ members: [], snaps: [] }}
          linked={false}
          busy={false}
          onStop={() => {}}
          onRerun={() => {}}
          songNames={{}}
          onEditCard={() => {}}
          onPlayer={() => {}}
          onAnswerAll={() => {}}
        />
      </Md3Provider>,
    );
    // 120 Hz -> 9 ms early plan, and planDelta = 1,035,000 - 1,000,000 = +35,000 (NOT 1,035,000 - 990,000 = +45,000!)
    expect(html120Hz).toContain("提前 9 ms 方案");
    expect(html120Hz).toContain("+35,000");
    expect(html120Hz).not.toContain("+45,000");

    // When chart-time inputs collide (`guideAvailable: false`), suppress steps and show collision notice
    const blockedRaw = structuredClone(rawAnswer);
    blockedRaw.result.teams[0]!.timing.guideAvailable = false;
    blockedRaw.result.teams[0]!.timing.best = 1000000;
    const parsedBlocked = parseDeckAnswer(JSON.stringify(blockedRaw));
    const blockedHtml = renderToStaticMarkup(
      <Md3Provider>
        <DeckResult
          locale="zh-CN"
          job={{ status: "done", key: "k2", answer: parsedBlocked, rate: null, stopped: false }}
          goal="free"
          rateBasis={null}
          stale={false}
          timeLimit={60}
          box={null}
          catalog={{ members: [], snaps: [] }}
          linked={false}
          busy={false}
          onStop={() => {}}
          onRerun={() => {}}
          songNames={{}}
          onEditCard={() => {}}
          onPlayer={() => {}}
          onAnswerAll={() => {}}
        />
      </Md3Provider>,
    );
    expect(blockedHtml).toContain("原谱面时刻已存在同轨输入冲突");
    expect(blockedHtml).not.toContain("凹分教程");

    const sampledRaw = structuredClone(rawAnswer);
    sampledRaw.result.optimality.proven = false;
    sampledRaw.result.exitReason = "sampled";
    const sampledHtml = renderToStaticMarkup(
      <Md3Provider>
        <DeckResult
          locale="zh-CN"
          job={{ status: "done", key: "k3", answer: parseDeckAnswer(JSON.stringify(sampledRaw)), rate: null, stopped: false }}
          goal="battle"
          rateBasis={null}
          stale={false}
          timeLimit={60}
          box={null}
          catalog={{ members: [], snaps: [] }}
          linked={false}
          busy={false}
          onStop={() => {}}
          onRerun={() => {}}
          songNames={{}}
          onEditCard={() => {}}
          onPlayer={() => {}}
          onAnswerAll={() => {}}
        />
      </Md3Provider>,
    );
    expect(sampledHtml).toContain("随机抽样评估 · 当前最优（未证明）");
  });

  test("reconcileCardSelections preserves leader, required, and excluded cards across Box updates and Theoretical Max toggles", () => {
    const { saveTables } = loadFixtureWithEvent();
    const m51 = createCard("member", "box-a-51", "51", 1);
    const m52 = createCard("member", "box-a-52", "52", 1);
    const m53 = createCard("member", "box-a-53", "53", 1);
    const s76 = createCard("snap", "box-a-76", "76", 1);
    const boxA: CardBox = { ...createBox("jp", "b1", 1), cards: [m51, m52, m53, s76] };

    const theoryBox = buildTheoreticalMaxBox(
      boxA,
      "jp",
      {
        members: [51, 52, 53, 54, 55].map((id, idx) => ({ id, rarity: 4, characterId: idx + 1 }) as never),
        snaps: [{ id: 76, rarity: 4 } as never],
      },
      saveTables,
    );

    const toTheory = reconcileCardSelections(boxA.cards, theoryBox, {
      leaderKey: "box-a-51",
      required: new Set(["box-a-52", "box-a-76"]),
      excluded: new Set(["box-a-53"]),
    });
    expect(toTheory.leaderKey).toBe("theory-m-51");
    expect([...toTheory.required]).toEqual(["theory-m-52", "theory-s-76"]);
    expect([...toTheory.excluded]).toEqual(["theory-m-53"]);

    const backToOwned = reconcileCardSelections(theoryBox.cards, boxA, toTheory);
    expect(backToOwned.leaderKey).toBe("box-a-51");
    expect([...backToOwned.required]).toEqual(["box-a-52", "box-a-76"]);
    expect([...backToOwned.excluded]).toEqual(["box-a-53"]);
  });

  test("adapts frameRate, Good/Bad/Miss accuracy, per-range Gekiso ranks, minComboBonus, minJustWindowMs, luckSamples, minMissionMembers, and rewardRoom", () => {
    const { data } = loadFixtureWithEvent();
    const caps = parseCapabilities(JSON.stringify(CAPABILITIES));
    expect(caps).not.toBeNull();
    expect(caps!.frameRates).toEqual([30, 60, 90, 120]);
    expect(caps!.gekisouRangeRanks).toBe(true);
    expect(caps!.minMissionMembers).toBe(true);
    expect(caps!.minComboBonus).toBe(true);
    expect(caps!.minJustWindow).toBe(true);
    expect(caps!.luckSampling).toBe(true);

    // 1. Frame rate + Good/Bad/Miss custom accuracy on normal Free Live
    const freeInput = {
      ...defaultDeckGoalInput("free"),
      musicId: 100001,
      difficulty: "expert" as const,
      frameRate: 120 as const,
      greatPercent: 5,
      goodPercent: 3,
      badPercent: 2,
      missPercent: 1,
    };
    expect(computes(caps!, freeInput)).toBe(true);
    const freeReq = JSON.parse(
      recommendationRequest(freeInput, {
        event: null,
        now: Date.parse("2026-09-05T00:00:00Z"),
        constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
      }),
    );
    const adaptedFree = adaptRequest(data, freeReq);
    expect(adaptedFree.goal).toMatchObject({
      kind: "score",
      play: { kind: "custom", great: 0.05, good: 0.03, bad: 0.02, miss: 0.01, frameRate: 120 },
    });

    // 2. Gekiso Battle Live with per-range placements, minComboBonus, +% JUST window, manual luckSamples, and minMissionMembers
    const battleInput = {
      ...defaultDeckGoalInput("battle"),
      musicId: 100001,
      difficulty: "expert" as const,
      gekisouRank: 1,
      gekisouRanks: [1, 3, 2] as const,
      minComboBonus: 4,
      justWindowUnit: "percent" as const,
      justWindowPercent: 20,
      baseJustWindowMs: 25,
      luckSamplingMode: "manual" as const,
      luckSamples: 16,
    };
    expect(effectiveMinJustWindowMs(battleInput)).toBe(30);
    expect(computes(caps!, battleInput)).toBe(true);
    const battleReq = JSON.parse(
      recommendationRequest(battleInput, {
        event: null,
        now: Date.parse("2026-09-05T00:00:00Z"),
        constraints: {
          includeMembers: [],
          excludeMembers: [],
          excludeSnaps: [],
          minMissionMembers: [2, 1, 2],
        },
      }),
    );
    const adaptedBattle = adaptRequest(data, battleReq);
    expect(adaptedBattle.goal).toMatchObject({
      kind: "gekiso",
      rank: 1,
      ranks: [1, 3, 2],
      minComboBonus: 4,
      minJustWindowMs: 30,
      seeds: 16,
    });
    expect(adaptedBattle.constraints.minMissionMembers).toEqual([2, 1, 2]);

    // Reject sum > 5 or out-of-range Gekiso integer inputs
    expect(() =>
      adaptRequest(data, {
        ...battleReq,
        constraints: { ...battleReq.constraints, minMissionMembers: [2, 2, 2] },
      }),
    ).toThrow("haneoka-min-mission-members");
    expect(() =>
      adaptRequest(data, {
        ...battleReq,
        goal: { ...battleReq.goal, minComboBonus: MAX_GEKISO_COUNT + 1 },
      }),
    ).toThrow("haneoka-min-combo-bonus");

    // 3. Configurable Event Reward Room grading (`solo` on Battle Live & `battle` with 4 players on Free Live)
    const soloBattleRewardReq = JSON.parse(
      recommendationRequest(
        {
          ...defaultDeckGoalInput("eventPoints"),
          venue: "battleLive",
          musicId: 100001,
          rewardRoomMode: "solo",
        },
        {
          event: SAMPLE_EVENT,
          now: Date.parse("2026-09-05T00:00:00Z"),
          constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
        },
      ),
    );
    expect(soloBattleRewardReq.room).toEqual({ mode: "solo", players: 1, othersAverageScore: null });
    expect(adaptRequest(data, soloBattleRewardReq).goal).toMatchObject({
      kind: "event",
      room: { mode: "solo", players: 1, othersAverageScore: null },
    });

    const battleFreeRewardReq = JSON.parse(
      recommendationRequest(
        {
          ...defaultDeckGoalInput("eventPoints"),
          venue: "freeLive",
          musicId: 100001,
          rewardRoomMode: "battle",
          rewardPlayers: 4,
          othersAverageScore: 950000,
        },
        {
          event: SAMPLE_EVENT,
          now: Date.parse("2026-09-05T00:00:00Z"),
          constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] },
        },
      ),
    );
    expect(adaptRequest(data, battleFreeRewardReq).goal).toMatchObject({
      kind: "event",
      rewardRoom: { mode: "battle", players: 4, otherAverageScore: 950000 },
    });
  });

  test("checkGekisoConstraintFeasibility validates distinct-character mission counts and ALL-mission cards", () => {
    const cards = [51, 52, 53, 54, 55].map((id) => createCard("member", `k${id}`, String(id), 1));
    const box: CardBox = { ...createBox("jp", "b-feas", 1), cards };
    // 51: COMBO (1), 52: ALL (4), 53: LUCK (2), 54: JUST (3), 55: COMBO (1)
    const catalog = new Map([
      [51, { id: 51, characterId: 1, gekisouMissionType: 1 }],
      [52, { id: 52, characterId: 2, gekisouMissionType: 4 }],
      [53, { id: 53, characterId: 3, gekisouMissionType: 2 }],
      [54, { id: 54, characterId: 4, gekisouMissionType: 3 }],
      [55, { id: 55, characterId: 5, gekisouMissionType: 1 }],
    ]);

    // 3 COMBO (51, 55 + ALL 52) + 2 LUCK (53 + ALL 52) is individually reachable per type!
    expect(
      checkGekisoConstraintFeasibility({
        box,
        memberCatalog: catalog,
        constraints: { includeMembers: [], excludeMembers: [], minMissionMembers: [3, 2, 0] },
      }),
    ).toBeNull();

    // Requiring 3 JUST when only 54 (JUST) and 52 (ALL) exist (2 distinct characters) is unreachable!
    expect(
      checkGekisoConstraintFeasibility({
        box,
        memberCatalog: catalog,
        constraints: { includeMembers: [], excludeMembers: [], minMissionMembers: [0, 0, 3] },
      }),
    ).toEqual({
      code: "mission_members_unreachable",
      missionIndex: 2,
      required: 3,
      available: 2,
    });
  });

  test("evaluateTeamGrowth emits cap scenarios (awakeCap, rankCap, liveSkillCap) and DeckTeamGrowthPanel renders MD3 category chips", () => {
    const { data, datasetId, saveTables } = loadFixtureWithEvent();
    const fullBox = buildTheoreticalMaxBox(
      null,
      "jp",
      {
        members: [51, 52, 53, 54, 55].map((id, idx) => ({ id, rarity: 4, characterId: idx + 1 }) as never),
        snaps: [{ id: 76, rarity: 4 } as never],
      },
      saveTables,
    );
    const customBox: CardBox = {
      ...fullBox,
      cards: fullBox.cards.map((card) =>
        card.identity.value === "51"
          ? {
              ...card,
              fields: {
                ...card.fields,
                level: { ...card.fields.level, value: 1 },
                awake: { ...card.fields.awake, value: 1 },
                rank: { ...card.fields.rank, value: 1 },
                liveSkillLevel: { ...card.fields.liveSkillLevel, value: 1 },
              },
            }
          : card,
      ),
    };

    const accountJson = boxAccountJson({ datasetId, server: "jp" }, customBox, saveTables, { fallbackBandItems: true });
    const requestJson = recommendationRequest(
      { ...defaultDeckGoalInput("free"), musicId: 100001, difficulty: "expert" },
      { event: null, now: 0, constraints: { includeMembers: [], excludeMembers: [], excludeSnaps: [] } },
    );
    const mockInvoker: GrowthInvoker = {
      run(_charts, payload) {
        const members = payload.members as { level: number; awake: number; rank: number; liveSkillLevel: number }[];
        const power = members.reduce((sum, m) => sum + m.level * 100 + m.awake * 500 + m.rank * 800, 0);
        const meanScore = power * 3 + members.reduce((sum, m) => sum + m.liveSkillLevel * 2000, 0);
        return {
          overall: [
            {
              members: ["m51", "m52", "m53", "m54", "m55"],
              snaps: ["s76", null, null, null, null],
              power,
              key: meanScore,
              score: { mean: meanScore, orders: Array.from({ length: 120 }, () => meanScore) },
            },
          ],
        };
      },
    };

    const report = JSON.parse(
      evaluateTeamGrowth(
        data,
        datasetId,
        mockInvoker,
        accountJson,
        requestJson,
        JSON.stringify({
          members: [51, 52, 53, 54, 55],
          snaps: [76, null, null, null, null],
          song: { musicId: 100001, difficulty: "expert" },
        }),
      ),
    );
    const actions = new Set(report.scenarios.map((s: { action: string }) => s.action));
    expect(actions.has("awakeCap")).toBe(true);
    expect(actions.has("rankCap")).toBe(true);
    expect(actions.has("liveSkillCap")).toBe(true);
    expect(actions.has("full")).toBe(true);

    const html = renderToStaticMarkup(
      <Md3Provider>
        <DeckTeamGrowthPanel
          locale="zh-CN"
          report={report}
          loading={false}
          onEvaluate={() => {}}
          memberById={new Map()}
          snapById={new Map()}
        />
      </Md3Provider>,
    );
    expect(html).toContain("单项满级");
    expect(html).toContain("全部属性");
    expect(html).toContain("技能");
    expect(html).not.toContain("<select");
  });
});

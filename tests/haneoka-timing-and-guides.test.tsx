import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckObjective from "../src/components/deck/DeckObjective";
import DeckResult from "../src/components/deck/DeckResult";
import { GekisoTimingBadges } from "../src/components/music/MusicChartPanel";
import type { BoxCatalog } from "../src/components/box/BoxManager";
import { parseDeckAnswer } from "../src/lib/deck/answer";
import { defaultDeckGoalInput, recommendationRequest, supportsCumulativeTiming } from "../src/lib/deck/goals";
import { adaptRequest, CAPABILITIES, HANEOKA_COMMIT, type RecommendationRequest } from "../src/lib/deck/haneoka/request";
import {
  comboOpening,
  extractJustTypes,
  extractPerfectTimings,
  gekisoTiming,
  perfectTimingsMap,
  runtimeChart,
} from "../src/lib/music/gekiso-timing";
import { getChartDataGuide } from "../src/i18n/guides/chart-data";
import { getDeckGuide } from "../src/i18n/guides/deck";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

describe("Haneoka 4ed6e00 cumulative-Snap OrderTiming, cumulativeTiming goals and DeckResult rendering", () => {
  test("pins Haneoka commit 4ed6e00 and exposes orderTiming + cumulativeTiming capabilities", () => {
    expect(HANEOKA_COMMIT).toBe("4ed6e0061f519240f19750a3a09024dd27304bd8");
    expect(CAPABILITIES.orderTiming).toBe(true);
    expect(CAPABILITIES.cumulativeTiming).toBe(true);
  });

  test("serializes cumulativeTiming (nominal / best / worst) and required Snapshots (includeSnaps)", () => {
    const freeMaxBest = {
      ...defaultDeckGoalInput("free"),
      musicId: 100001,
      difficulty: "expert" as const,
      aggregation: "maximum" as const,
      cumulativeTiming: "best" as const,
    };
    expect(supportsCumulativeTiming(freeMaxBest)).toBe(true);
    expect(supportsCumulativeTiming({ ...freeMaxBest, aggregation: "expected" })).toBe(false);
    expect(supportsCumulativeTiming({ ...defaultDeckGoalInput("battle"), aggregation: "maximum" })).toBe(false);

    const reqJson = recommendationRequest(freeMaxBest, {
      event: null,
      now: 0,
      constraints: {
        includeMembers: ["51"],
        includeSnaps: ["76"],
        excludeMembers: [],
        excludeSnaps: [],
      },
    });
    const parsed = JSON.parse(reqJson) as RecommendationRequest;
    expect(parsed.goal.play).toEqual({ greatFraction: 0, cumulativeTiming: "best" });
    expect(parsed.constraints?.includeSnaps).toEqual([76]);

    // When noSnaps is enabled, includeSnaps is omitted
    const noSnapJson = recommendationRequest(
      { ...freeMaxBest, cumulativeTiming: "worst" },
      {
        event: null,
        now: 0,
        constraints: {
          includeMembers: [],
          includeSnaps: ["76"],
          excludeMembers: [],
          excludeSnaps: [],
          noSnaps: true,
        },
      },
    );
    const parsedNoSnap = JSON.parse(noSnapJson) as RecommendationRequest;
    expect(parsedNoSnap.goal.play).toEqual({ greatFraction: 0, cumulativeTiming: "worst" });
    expect(parsedNoSnap.constraints?.includeSnaps).toBeUndefined();

    const objectiveHtml = renderToStaticMarkup(
      <DeckObjective
        locale="zh-CN"
        input={freeMaxBest}
        capabilities={CAPABILITIES}
        onChange={() => {}}
        onTimingChange={() => {}}
      />,
    );
    expect(objectiveHtml).toContain("累计留影时序");
    expect(objectiveHtml).toContain("名义时序");
    expect(objectiveHtml).toContain("最佳时序");
    expect(objectiveHtml).toContain("最差时序");
  });

  test("parses cumulative-Snap timing extrema (worst / optimal / noteIndices) and renders collapsible guide across locales", () => {
    const members = [1, 2, 3, 4, 5].map((id) => ({
      id,
      assetId: id,
      characterId: id,
      bandId: 1,
      rarity: 4,
      cardType: "cool",
      title: `Member ${id}`,
      characterName: `Char ${id}`,
    })) as unknown as BoxCatalog["members"];
    const snaps = [] as unknown as BoxCatalog["snaps"];

    const answer = parseDeckAnswer(
      JSON.stringify({
        format: "ournotes-deck.account-recommendation/1",
        final: true,
        status: "ok",
        result: {
          goal: { kind: "freeLive" },
          metric: { kind: "score" },
          aggregation: "expected",
          phase: "done",
          elapsedMs: 14,
          optimality: { proven: true },
          teams: [
            {
              rank: 1,
              rankCertified: true,
              leader: { member: 3, snap: 76 },
              others: [
                { member: 1, snap: null },
                { member: 2, snap: null },
                { member: 4, snap: null },
                { member: 5, snap: null },
              ],
              power: 412000,
              value: { score: 2150000, payoff: null },
              orders: {
                count: 120,
                min: { score: 2120000, order: [5, 4, 3, 2, 1] },
                median: { score: 2150000, order: [2, 1, 3, 4, 5] },
                max: { score: 2180000, order: [3, 1, 2, 4, 5] },
              },
              bestOrder: { score: 2180000, order: [3, 1, 2, 4, 5] },
              timing: {
                order: [3, 1, 2, 4, 5],
                score: 2180000,
                best: 2186420,
                worst: 2178200,
                optimal: 2189100,
                advanceMs: 17,
                windows: [
                  {
                    event: 0,
                    member: 3,
                    startMs: 12000,
                    endMs: 17000,
                    unit: 5,
                    notes: [12200, 12800, 13400, 14120, 15650],
                    steps: [
                      { step: 1, timeMs: 14120, notes: 2, noteIndices: [14, 15], gain: 3120 },
                      { step: 2, timeMs: 15650, notes: 1, noteIndices: [22], gain: 3300 },
                    ],
                  },
                ],
              },
              layout: {
                members: [1, 2, 3, 4, 5],
                snaps: [null, null, 76, null, null],
              },
            },
          ],
        },
      }),
    );

    expect(answer.result?.teams[0]?.timing?.best).toBe(2186420);
    expect(answer.result?.teams[0]?.timing?.worst).toBe(2178200);
    expect(answer.result?.teams[0]?.timing?.optimal).toBe(2189100);
    expect(answer.result?.teams[0]?.timing?.advanceMs).toBe(17);
    expect(answer.result?.teams[0]?.timing?.windows[0]?.steps[0]?.noteIndices).toEqual([14, 15]);

    const zhHtml = renderToStaticMarkup(
      <DeckResult
        locale="zh-CN"
        goal="free"
        rateBasis={null}
        stale={false}
        timeLimit={60}
        box={null}
        catalog={{ members, snaps }}
        linked={false}
        busy={false}
        job={{ status: "done", key: "expected", answer, rate: null, stopped: false }}
        onStop={() => {}}
        onRerun={() => {}}
        onEditCard={() => {}}
        onPlayer={() => {}}
        onAnswerAll={() => {}}
      />,
    );
    expect(zhHtml).toContain("最差时序分数");
    expect(zhHtml).toContain("名义时序分数");
    expect(zhHtml).toContain("最佳时序分数");
    expect(zhHtml).toContain("提前 17 ms 方案");
    expect(zhHtml).toContain("+8,220");
    expect(zhHtml).toContain("凹分教程");
    expect(zhHtml).toContain('<details class="dr-timing-guide">');
    expect(zhHtml).toContain("提前约 17 ms");
    expect(zhHtml).toContain("0:12.00 – 0:17.00");
    expect(zhHtml).toContain("0:14.12");
    expect(zhHtml).toContain("2 键同时");
    expect(zhHtml).toContain("发动后开头的音符照常击打。");

    const enHtml = renderToStaticMarkup(
      <DeckResult
        locale="en-US"
        goal="free"
        rateBasis={null}
        stale={false}
        timeLimit={60}
        box={null}
        catalog={{ members, snaps }}
        linked={false}
        busy={false}
        job={{ status: "done", key: "max", answer: { ...answer, result: { ...answer.result!, aggregation: "maximum" } }, rate: null, stopped: false }}
        onStop={() => {}}
        onRerun={() => {}}
        onEditCard={() => {}}
        onPlayer={() => {}}
        onAnswerAll={() => {}}
      />,
    );
    expect(enHtml).toContain("Worst-timing score");
    expect(enHtml).toContain("Nominal-timing score");
    expect(enHtml).toContain("Best-timing score");
    expect(enHtml).toContain("17 ms plan");
    expect(enHtml).toContain("Timing guide");
    expect(enHtml).toContain("About 17 ms early");
    expect(enHtml).toContain("2 together");
    expect(enHtml).toContain("Hit the first notes after activation as usual.");
  });
});

describe("Gekiso COMBO segment boundary timing (Late start / Early end)", () => {
  const rawTimingRows = [
    { assistLevel: 0, noteSimulateJudgement: 5, noteJudgementType: 1, beforeMs: 50, afterMs: 50 },
    { assistLevel: 0, noteSimulateJudgement: 5, noteJudgementType: 5, beforeMs: 83, afterMs: 67 },
    { assistLevel: 1, noteSimulateJudgement: 5, noteJudgementType: 1, beforeMs: 99, afterMs: 99 },
    { assistLevel: 0, noteSimulateJudgement: 4, noteJudgementType: 1, beforeMs: 83, afterMs: 83 },
    { assistLevel: 0, noteSimulateJudgement: 6, noteJudgementType: 10, beforeMs: 67, afterMs: 67 },
    { assistLevel: 0, noteSimulateJudgement: 6, noteJudgementType: 11, beforeMs: 83, afterMs: 83 },
  ];

  test("extracts assist-off Perfect windows, Just types, per-segment notes/maxJust, and opening/ending boundary notes", () => {
    const entries = extractPerfectTimings(rawTimingRows);
    expect(entries).toEqual([
      { noteJudgementType: 1, beforeMs: 50, afterMs: 50 },
      { noteJudgementType: 5, beforeMs: 83, afterMs: 67 },
    ]);
    const justTypes = extractJustTypes(rawTimingRows);
    expect(justTypes).toEqual([10, 11]);

    const chart = runtimeChart({
      score: {
        events: {
          bpm: [{ t: 0, bpm: 120 }],
          sig: [{ t: 0, sig: [4, 4] }],
          // 120 BPM => 480 ticks = 500 ms. [960, 2880] => [1000 ms, 3000 ms].
          fever: [
            [960, 2880],
            [3840, 5760],
          ],
        },
        notes: [
          // Segment 1: simultaneous Tap+Flick chord at t=960 (1000 ms, frame=25=startFrame -> outside (25, 75])
          // + Long slide [1440..2400] (1500..2500 ms -> op 20 & op 22 => judgementTypes 10 & 11 => 2 Justs!)
          // + ending Tap at t=2880 (3000 ms, frame=75=endFrame -> inside (25, 75])
          { type: "tap", t: 960, pos: 2, size: 4 },
          { type: "flick", t: 960, pos: 8, size: 4, dir: "up" },
          {
            type: "long",
            t: 1440,
            pos: 4,
            size: 4,
            node: [
              { type: "node", t: 1440, pos: 4, size: 4 },
              { type: "node", t: 2400, pos: 4, size: 4 },
            ],
          },
          { type: "tap", t: 2880, pos: 4, size: 4 },
          // Segment 2: single Tap at t=3840 (4000 ms, frame=100=startFrame) + Long ending right at t=5760 (6000 ms, frame=150=endFrame)
          { type: "tap", t: 3840, pos: 4, size: 4 },
          {
            type: "long",
            t: 4800,
            pos: 6,
            size: 4,
            node: [
              { type: "node", t: 4800, pos: 6, size: 4 },
              { type: "node", t: 5760, pos: 6, size: 4 },
            ],
          },
        ],
      },
    });

    const segments = gekisoTiming(chart, perfectTimingsMap(entries), justTypes);
    expect(segments).toHaveLength(2);
    // At 1000 ms: frame = ceil(60) = 60, nextTimeMs = floor(61 * 1000 / 60) = 1016 => lateMs = 16
    expect(segments[0]).toEqual({
      notes: 6,
      maxJust: 2,
      opening: { timeMs: 1000, notes: 2, lateMs: 16 },
      ending: { timeMs: 3000, notes: 1, earlyMs: 50 },
    });
    // Segment 2 includes the Long end boundary at 6000 ms (frame 150 <= endFrame 150): 5 notes (Long start + 3 hold ticks + Long end), 2 Just-eligible (types 10 & 11)!
    expect(segments[1]).toEqual({
      notes: 5,
      maxJust: 2,
    });

    // Rejects opening chord when afterMs is smaller than lateMs
    const narrowAfter = new Map([[1, 10], [5, 10]]);
    expect(comboOpening(chart.enumeration, 1000, 3000, narrowAfter)).toBeNull();

    const badgeHtml = renderToStaticMarkup(<GekisoTimingBadges locale="zh-CN" segment={segments[0]!} />);
    expect(badgeHtml).toContain("开段延后");
    expect(badgeHtml).toContain("段尾提前");
    expect(badgeHtml).toContain("16ms");
    expect(badgeHtml).toContain("50ms");
  });
});

describe("5-locale ChartData and Deck guide sync parity", () => {
  test("preserves required section anchors and documents frame-boundary timing & Haneoka engine across all 5 locales", () => {
    for (const locale of CORE_LOCALES) {
      const deckGuide = getDeckGuide(locale);
      const deckIds = deckGuide.sections.map((section) => section.id);
      expect(deckIds).toEqual(["goal", "domain", "proven", "unproven", "search", "result", "sources"]);
      const deckText = JSON.stringify(deckGuide);
      expect(deckText).toContain("haneoka-gakuen/ournotes-team-builder");
      expect(deckText).toContain("17 ms");

      const chartGuide = getChartDataGuide(locale);
      const frameSection = chartGuide.sections.find((section) => section.id === "frame-timing");
      expect(frameSection).toBeDefined();
      expect(frameSection!.math?.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(frameSection)).toContain("17 ms");
    }
  });
});

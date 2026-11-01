import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import DeckResult from "../src/components/deck/DeckResult";
import { GekisoTimingBadges } from "../src/components/music/MusicChartPanel";
import type { BoxCatalog } from "../src/components/box/BoxManager";
import { parseDeckAnswer } from "../src/lib/deck/answer";
import { CAPABILITIES, HANEOKA_COMMIT } from "../src/lib/deck/haneoka/request";
import {
  comboOpening,
  extractPerfectTimings,
  gekisoTiming,
  perfectTimingsMap,
  runtimeChart,
} from "../src/lib/music/gekiso-timing";
import { getChartDataGuide } from "../src/i18n/guides/chart-data";
import { getDeckGuide } from "../src/i18n/guides/deck";

const CORE_LOCALES = ["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const;

describe("Haneoka 9d36aed cumulative-Snap OrderTiming and DeckResult rendering", () => {
  test("pins Haneoka commit 9d36aed and exposes orderTiming capability", () => {
    expect(HANEOKA_COMMIT).toBe("9d36aeda2ea958ab4dfef50710b8861ab9b2d53b");
    expect(CAPABILITIES.orderTiming).toBe(true);
  });

  test("parses cumulative-Snap timing on DeckTeam and renders Best timing ceiling, window strip and step table across locales", () => {
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
                      { step: 1, timeMs: 14120, notes: 2, gain: 3120 },
                      { step: 2, timeMs: 15650, notes: 1, gain: 3300 },
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
    expect(answer.result?.teams[0]?.timing?.advanceMs).toBe(17);
    expect(answer.result?.teams[0]?.timing?.windows[0]?.steps).toHaveLength(2);

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
    expect(zhHtml).toContain("凹分上限");
    expect(zhHtml).toContain("+6,420");
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
    expect(enHtml).toContain("Best timing");
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
  ];

  test("extracts assist-off Perfect windows and identifies opening simultaneous chords and ending boundary notes", () => {
    const entries = extractPerfectTimings(rawTimingRows);
    expect(entries).toEqual([
      { noteJudgementType: 1, beforeMs: 50, afterMs: 50 },
      { noteJudgementType: 5, beforeMs: 83, afterMs: 67 },
    ]);

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
          // Segment 1: simultaneous Tap+Flick chord at t=960 (1000 ms) + ending Tap at t=2880 (3000 ms)
          { type: "tap", t: 960, pos: 2, size: 4 },
          { type: "flick", t: 960, pos: 8, size: 4, dir: "up" },
          { type: "tap", t: 2880, pos: 4, size: 4 },
          // Segment 2: single Tap at t=3840 (4000 ms) -> should NOT trigger opening chord
          { type: "tap", t: 3840, pos: 4, size: 4 },
        ],
      },
    });

    const segments = gekisoTiming(chart, perfectTimingsMap(entries));
    expect(segments).toHaveLength(2);
    // At 1000 ms: frame = ceil(60) = 60, nextTimeMs = floor(61 * 1000 / 60) = 1016 => lateMs = 16
    expect(segments[0]).toEqual({
      opening: { timeMs: 1000, notes: 2, lateMs: 16 },
      ending: { timeMs: 3000, notes: 1, earlyMs: 50 },
    });
    expect(segments[1]).toEqual({});

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

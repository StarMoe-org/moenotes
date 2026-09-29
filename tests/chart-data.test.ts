import { describe, expect, test } from "bun:test";
import { chartRows, histogram, matches, noteKinds, sortBy, ticks } from "../src/lib/chart-data/catalog";
import { parseChartDataQuery, playScenario, roomSize, serializeChartDataQuery, type QueryContext } from "../src/lib/chart-data/query";
import {
  chartFigures,
  dominates,
  eventDominates,
  formatLength,
  joinCharts,
  lengthMs,
  meanSkill,
  orderRates,
  plainKind,
  quantile,
  rank,
  rankThreshold,
  reachChance,
  requiredPower,
  roomThreshold,
  scoreRate,
  weightSum,
} from "../src/lib/chart-data/ranking";
import {
  BEST_BATTLE,
  FREE,
  formatRanks,
  greatFactor,
  parseRanks,
  rankPercent,
  scenarioSeed,
  scenarioSupport,
  type Scenario,
} from "../src/lib/chart-data/scenario";
import { localizeDataText } from "../src/lib/chart-data/text";
import type { ChartDeck, DataSong, DeckRange, DeckSeed, MusicData } from "../src/lib/chart-data/types";

const POWER = 300000;
const KINDS = [
  { id: 0, effectType: 2000, durationMs: 5000, skillTargetIds: [], skillConditionGroup: 0 },
  { id: 1, effectType: 2004, durationMs: 5000, skillTargetIds: [41, 46], skillConditionGroup: 0 },
];

function seed(score: number, plain: number[], extra: Partial<DeckSeed> = {}): DeckSeed {
  return { seed: 0, score, weights: [plain, plain.map((w) => w / 2)], ...extra };
}

function deck(seeds: DeckSeed[], extra: Partial<ChartDeck> = {}): ChartDeck {
  return { skip: 2.5, positions: 5, events: [[0, 1000], [1, 2000], [2, 3000], [3, 4000], [4, 5000]], ranges: [], seeds, unplayable: null, ...extra };
}

function song(id: number, charts: DataSong["charts"], extra: Partial<DataSong> = {}): DataSong {
  return {
    id,
    title: { ja: `曲${id}`, en: `Song ${id}`, "zh-Hans": "", "zh-Hant": "", ko: "" },
    bandIds: [1],
    musicType: 1,
    bgm: { length: { lengthMs: 100000, durationMs: 100000 } },
    scoreRanks: [{ rank: "D", requiredScore: 0, battleRequiredScore: 0 }, { rank: "S", requiredScore: 6000000, battleRequiredScore: 4000000 }, { rank: "SS", requiredScore: 9000000, battleRequiredScore: 6000000 }],
    charts,
    ...extra,
  };
}

const chart = (scoreId: number, difficulty: string, d: ChartDeck | null, lengthMs = 99000) => ({
  difficulty,
  scoreId,
  level: 20,
  displayLevel: 20.5,
  notes: { judged: 600, byOperateType: { "1": 300, "20": 50, "40": 100, "60": 20, "120": 130, "122": 10 } },
  bpm: { main: 180, min: 170, max: 190, changes: [{ timeMs: 0, bpm: 170 }, { timeMs: 30000, bpm: 190 }] },
  firstNoteMs: 2000,
  lastJudgedNoteMs: 92000,
  musicLengthMs: lengthMs,
  deck: d,
});

const W = [0.5, 1, 1.5, 1, 1];
const data: MusicData = {
  format: "nnnotes.music-data/1",
  deck: { model: { power: POWER }, kinds: KINDS },
  songs: [
    song(1, [
      chart(11, "hard", deck([seed(2.0 * POWER, W)])),
      chart(12, "expert", deck([seed(3.0 * POWER, W), seed(3.3 * POWER, W.map((w) => w + 0.2))])),
    ]),
    song(2, [chart(21, "expert", deck([seed(1.0 * POWER, [0.1, 0.1, 0.1, 0.1, 0.1])]), 150000)], {
      bgm: { length: { lengthMs: 150000, durationMs: 150000 } },
    }),
    song(3, [chart(31, "expert", deck([], { unplayable: "fevers", offSeeds: [seed(1.2 * POWER, W)] }))]),
  ],
};

describe("chart figures", () => {
  test("the plain kind is effect 2000 on the whole deck", () => {
    expect(plainKind(data)).toBe(0);
    expect(plainKind({ deck: { kinds: [KINDS[1]!] } })).toBeNull();
  });
  test("base and weights are the seed means", () => {
    const f = chartFigures(data.songs![0]!.charts![1]!.deck, 0, POWER)!;
    expect(f.base).toBeCloseTo(3.15, 12);
    expect(f.baseRange).toEqual([3, 3.3]);
    expect(f.seeds).toBe(2);
    expect(f.weights.map((w) => +w.toFixed(12))).toEqual([0.6, 1.1, 1.6, 1.1, 1.1]);
  });
  test("an unplayable chart has no Gekisou figures but keeps its Free Live ones", () => {
    const d = data.songs![2]!.charts![0]!.deck;
    expect(chartFigures(d, 0, POWER, BEST_BATTLE)).toBeNull();
    expect(chartFigures(d, 0, POWER, FREE)!.base).toBeCloseTo(1.2, 12);
    expect(chartFigures(data.songs![0]!.charts![0]!.deck, 0, POWER, FREE)).toBeNull();
  });
  test("rows join the song facts", () => {
    const rows = chartRows(data);
    expect(rows.map((r) => r.scoreId)).toEqual([11, 12, 21, 31]);
    expect(rows[0]!.kinds).toEqual({ tap: 300, flick: 100, slide: 50, trace: 20, combo: 130 });
    expect(rows[0]!.density).toBeCloseTo(600 / 90, 12);
    expect(rows[3]!.weights).toBeNull();
    expect(joinCharts(data, FREE).map((r) => r.scoreId)).toEqual([31]);
  });
});

describe("expected score over the skill order", () => {
  const row = { base: 2, weights: W, bgmMs: 100000, chartMs: 99000 };
  test("the expectation only uses the mean skill value", () => {
    expect(weightSum(row)).toBe(5);
    expect(meanSkill([1.5, 1, 0.5, 0, 0])).toBe(0.6);
    expect(scoreRate(row, [1.5, 1, 0.5, 0, 0])).toBeCloseTo(5, 12);
    const rates = orderRates(row, [1.5, 1, 0.5, 0, 0]);
    expect(rates).toHaveLength(120);
    expect(rates.reduce((a, b) => a + b, 0) / rates.length).toBeCloseTo(5, 12);
    expect(rates[0]).toBeLessThan(rates[119]!);
    expect(new Set(orderRates(row, [1, 1, 1, 1, 1]))).toEqual(new Set([7]));
    expect(quantile(rates, 0.1)).toBe(rates[12]!);
  });
  test("lengths fall back to the other source", () => {
    expect(lengthMs(row, "bgm")).toBe(100000);
    expect(lengthMs(row, "chart")).toBe(99000);
    expect(lengthMs({ bgmMs: null, chartMs: 99000 }, "bgm")).toBe(99000);
    expect(lengthMs({ bgmMs: null, chartMs: null }, "bgm")).toBeNull();
  });
  test("dominance checks both skill ends and both overhead ends", () => {
    const a = { base: 3, weights: W, bgmMs: 100000, chartMs: 100000 };
    const shorter = { base: 2.9, weights: W, bgmMs: 90000, chartMs: 90000 };
    const worse = { base: 2, weights: W, bgmMs: 100000, chartMs: 100000 };
    expect(dominates(a, worse, "bgm")).toBe(true);
    expect(dominates(worse, a, "bgm")).toBe(false);
    expect(dominates(a, shorter, "bgm")).toBe(false);
    expect(dominates(shorter, a, "bgm")).toBe(false);
    expect(dominates(a, a, "bgm")).toBe(false);
    const ranked = rank(joinCharts(data), { skills: [1, 1, 1, 1, 1], source: "bgm", overheadMs: 30000 });
    expect(ranked.map((r) => r.scoreId)).toEqual([12, 11, 21]);
    expect(ranked.map((r) => r.frontier)).toEqual([true, false, false]);
    expect(ranked[2]!.dominatedBy).toHaveLength(2);
  });
  test("score ranks: power needed and the chance", () => {
    const r = { ...row, scoreRanks: data.songs![0]!.scoreRanks! };
    expect(requiredPower(r, [1, 1, 1, 1, 1], "SS")).toBeCloseTo(9000000 / 7, 6);
    expect(requiredPower(r, [1, 1, 1, 1, 1], "SS", 0.9)).toBeCloseTo(9000000 / 6.3, 6);
    expect(requiredPower(r, [1, 1, 1, 1, 1], "D")).toBe(0);
    expect(requiredPower(r, [1, 1, 1, 1, 1], "A")).toBeNull();
    expect(reachChance(r, [1, 1, 1, 1, 1], 1300000, "SS")).toBe(1);
    expect(reachChance(r, [1, 1, 1, 1, 1], 1200000, "SS")).toBe(0);
    const chance = reachChance(r, [1.5, 1, 0.5, 0, 0], 9000000 / 5, "SS")!;
    expect(chance).toBeGreaterThan(0);
    expect(chance).toBeLessThan(1);
    const b = { ...r, base: 1.9 };
    expect(eventDominates(r, b, "bgm")).toBe(true);
    expect(eventDominates(b, r, "bgm")).toBe(false);
  });
  test("a Gekisou Live room rates the summed score", () => {
    expect(roomThreshold(6000000, 5)).toBe(6000000);
    expect(roomThreshold(6000000, 1)).toBe(Math.trunc(Math.sqrt(5) * 6000000));
    expect(roomThreshold(6000000, 2)).toBe(Math.trunc(Math.sqrt(2.5) * 6000000 * 2) / 2);
    const r = { ...row, scoreRanks: data.songs![0]!.scoreRanks! };
    expect(rankThreshold(r, "SS")).toBe(9000000);
    expect(rankThreshold(r, "SS", 5)).toBe(6000000);
    expect(rankThreshold({ scoreRanks: [{ rank: "SS", requiredScore: 1 }] }, "SS", 5)).toBeNull();
    expect(requiredPower(r, [1, 1, 1, 1, 1], "SS", 1, 5)).toBeCloseTo(6000000 / 7, 6);
  });
  test("lengths print as m:ss.s", () => {
    expect(formatLength(99989)).toBe("1:40.0");
    expect(formatLength(59950)).toBe("1:00.0");
    expect(formatLength(125049)).toBe("2:05.0");
    expect(formatLength(-1)).toBe("");
  });
});

describe("scenarios", () => {
  const pct = [250, 190, 160, 100, 100];
  // range 0 is a Just range, 1 a combo range, 2 a luck range
  const ranges: DeckRange[] = [
    { index: 0, mission: 3, rankBonusPercent: 250, rankBonusPercents: pct },
    { index: 1, mission: 1, rankBonusPercent: 250, rankBonusPercents: pct },
    { index: 2, mission: 2, rankBonusPercent: 250, rankBonusPercents: pct },
  ];
  const measured: DeckSeed = {
    seed: 0,
    score: 1000000,
    scorePerfect: 800000,
    ranges: [{ rangeScore: 100001, rankBonus: 250002, rangeScorePerfect: 60000 }, { rangeScore: 50000, rankBonus: 125000 }, { rangeScore: 0, rankBonus: 0 }],
    weights: [[1, 2, 3, 4, 5], [0.5, 0.5, 0.5, 0.5, 0.5]],
    rangeWeights: [
      [[0.1, 0, 0], [0, 0.2, 0], [0, 0, 0], [0, 0, 0.4], [0, 0, 0]],
      null,
    ],
  };
  const battle = (ranks: number[], extra: Partial<Scenario> = {}): Scenario => ({ id: "battle", ranks, ...extra });
  test("rank 1 everywhere, every Just, is the measurement itself", () => {
    expect(scenarioSeed(measured, ranges, 0, BEST_BATTLE)).toEqual({ score: 1000000, weights: [1, 2, 3, 4, 5] });
    expect(scenarioSeed(measured, ranges, 1, null)).toEqual({ score: 1000000, weights: [0.5, 0.5, 0.5, 0.5, 0.5] });
  });
  test("other ranks follow linearly from the range scores and weights", () => {
    expect(rankPercent(ranges[0], 5)).toBe(100);
    expect(rankPercent({ rankBonusPercent: 250 }, 1)).toBe(250);
    expect(rankPercent({ rankBonusPercent: 250 }, 2)).toBeNull();
    const s = scenarioSeed(measured, ranges, 0, battle([5, 2, 1]))!;
    expect(s.score).toBe(1000000 - 375002 + 100001 + 95000);
    expect(s.weights[0]).toBeCloseTo(1 - 1.5 * 0.1, 12);
    expect(s.weights[1]).toBeCloseTo(2 - 0.6 * 0.2, 12);
    expect(s.weights[3]).toBe(4);
    // a kind whose range weights are null (it reads the confirmed rank) has no figures at other ranks
    expect(scenarioSeed(measured, ranges, 1, battle([5, 2, 1]))).toBeNull();
    expect(scenarioSeed({ ...measured, rangeWeights: null }, ranges, 0, battle([2, 1, 1]))).toBeNull();
  });
  test("the Just rate interpolates to the all-Perfect play and re-ranks its range scores", () => {
    const s = scenarioSeed(measured, ranges, 0, battle([1, 1, 1], { just: 0.5 }))!;
    const rest = 525000 + 0.5 * (624998 - 525000);                    // no rank bonuses: Perfect play, Just play
    const range0 = 60000 + 0.5 * (100001 - 60000);
    expect(s.score).toBe(rest + Math.trunc(range0 * 2.5) + 125000);
    expect(s.weights[0]).toBeCloseTo(1 + (range0 / 100001 - 1) * 3.5 * 0.1, 12);
    expect(s.weights[1]).toBe(2);                                       // range 1 has no Just: the same either way
    expect(scenarioSeed(measured, ranges, 0, battle([1, 1, 1], { just: 0 }))!.score).toBe(800000);
    const noPerfect = { ...measured, ranges: [{ rangeScore: 100001, rankBonus: 250002 }, ...measured.ranges!.slice(1)] };
    expect(scenarioSeed(noPerfect, ranges, 0, battle([1, 1, 1], { just: 0.5 }))).toBeNull();
    expect(scenarioSeed({ ...measured, scorePerfect: undefined }, ranges, 0, battle([1, 1, 1], { just: 0.5 }))).toBeNull();
  });
  test("the Great share scales score and weights; Free Live reads its own seed", () => {
    expect(greatFactor(0.5)).toBeCloseTo(0.9, 12);
    expect(greatFactor(undefined)).toBe(1);
    const s = scenarioSeed(measured, ranges, 0, battle([1, 1, 1], { great: 1 }))!;
    expect(s.score).toBeCloseTo(800000, 6);
    expect(s.weights[4]).toBeCloseTo(4, 12);
    expect(scenarioSeed(seed(1000, [1, null as unknown as number, 3]), [], 0, FREE)).toEqual({ score: 1000, weights: [1, 0, 3] });
  });
  test("support follows the fields", () => {
    expect(scenarioSupport(data)).toEqual({ battle: true, free: true, ranks: false, just: false });
    const full: MusicData = { songs: [song(9, [chart(91, "expert", deck([measured], { ranges }))])] };
    expect(scenarioSupport(full)).toEqual({ battle: true, free: false, ranks: true, just: true });
  });
  test("ranks in the query", () => {
    expect(parseRanks("3")).toEqual([3, 3, 3]);
    expect(parseRanks("2,1")).toEqual([2, 1, 1]);
    expect(parseRanks("9,x,5")).toEqual([1, 1, 5]);
    expect(parseRanks(null)).toEqual([1, 1, 1]);
    expect(formatRanks([1, 1, 1])).toBe("");
    expect(formatRanks([3, 3, 3])).toBe("3");
    expect(formatRanks([2, 1, 5])).toBe("2,1,5");
  });
});

describe("catalog helpers", () => {
  test("note kinds leave unjudged notes out", () => {
    expect(noteKinds({ "1": 2, "101": 3, "122": 9, "63": 1 })).toEqual({ tap: 5, flick: 0, slide: 0, trace: 1, combo: 0 });
  });
  test("search reads every language and the music id", () => {
    const rows = chartRows(data);
    expect(rows.filter((r) => matches(r, "song 2")).map((r) => r.scoreId)).toEqual([21]);
    expect(rows.filter((r) => matches(r, "曲1")).map((r) => r.scoreId)).toEqual([11, 12]);
    expect(rows.filter((r) => matches(r, "3")).map((r) => r.scoreId)).toEqual([31]);
  });
  test("sorting keeps missing values last", () => {
    const rows = [{ scoreId: 3, v: null }, { scoreId: 1, v: 2 }, { scoreId: 2, v: 5 }];
    expect(sortBy(rows, (r) => r.v).map((r) => r.scoreId)).toEqual([2, 1, 3]);
    expect(sortBy(rows, (r) => r.v, true).map((r) => r.scoreId)).toEqual([1, 2, 3]);
  });
  test("ticks and histogram", () => {
    expect(ticks(0, 31.3, 8)).toEqual([0, 5, 10, 15, 20, 25, 30]);
    expect(histogram(chartRows(data), (r) => r.level)).toEqual([[20, { easy: 0, normal: 0, hard: 1, expert: 3 }]]);
  });
  test("song texts follow the masterdata language order", () => {
    const title = { ja: "迷星叫", en: "Mayoiuta", "zh-Hant": "迷星叫", "zh-Hans": "", ko: "헤매는 노래" };
    expect(localizeDataText(title, "zh-CN")).toBe("迷星叫");
    expect(localizeDataText(title, "en-US")).toBe("Mayoiuta");
    expect(localizeDataText(title, "ko-KR")).toBe("헤매는 노래");
    expect(localizeDataText({ ja: "", en: "", ko: "x" }, "ja-JP")).toBe("x");
    expect(localizeDataText(null, "ja-JP")).toBe("");
  });
});

describe("query", () => {
  const ctx: QueryContext = { hasStats: true, support: { free: true, ranks: true, just: true } };
  test("defaults leave an empty query", () => {
    const state = parseChartDataQuery("", ctx);
    expect(state.view).toBe("rank");
    expect(state.rankBy).toBe("efficiency");
    expect(state.diffs).toEqual(["expert"]);
    expect(state.skills).toEqual([100, 100, 100, 100, 100]);
    expect([state.mode, state.ranks, state.great, state.just, state.room]).toEqual(["battle", [1, 1, 1], 0, 100, 5]);
    expect(playScenario(state)).toEqual(BEST_BATTLE);
    expect(roomSize(state)).toBe(5);
    expect(serializeChartDataQuery(state, ctx)).toBe("");
  });
  test("a query round-trips", () => {
    const query = "v=charts&band=2&d=hard%2Cexpert&q=ave&r=event&len=chart&oh=45&x=150%2C120%2C0%2C0%2C0&p=800000&tr=S&rk=2%2C1%2C5&gr=20&jr=80&n=3&jk=off&ax=bpm&ay=rate&c=10000103&frontier";
    const state = parseChartDataQuery(query, ctx);
    expect(playScenario(state)).toEqual({ id: "battle", ranks: [2, 1, 5], great: 0.2, just: 0.8 });
    expect(state.room).toBe(3);
    expect(state.frontier).toBe(true);
    expect(state.chart).toBe(10000103);
    expect(serializeChartDataQuery(state, ctx)).toBe(query);
  });
  test("one rank stands for every range; Free Live is gk=free and rates solo", () => {
    const state = parseChartDataQuery("rk=3", ctx);
    expect(state.ranks).toEqual([3, 3, 3]);
    expect(serializeChartDataQuery(state, ctx)).toBe("rk=3");
    const free = parseChartDataQuery("gk=free&gr=10&jr=50", ctx);
    expect(free.mode).toBe("free");
    expect(roomSize(free)).toBe(0);
    expect(serializeChartDataQuery(free, ctx)).toBe("gk=free&gr=10&jr=50");
  });
  test("what the file cannot show falls back", () => {
    const none: QueryContext = { hasStats: true, support: { free: false, ranks: false, just: false } };
    const state = parseChartDataQuery("gk=free&rk=3&jr=50", none);
    expect([state.mode, state.ranks, state.just]).toEqual(["battle", [1, 1, 1], 100]);
  });
  test("values are clamped and rankings without statistics fall back", () => {
    const state = parseChartDataQuery("r=efficiency&oh=9999&x=50,-1,abc&gr=300&jr=-5&n=9&tr=X&v=nope", { hasStats: false, support: { free: true, ranks: true, just: true } });
    expect(state.rankBy).toBe("speed");
    expect(state.overhead).toBe(600);
    expect(state.skills).toEqual([50, 0, 0, 0, 0]);
    expect(state.great).toBe(100);
    expect(state.just).toBe(0);
    expect(state.room).toBe(5);
    expect(state.target).toBe("SS");
    expect(state.view).toBe("rank");
    expect(state.ay).toBe("density");
    expect(parseChartDataQuery("n=-2", ctx).room).toBe(1);
  });
});

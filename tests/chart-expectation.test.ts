import { describe, expect, test } from "bun:test";
import { chartFigures } from "../src/lib/chart-data/ranking";
import { hasNominalStatistics, scenarioExpectation } from "../src/lib/chart-data/expectation";
import { FREE, scenarioSupport } from "../src/lib/chart-data/scenario";
import { aptitudeFigures, aptitudeRadius, aptitudeSe, rangeMeasures } from "../src/lib/chart-data/gekisou";
import type { ChartDeck, DeckExpectation, DeckRange } from "../src/lib/chart-data/types";
import type { AptitudeVariant, MusicData } from "../src/lib/chart-data/types";
import { fmtBounds, fmtEstimate } from "../src/components/chart-data/shared";
import { t } from "../src/i18n";
import { SUPPORTED_LOCALES } from "../src/config/locales";

const ranges: DeckRange[] = [{ mission: 2, rankBonusPercent: 250, rankBonusPercents: [250, 190, 160, 100, 100] }];
const expected: DeckExpectation = {
  score: [100, 0.1], scorePerfect: [80, 0.1],
  ranges: [{ rangeScore: [20.25, 0.01], rangeScorePerfect: [15.25, 0.01], rankBonus: [49.6, 0.01],
    rankBonusPerfect: [37.3, 0.01], maxCombo: 8, justCount: 0, luckPoints: [3.25, 0.125],
    lotResults: [[1, 0], [2, 0], [0, 0], [1, 0]] }],
  weights: [[[0.5, 1e-10], [0.25, 1e-10]]], rangeWeights: [[[[0.1, 1e-10]], [[0.05, 1e-10]]]],
};
const deck: ChartDeck = { expectation: expected, ranges, positions: 2, replaySeeds: [11, 22], skip: 0.1,
  offSeeds: [{ seed: 0, score: 70, weights: [[0.4, 0.2]] }] };
const variantRanges = expected.ranges.map(({ rangeScore, rangeScorePerfect, rankBonus, rankBonusPerfect }) =>
  ({ rangeScore, rangeScorePerfect, rankBonus, rankBonusPerfect }));

describe("nominal chart expectations", () => {
  test("rank 1 uses the measured center and enclosure, independent of replay seeds", () => {
    const a = chartFigures(deck, 0, 10);
    expect(a).toEqual({ base: 10, baseRange: [9.99, 10.01], weights: [0.5, 0.25], seeds: 0, skip: 0.1 });
    expect(chartFigures({ ...deck, replaySeeds: [123456] }, 0, 10)).toEqual(a);
  });
  test("another rank uses the expected range product without truncating its mean", () => {
    const f = scenarioExpectation(expected, ranges, 0, { id: "battle", ranks: [2] });
    expect(f?.score).toBeCloseTo(100 - 49.6 + 20.25 * 1.9, 12);
    expect(f?.weights).toEqual([0.44, 0.22]);
    expect(f?.scoreBounds).toBeNull();
  });
  test("Perfect and partial Just preserve both measured rank-1 bonuses", () => {
    const perfect = scenarioExpectation(expected, ranges, 0, { id: "battle", ranks: [1], just: 0 });
    const mixed = scenarioExpectation(expected, ranges, 0, { id: "battle", ranks: [1], just: 0.5 });
    expect(perfect?.score).toBe(80);
    expect(mixed?.score).toBe(90);
    expect(scenarioExpectation(expected, ranges, 0, { id: "battle", ranks: [2], just: 0 })?.score)
      .toBeCloseTo(80 - 37.3 + 15.25 * 1.9, 12);
  });
  test("Free Live and Great use their declared independent paths", () => {
    expect(chartFigures(deck, 0, 10, FREE)?.base).toBe(7);
    expect(scenarioExpectation(expected, ranges, 0, { id: "battle", ranks: [1], great: 0.5 })?.score).toBe(90);
    expect(chartFigures({ ...deck, unplayable: "four ranges", expectation: null }, 0, 10)).toBeNull();
    expect(chartFigures({ ...deck, unplayable: "four ranges", expectation: null }, 0, 10, FREE)?.base).toBe(7);
  });
  test("the probability enclosure is not a sampled min/max", () => {
    expect(rangeMeasures(deck)[0]?.values).toEqual({ maxCombo: { mean: 8, min: 8, max: 8 },
      justCount: { mean: 0, min: 0, max: 0 }, luckPoints: { mean: 3.25, min: 3.125, max: 3.375 } });
    expect(scenarioSupport({ songs: [{ id: 1, charts: [{ difficulty: "easy", scoreId: 10, level: 1, deck }] }] }))
      .toEqual({ battle: true, free: true, ranks: true, just: true });
  });
  test("invalid expectations cannot fall back to unrelated legacy seed statistics", () => {
    const stale = { ...deck, expectation: null, seeds: [{ score: 999, weights: [[9, 9]] }] };
    expect(chartFigures(stale, 0)).toBeNull();
    const { expectation: _, ...missing } = stale;
    expect(chartFigures(missing, 0)).toBeNull();
    for (const score of [[100, -1], [NaN, 0], [100, Infinity], [100]] as const) {
      expect(scenarioExpectation({ ...expected, score } as DeckExpectation, ranges, 0, null)).toBeNull();
    }
    expect(scenarioExpectation({ ...expected, rangeWeights: null }, ranges, 0, { id: "battle", ranks: [2] })).toBeNull();
    expect(chartFigures({ ...deck, positions: 3 }, 0)).toBeNull();
  });
  test("a shape without a linear rank response is not extrapolated to other ranks", () => {
    expect(aptitudeFigures({ shape: 0, score: [100, 0.1], ranges: [{ rangeScore: [10, 0] }],
      tail: [90, 0], rangeWeights: null }, ranges, 10, { id: "battle", ranks: [2] }, true)).toBeNull();
  });
  test("nominal aptitude keeps measured rank-1 bonuses in a mixed-rank scenario", () => {
    const variant = { shape: 0, score: [100, 0.1] as const, scorePerfect: [80, 0.1] as const,
      ranges: [0, 1].map(() => ({ rangeScore: [10.25, 0.01] as const, rangeScorePerfect: [8.25, 0.01] as const,
        rankBonus: [24.8, 0.01] as const, rankBonusPerfect: [19.8, 0.01] as const })),
      weights: [[0.1, 0.001] as const], rangeWeights: [[[0.01, 0.0001] as const, [0.02, 0.0001] as const]] };
    const mixed = aptitudeFigures(variant, [...ranges, ...ranges], 10, { id: "battle", ranks: [1, 2] }, true);
    expect(mixed?.base).toBeCloseTo((100 + 10.25 * 1.9 - 24.8) / 10, 12);
    expect(mixed?.baseRadius).toBeNull();
    const raw = aptitudeFigures(variant, [...ranges, ...ranges], 10, null, true);
    expect(aptitudeSe(raw, [0])).toBeNull();
    expect(aptitudeRadius(raw, [0])).toBe(0.01);
    expect(aptitudeRadius(raw, [1])).toBeNull();
  });
  test("missing or malformed range rows fail safely before nominal scenario selection", () => {
    for (const badRanges of [undefined, null, {}, [], [null], [12]]) {
      const invalid = { ...deck, expectation: { ...expected, ranges: badRanges },
        seeds: [{ score: 999, weights: [[9, 9]] }] } as unknown as ChartDeck;
      expect(chartFigures(invalid, 0)).toBeNull();
      expect(chartFigures(invalid, 0, 10, { id: "battle", ranks: [2] })).toBeNull();
      expect(chartFigures(invalid, 0, 10, { id: "battle", ranks: [1], just: 0.5 })).toBeNull();
    }
    for (const badRanges of [{}, [null], [12]]) {
      expect(chartFigures({ ...deck, ranges: badRanges } as unknown as ChartDeck, 0)).toBeNull();
    }
    expect(hasNominalStatistics(7 as unknown as ChartDeck)).toBe(false);
    expect(rangeMeasures({ ...deck, ranges: {} } as unknown as ChartDeck)).toEqual([]);
    const missingRanges = { ...deck, expectation: { ...expected, ranges: undefined },
      seeds: [{ ranges: [{ luckPoints: 999 }] }] } as unknown as ChartDeck;
    expect(rangeMeasures(missingRanges)[0]?.values.luckPoints).toBeNull();
  });
  test("scenario support uses readable estimates and dimensions, not array presence", () => {
    const badExpectations = [
      { weights: [], scorePerfect: [80, -1], rangeWeights: [[]] },
      { ...expected, score: [100, -1] },
      { ...expected, ranges: undefined },
      { ...expected, ranges: [null] },
      { ...expected, weights: [[[1, -1]]] },
    ];
    for (const expectation of badExpectations) {
      const data = { songs: [{ charts: [{ deck: { ...deck, expectation,
        seeds: [{ score: 999, scorePerfect: 888, weights: [[9, 9]], rangeWeights: [[[9], [9]]] }] } }] }] } as unknown as MusicData;
      expect(scenarioSupport(data)).toEqual({ battle: false, free: true, ranks: false, just: false });
    }
    const incomplete = { songs: [{ charts: [{ deck: { ...deck, expectation: {
      ...expected, rangeWeights: [[]], scorePerfect: [80, -1],
    } } }] }] } as unknown as MusicData;
    expect(scenarioSupport(incomplete)).toEqual({ battle: true, free: true, ranks: false, just: false });
    const wrongPositions = { songs: [{ charts: [{ deck: { ...deck, positions: 3 } }] }] } as unknown as MusicData;
    expect(scenarioSupport(wrongPositions)).toEqual({ battle: false, free: true, ranks: false, just: false });
    const unplayable = { songs: [{ charts: [{ deck: { ...deck, unplayable: "four ranges" } }] }] } as unknown as MusicData;
    expect(scenarioSupport(unplayable)).toEqual({ battle: false, free: true, ranks: false, just: false });
  });
  test("partial Just and missing ordinary weights cannot bypass the nominal rank domain", () => {
    const variant: AptitudeVariant = { shape: 0, score: [100, 0.1], scorePerfect: [80, 0.1],
      ranges: variantRanges, weights: [[0.1, 0.001]], rangeWeights: [[[0.01, 0.0001]]] };
    for (const rangeWeights of [null, [], [[]], [[[0.01, -1]]]]) {
      for (const just of [1, 0.5]) {
        for (const weights of [variant.weights, null]) {
          const invalid = { ...variant, weights, rangeWeights } as AptitudeVariant;
          expect(aptitudeFigures(invalid, ranges, 10, { id: "battle", ranks: [2], just }, true)).toBeNull();
        }
      }
    }
    expect(aptitudeFigures({ ...variant, weights: null, rangeWeights: null }, ranges, 10, null, true)?.base).toBe(10);
    expect(aptitudeFigures({ ...variant, ranges: [null] } as unknown as AptitudeVariant,
      ranges, 10, { id: "battle", ranks: [2] }, true)).toBeNull();
  });
  test("a missing rank-1 percentage cannot silently become zero in nominal cross weights", () => {
    const variant: AptitudeVariant = { shape: 0, score: [100, 0.1], scorePerfect: [80, 0.1],
      ranges: variantRanges, weights: [[0.1, 0.001]], rangeWeights: [[[0.01, 0.0001]]] };
    const missingRank1 = [{ mission: 2, rankBonusPercents: [null, 190, 160, 100, 100] }] as unknown as DeckRange[];
    for (const just of [1, 0.5]) {
      expect(aptitudeFigures(variant, missingRank1, 10, { id: "battle", ranks: [2], just }, true)).toBeNull();
    }
    expect(aptitudeFigures(variant, ranges, 10, { id: "battle", ranks: [2] }, true)?.weights).toEqual([0.094]);
  });
  test("nominal arithmetic overflow stays unavailable", () => {
    expect(chartFigures(deck, 0, Number.MIN_VALUE)).toBeNull();
    const variant: AptitudeVariant = { shape: 0, score: [100, 0.1], scorePerfect: [80, 0.1],
      ranges: variantRanges, weights: [[0.1, 0.001]], rangeWeights: [[[0.01, 0.0001]]] };
    expect(aptitudeFigures(variant, ranges, Number.MIN_VALUE, null, true)).toBeNull();
    expect(aptitudeFigures({ ...variant, ranges: [{ ...variantRanges[0]!, rangeScore: [Number.MAX_VALUE, 0] }] },
      ranges, 10, { id: "battle", ranks: [2] }, true)).toBeNull();
  });
  test("nominal UI formatting preserves narrow enclosures and rejects invalid radii", () => {
    expect(fmtBounds([3.125, 3.375])).toBe("[3.125, 3.375]");
    expect(fmtEstimate([3.25, 0.125])).toBe("3.25 [3.125, 3.375]");
    expect(fmtEstimate([1, 0.000001])).toBe("1 [0.999999, 1.000001]");
    expect(fmtEstimate([100, -1])).toBe("–");
    expect(fmtEstimate([100])).toBe("–");
    expect(fmtBounds([Infinity, Infinity])).toBe("–");
    expect(fmtBounds([2, 1])).toBe("–");
  });
  test("every supported locale has nominal descriptions without inheriting legacy SE messages", () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const key of ["expectationHint", "expectationMetricsHint", "expectationApproximation", "expectationFactorsHint", "missingRank"]) {
        expect(t(locale, `chartData.aptitude.${key}`).length).toBeGreaterThan(0);
      }
      expect(t(locale, "chartData.detail.expectationWeightsHint").length).toBeGreaterThan(0);
    }
    expect(t("es-ES", "chartData.aptitude.expectationMetricsHint")).toBe(t("en-US", "chartData.aptitude.expectationMetricsHint"));
    expect(t("es-ES", "chartData.aptitude.expectationMetricsHint")).not.toBe(t("es-ES", "chartData.aptitude.metricsHint"));
  });
});

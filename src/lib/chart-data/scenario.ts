import type { ChartDeck, DeckRange, DeckSeed, DeckSeedRange, MusicData } from "./types";

/**
 * Where a live is played, which decides what the deck statistics mean. This module is the one place that turns a
 * chart's deck statistics into the per-seed no-skill score and skill weights a scenario scores with; everything
 * downstream (ranking.ts `chartFigures`) only averages what it returns.
 *
 * - `free`: Free Live (and Challenge Live), solo with Gekisou off: no Gekisou ranges, no Just, no rank bonus. Read
 *   from `deck.offSeeds` (measured with Gekisou off, the same shape as `seeds` without range fields); a chart with
 *   more than three fevers is still playable here.
 * - `battle`: Gekisou Live (up to five players), Gekisou on, rank `ranks[i]` (1..5) in range i. Rank 1 in every
 *   range is `deck.seeds` as measured; other ranks follow linearly from it (see `rankedSeed`), which needs
 *   `seeds[].rangeWeights` and `ranges[].rankBonusPercents`.
 *
 * A scenario the file has no statistics for yields no seeds, and the page leaves its figures out.
 */
export type ScenarioId = "free" | "battle";

export interface Scenario {
  id: ScenarioId;
  /** Gekisou Live rank per range index (1 = first); missing entries count as 1. Ignored by `free`. */
  ranks: readonly number[];
}

export const SCENARIOS: readonly ScenarioId[] = ["free", "battle"];
/** Gekisou Live seats up to five players. */
export const BATTLE_RANKS = [1, 2, 3, 4, 5] as const;
/** The Gekisou ranges of a playable chart (the game keeps three). */
export const RANGE_COUNT = 3;
export const BEST_RANKS: readonly number[] = [1, 1, 1];
/** The deck statistics as measured: Gekisou Live, rank 1 in every range. */
export const BEST_BATTLE: Scenario = { id: "battle", ranks: BEST_RANKS };
export const FREE: Scenario = { id: "free", ranks: BEST_RANKS };

/** Rank of range `i` under a scenario, clamped to 1..5. */
export function rangeRank(scenario: Scenario, i: number): number {
  const r = Math.round(Number(scenario.ranks[i] ?? 1));
  return Number.isFinite(r) ? Math.min(5, Math.max(1, r)) : 1;
}

const bestRanks = (scenario: Scenario, ranges: number) => [...Array(ranges).keys()].every((i) => rangeRank(scenario, i) === 1);

/**
 * The seed measurements a scenario scores a chart with, or null when the file has none for it: `free` reads
 * `offSeeds`, `battle` reads `seeds` (not for an unplayable chart), re-ranked when a range is not at rank 1.
 */
export function scenarioSeeds(deck: ChartDeck | null | undefined, scenario: Scenario): readonly DeckSeed[] | null {
  if (!deck) return null;
  if (scenario.id === "free") return Array.isArray(deck.offSeeds) ? deck.offSeeds : null;
  if (deck.unplayable || !Array.isArray(deck.seeds)) return null;
  const ranges = deck.ranges ?? [];
  if (bestRanks(scenario, ranges.length)) return deck.seeds;
  const out: DeckSeed[] = [];
  for (const seed of deck.seeds) {
    const ranked = rankedSeed(seed, ranges, scenario);
    if (!ranked) return null;
    out.push(ranked);
  }
  return out;
}

/**
 * One seed's measurement at other ranks. The rank bonus of range i is trunc(rangeScore_i · p_i(r_i) / 100), added
 * at the range's end without touching the notes' factors, so with q = p_i(r_i), q₁ = p_i(1):
 *
 *   score_r    = score − Σ_i rankBonus_i + Σ_i trunc(rangeScore_i · q / 100)
 *   w_r[κ][k]  = weights[κ][k] + Σ_i (q − q₁) / 100 · rangeWeights[κ][k][i]
 *
 * (`rangeWeights[κ][k][i]`: what a factor-1 effect of kind κ at position k adds inside range i, per unit of power.)
 * The score is exact per seed; the weights are within the floors. null without the fields it needs.
 */
export function rankedSeed(seed: DeckSeed, ranges: readonly DeckRange[], scenario: Scenario): DeckSeed | null {
  const seedRanges: readonly DeckSeedRange[] = seed.ranges ?? [];
  const rangeWeights = seed.rangeWeights;
  if (!rangeWeights || seedRanges.length !== ranges.length) return null;
  const deltas: number[] = [];
  let score = seed.score;
  for (let i = 0; i < ranges.length; i += 1) {
    const pct = ranges[i]?.rankBonusPercents;
    const measured = seedRanges[i];
    const q = pct?.[rangeRank(scenario, i) - 1];
    const q1 = pct?.[0] ?? ranges[i]?.rankBonusPercent;
    if (typeof q !== "number" || typeof q1 !== "number" || !measured
      || typeof measured.rangeScore !== "number" || typeof measured.rankBonus !== "number") return null;
    score += Math.trunc((measured.rangeScore * q) / 100) - measured.rankBonus;
    deltas.push((q - q1) / 100);
  }
  const weights = seed.weights.map((row, kind) => {
    if (!Array.isArray(row)) return row;
    const gains = rangeWeights[kind];
    if (!Array.isArray(gains)) return undefined;
    return row.map((w, k) => deltas.reduce((sum, d, i) => sum + d * (gains[k]?.[i] ?? 0), w));
  });
  return { ...seed, score, weights };
}

/** Which scenarios the file has statistics for: Gekisou-off seeds, and what other ranks need. */
export interface ScenarioSupport {
  free: boolean;
  battle: boolean;
  ranks: boolean;
}

export function scenarioSupport(data: MusicData | null | undefined): ScenarioSupport {
  const decks = (data?.songs ?? []).flatMap((song) => (song.charts ?? []).map((chart) => chart.deck).filter((deck): deck is ChartDeck => !!deck));
  return {
    free: decks.some((deck) => Array.isArray(deck.offSeeds) && deck.offSeeds.length > 0),
    battle: decks.some((deck) => !deck.unplayable && Array.isArray(deck.seeds) && deck.seeds.length > 0),
    ranks: decks.some((deck) => (deck.ranges ?? []).some((range) => Array.isArray(range.rankBonusPercents))
      && (deck.seeds ?? []).some((seed) => Array.isArray(seed.rangeWeights))),
  };
}

/** The scenario the page opens with: Free Live when the file has it, else the Gekisou Live best case. */
export function defaultScenario(support: ScenarioSupport): Scenario {
  return support.free || !support.battle ? FREE : BEST_BATTLE;
}

/** A requested scenario limited to what the file supports: other ranks need their fields, Free Live its seeds. */
export function supportedScenario(requested: Scenario, support: ScenarioSupport): Scenario {
  if (requested.id === "free") return support.free ? FREE : defaultScenario(support);
  if (!support.ranks) return BEST_BATTLE;
  return { id: "battle", ranks: [...Array(RANGE_COUNT).keys()].map((i) => rangeRank(requested, i)) };
}

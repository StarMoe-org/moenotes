import type { ChartDeck, DeckRange, DeckSeed, MusicData } from "./types";

/**
 * Play scenarios: where and how a live is played, which decides what a chart's deck statistics give. A port of
 * ournotes-player's chart data page (examples/songs/ranking.js `scenarioSeed`) with the same semantics; this module is
 * the one place that turns a seed's measurements into the no-skill score and skill weights a scenario scores with.
 *
 * - `battle`: Gekisou Live (up to five players, Gekisou on) with a rank r_i in 1..5 per Gekisou range. The
 *   seeds are its rank-1 simulations, and the other ranks follow from them linearly (the rank bonus
 *   trunc(rangeScore · p / 100) is added at the range's end and changes nothing else):
 *
 *     base_r = (score − Σ_i rankBonus_i + Σ_i trunc(rangeScore_i · p_i(r_i) / 100)) / power
 *     w_r[k] = w[k] + Σ_i (p_i(r_i) − p_i(1)) / 100 · rangeWeights[k][i]
 *
 * - `free`: Free Live (solo, Gekisou off), its own simulation (`offSeeds`); a chart with more than three fevers plays
 *   here too.
 *
 * Two accuracy approximations, without combo breaks: a Great share q scales every score by 1 − 0.2 q; a Just rate j
 * (battle only) interpolates between the all-Just seeds and the all-Perfect run of the Just ranges (`scorePerfect`,
 * `rangeScorePerfect`), with the rank bonuses recomputed on the interpolated range scores and the skill weights inside
 * a range scaled by the same ratio.
 */
export type ScenarioId = "battle" | "free";

export interface Scenario {
  id: ScenarioId;
  /** The rank in range i (1..5); a bad or missing value is rank 1. Ignored by `free`. */
  ranks: readonly number[];
  /** Great share over every note, 0..1 (default 0). */
  great?: number;
  /** Just rate inside the Just mission ranges, 0..1 (default 1, as measured); the rest are Perfect. Battle only. */
  just?: number;
}

export const SCENARIOS: readonly ScenarioId[] = ["battle", "free"];
/** A Great scores this share of a Perfect (MasterLiveJudgementParameter: 80 and 100). */
export const GREAT_SCORE = 0.8;
/** Gekisou Live seats up to 5 players; a chart has 3 Gekisou ranges (more fevers are unplayable with Gekisou on). */
export const RANK_MAX = 5;
export const RANGES = 3;
/** The Just mission (music-data.json `gekisouMissions`, deck `ranges[i].mission`): Just judgements are on only there. */
const JUST_MISSION = 3;
export const BEST_RANKS: readonly number[] = Object.freeze([1, 1, 1]);
/** The deck statistics as measured: Gekisou Live, rank 1 in every range, every Just, no Great. */
export const BEST_BATTLE: Scenario = Object.freeze({ id: "battle", ranks: BEST_RANKS, just: 1, great: 0 });
export const FREE: Scenario = Object.freeze({ id: "free", ranks: BEST_RANKS, just: 1, great: 0 });

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** The score factor of a Great share q (0..1) over every note: 1 − 0.2 q. */
export function greatFactor(q: number | undefined): number {
  return 1 - (1 - GREAT_SCORE) * (finite(q) ? clamp01(q) : 0);
}

/** A rank 1..5; anything else is rank 1. */
export function clampRank(r: unknown): number {
  return Number.isInteger(r) && (r as number) >= 1 && (r as number) <= RANK_MAX ? (r as number) : 1;
}

/** "r" or "r1,r2,r3" (the query's rk) as three ranks; a bad or missing value is rank 1. */
export function parseRanks(text: string | null | undefined): number[] {
  const v = String(text ?? "").split(",").slice(0, RANGES).map((x) => clampRank(Number(x)));
  return v.length === 1 ? Array<number>(RANGES).fill(v[0] as number) : [...v, ...Array<number>(RANGES - v.length).fill(1)];
}

/** The query form of three ranks: "" for all rank 1, "r" for one rank everywhere, else "r1,r2,r3". */
export function formatRanks(ranks: readonly unknown[] | null | undefined): string {
  const r = [...Array(RANGES).keys()].map((i) => clampRank((ranks ?? [])[i]));
  if (r.every((x) => x === r[0])) return r[0] === 1 ? "" : String(r[0]);
  return r.join(",");
}

/**
 * Range i's rank bonus percent at rank r (deck `ranges[i]`: rankBonusPercents for ranks 1..5, rankBonusPercent for
 * rank 1); null when the data has no such rank.
 */
export function rankPercent(range: DeckRange | undefined, r: number): number | null {
  const list = range?.rankBonusPercents;
  if (Array.isArray(list) && finite(list[r - 1])) return list[r - 1] as number;
  return r === 1 && range && finite(range.rankBonusPercent) ? range.rankBonusPercent : null;
}

/** Which scenarios and settings the file has the statistics for. */
export interface ScenarioSupport {
  /** Gekisou Live at rank 1 (the seeds). */
  battle: boolean;
  /** Free Live (`offSeeds`). */
  free: boolean;
  /** Ranks other than 1 (`rankBonusPercents` and `rangeWeights`). */
  ranks: boolean;
  /** A Just rate below 100 % (`scorePerfect`, with `rangeWeights` for the skill weights). */
  just: boolean;
}

export function scenarioSupport(data: MusicData | null | undefined): ScenarioSupport {
  const has: ScenarioSupport = { battle: false, free: false, ranks: false, just: false };
  for (const song of data?.songs ?? []) {
    for (const chart of song.charts ?? []) {
      const d = chart.deck;
      if (!d) continue;
      const seeds = d.seeds ?? [];
      if (!d.unplayable && seeds.length) has.battle = true;
      if ((d.offSeeds ?? []).length) has.free = true;
      if ((d.ranges ?? []).length && (d.ranges ?? []).every((r) => Array.isArray(r.rankBonusPercents) && r.rankBonusPercents.length >= RANK_MAX)
        && seeds.some((s) => s.rangeWeights)) has.ranks = true;
      if (seeds.some((s) => finite(s.scorePerfect) && s.rangeWeights)) has.just = true;
    }
  }
  return has;
}

/**
 * The seeds a chart's figures come from in a scenario, the one place that picks them: Free Live's `offSeeds`, Gekisou
 * Live's `seeds`; null without statistics or for a chart unplayable with Gekisou on (Gekisou Live).
 */
export function scenarioSeeds(deck: ChartDeck | null | undefined, scenario: Scenario | null | undefined): readonly DeckSeed[] | null {
  if (!deck) return null;
  const seeds = scenario?.id === "free" ? deck.offSeeds : deck.unplayable ? undefined : deck.seeds;
  return seeds && seeds.length ? seeds : null;
}

/** One seed's no-skill score (points at the measurement power) and position weights of one kind in a scenario. */
export interface SeedFigures {
  score: number;
  weights: number[];
}

/**
 * One seed's figures for `kind` in a scenario (`ranges`: the chart's deck ranges); null when the seed lacks a field
 * the scenario needs. Battle at rank 1 everywhere with j = 1 is the seed itself; free is an `offSeeds` entry as it is.
 * `scorePerfect` holds the rank-1 bonuses of its ranges, like `score`; a range without the Just mission scores the
 * same on the Perfect play.
 */
export function scenarioSeed(seed: DeckSeed | null | undefined, ranges: readonly DeckRange[], kind: number, scenario: Scenario | null | undefined): SeedFigures | null {
  const sc = { ...BEST_BATTLE, ...(scenario ?? {}) };
  const w0 = seed?.weights?.[kind];
  if (!seed || !Array.isArray(w0) || !finite(seed.score)) return null;
  const g = greatFactor(sc.great);
  const plain = (): SeedFigures => ({ score: seed.score * g, weights: w0.map((v) => (v ?? 0) * g) });
  if (sc.id === "free") return plain();
  const rs = seed.ranges ?? [];
  const ranks = rs.map((_, i) => clampRank((sc.ranks ?? [])[i]));
  const j = finite(sc.just) ? clamp01(sc.just) : 1;
  const partial = j < 1;
  if (!partial && ranks.every((r) => r === 1)) return plain();
  const rw = seed.rangeWeights?.[kind];
  if (!Array.isArray(rw)) return null;
  const p1 = rs.map((_, i) => rankPercent(ranges[i], 1));
  const pr = rs.map((_, i) => rankPercent(ranges[i], ranks[i] as number));
  if ([...p1, ...pr].some((p) => p === null) || rs.some((x) => !finite(x.rangeScore) || !finite(x.rankBonus))) return null;
  // the all-Perfect range score: a range without Just judgements scores the same either way
  const perfect = rs.map((x, i) => (finite(x.rangeScorePerfect) ? x.rangeScorePerfect
    : ranges[i] && ranges[i]!.mission !== JUST_MISSION ? x.rangeScore as number : null));
  if (partial && (!finite(seed.scorePerfect) || perfect.some((v) => v === null))) return null;
  const P1 = p1 as number[], PR = pr as number[];
  const lerp = (p: number, just: number) => (partial ? p + j * (just - p) : just);
  // the score without the rank bonuses, all Just and all Perfect (scorePerfect holds the rank-1 bonuses of its ranges)
  const rest = seed.score - rs.reduce((a, x) => a + (x.rankBonus as number), 0);
  const restP = partial ? (seed.scorePerfect as number) - perfect.reduce<number>((a, v, i) => a + Math.trunc(((v as number) * (P1[i] as number)) / 100), 0) : rest;
  const rangeJ = rs.map((x, i) => lerp(perfect[i] as number, x.rangeScore as number));
  const score = lerp(restP, rest) + rangeJ.reduce((a, v, i) => a + Math.trunc((v * (PR[i] as number)) / 100), 0);
  const weights = w0.map((v, k) => (v ?? 0) + rs.reduce((a, x, i) => {
    const d = rw[k]?.[i] ?? 0;
    const ratio = (x.rangeScore as number) > 0 ? (rangeJ[i] as number) / (x.rangeScore as number) : 1;   // the Just rate's, on the range's part
    return a + (((PR[i] as number) - (P1[i] as number)) / 100) * d + (ratio - 1) * (1 + (PR[i] as number) / 100) * d;
  }, 0));
  return { score: score * g, weights: weights.map((v) => v * g) };
}

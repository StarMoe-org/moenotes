// Chart efficiency ranking: pure functions over nnnotes' music-data.json (nnnotes.music-data/1, whose deck
// statistics are ournotes-deck.chart-stats/2). A port of ournotes-player's chart data page (examples/songs/ranking.js)
// with the same semantics; the scenario (scenario.ts) decides which measurements `base` and the weights come from.
//
// Score model (music-data.json `deck`, checked per seed against the whole-live simulation): on the theoretical best
// play of a scenario, a deck of power P whose live skills are plain score-up skills (effect type 2000 for 5 s on the
// whole deck, no targets or conditions) raising the note score by x_1 .. x_n scores
//
//   P * (base + sum_k x_pi(k) * w_k)
//
// where `base` (the no-skill score per unit of power, rank bonuses included when Gekisou is on) and the skill event
// weights `w_k` (the score a factor-1 plain skill at performance position k adds, per unit of power) are the chart's
// own and pi is the skill order of the live. Luck ranges draw from the play's random seed, so the deck statistics are
// per seed of a seed set; the page takes the mean over those seeds, which is not the game's own expectation (its seed
// law is unknown). The client draws pi at the start of every live: `MemberDataContainer` fills the skill order with
// 0..n-1 and Fisher-Yates shuffles it with the MemberShuffle random stream, seeded from the client clock (a solo retry
// keeps the seed, so the order). pi is uniform over the n! orders, and so
//
//   E[score] = P * (base + xbar * W),   xbar = mean skill value,   W = sum_k w_k,
//
// whatever the deck's skills are otherwise; the n! orders give the spread around it. A play takes T = length + c,
// with `length` the BGM or the chart's music length and c the time spent outside the live (loading, results).
//
// Dominance (expected score per time): chart a beats chart b when
//   S_a(xbar) / (L_a + c) >= S_b(xbar) / (L_b + c)   for all 0 <= xbar <= X_MAX and all c >= 0
// (strictly somewhere). The difference is linear in c for a fixed xbar and linear in xbar for a fixed c, so the four
// corners xbar in {0, X_MAX}, c in {0, infinity} decide it: S_a >= S_b and S_a / L_a >= S_b / L_b at both ends.
// The deck power must be the same on both charts: song type and tag bonuses change a deck's power per song.

import { scenarioSeed, scenarioSeeds, type Scenario } from "./scenario";
import { hasNominalStatistics, scenarioExpectation } from "./expectation";
import type { ChartDeck, DataScoreRank, DataText, MusicData } from "./types";

export const DIFFICULTIES = ["easy", "normal", "hard", "expert"] as const;
export type Difficulty = typeof DIFFICULTIES[number];
export const EPS = 1e-12;
// The largest score-up value of one live skill (MasterLiveSkillEffect, types 2000 / 2004 at level 5: 15000 = 150 %).
export const X_MAX = 1.5;
// ournotes-deck's measurement power and the plain skill's window, when music-data.json does not say.
const POWER = 300000;
const PLAIN_MS = 5000;

// The id of the plain score-up kind of music-data.json's `deck.kinds`: effect type 2000 on the whole deck for 5 s,
// without targets, conditions or limits (the most common live skill; the page models decks of it). null for none.
export function plainKind(data: MusicData | null | undefined): number | null {
  const kinds = data?.deck?.kinds ?? [];
  const hit = kinds.find((k) => k.effectType === 2000 && !(k.skillTargetIds ?? []).length && !k.skillConditionGroup
    && !k.skillReleaseConditionGroup && !k.effectLimitCount && !k.effectExecuteLimitCount
    && (k.durationMs ?? PLAIN_MS) === PLAIN_MS);
  return hit ? hit.id : null;
}

const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

export interface ChartFigures {
  base: number;
  baseRange: [number, number] | null;
  seeds: number;
  skip: number | null;
  weights: number[];
}

// A chart's figures from its deck statistics (`chart.deck`) in a scenario (scenario.ts; default: battle, rank 1, all
// Just, no Great): `base` and `weights[k]` (performance position k's, of kind `kind`) as means over the scenario's
// seeds (scenarioSeeds: `offSeeds` in free), `baseRange` the seeds' [min, max] base, `seeds` their number. null without statistics, for a
// chart unplayable with Gekisou on (battle), without the kind or without the scenario's fields.
export function chartFigures(
  deck: ChartDeck | null | undefined,
  kind: number | null | undefined,
  power = POWER,
  scenario: Scenario | null = null,
): ChartFigures | null {
  if (deck && scenario?.id !== "free" && hasNominalStatistics(deck)) {
    if (deck.unplayable || kind === null || kind === undefined || !Number.isInteger(kind) || kind < 0 || !Number.isFinite(power) || power <= 0) return null;
    const f = scenarioExpectation(deck.expectation, deck.ranges ?? [], kind, scenario);
    if (!f || (deck.positions !== undefined && f.weights.length !== deck.positions)) return null;
    const base = f.score / power;
    const baseRange: [number, number] | null = f.scoreBounds ? [f.scoreBounds[0] / power, f.scoreBounds[1] / power] : null;
    if (!Number.isFinite(base) || (baseRange && !baseRange.every(Number.isFinite))) return null;
    return { base, weights: f.weights, seeds: 0, skip: deck.skip ?? null, baseRange };
  }
  const seeds = scenarioSeeds(deck, scenario);
  if (!deck || !seeds || kind === null || kind === undefined) return null;
  const figs = seeds.map((s) => scenarioSeed(s, deck.ranges ?? [], kind, scenario));
  if (figs.some((f) => !f)) return null;
  const done = figs as NonNullable<typeof figs[number]>[];
  const bases = done.map((f) => f.score / power);
  const n = deck.positions ?? done[0]!.weights.length;
  return {
    base: mean(bases),
    baseRange: [Math.min(...bases), Math.max(...bases)],
    seeds: seeds.length,
    skip: deck.skip ?? null,
    weights: [...Array(n).keys()].map((k) => mean(done.map((f) => f.weights[k] ?? 0))),
  };
}

// ournotes-deck's measurement power of music-data.json.
export function modelPower(data: MusicData | null | undefined): number {
  return data?.deck?.model?.power || POWER;
}

export interface FigureRow extends ChartFigures {
  scoreId: number;
  musicId: number;
  difficulty: string;
  level: number;
  displayLevel: number;
  title: DataText | null;
  bandIds: readonly number[];
  bandName: DataText | null;
  musicType: number | undefined;
  scoreRanks: readonly DataScoreRank[];
  notes: number | null;
  bpm: number | null;
  bpmRange: [number | undefined, number | undefined] | null;
  bgmMs: number | null;
  chartMs: number | null;
}

// One row per chart of music-data.json with deck figures in a scenario (see chartFigures), with the song's facts;
// `weights[k]` is performance position k's.
export function joinCharts(data: MusicData | null | undefined, scenario: Scenario | null = null): FigureRow[] {
  const kind = plainKind(data);
  const power = modelPower(data);
  const out: FigureRow[] = [];
  for (const song of data?.songs ?? []) {
    for (const chart of song.charts ?? []) {
      const f = chartFigures(chart.deck, kind, power, scenario);
      if (!f) continue;
      const bgm = song.bgm?.length;
      out.push({
        scoreId: chart.scoreId,
        musicId: song.id,
        difficulty: chart.difficulty,
        level: chart.level,
        displayLevel: chart.displayLevel ?? chart.level,
        title: song.title || null,
        bandIds: song.bandIds || [],
        bandName: song.bandName || null,
        musicType: song.musicType,
        scoreRanks: song.scoreRanks || [],
        notes: chart.notes ? chart.notes.judged ?? null : null,
        bpm: chart.bpm ? chart.bpm.main ?? null : null,
        bpmRange: chart.bpm ? [chart.bpm.min, chart.bpm.max] : null,
        bgmMs: bgm ? (bgm.durationMs ?? bgm.lengthMs ?? null) : null,
        chartMs: chart.musicLengthMs ?? null,
        ...f,
      });
    }
  }
  return out;
}

/** What the figures below read from a row. */
export interface LengthRow {
  bgmMs: number | null;
  chartMs: number | null;
}
export interface RateRow {
  base: number | null;
  weights: readonly number[] | null;
}
export type LengthSource = "bgm" | "chart";

// Play length in ms without the overhead: the BGM's ("bgm") or the chart's music length ("chart"); the other one when
// the chosen one is missing.
export function lengthMs(row: LengthRow, source: LengthSource | string): number | null {
  const v = source === "chart" ? row.chartMs ?? row.bgmMs : row.bgmMs ?? row.chartMs;
  return typeof v === "number" && v > 0 ? v : null;
}

// Master integer effect value to the game factor (float32 then truncate); NOT user-entered percentages.
export const masterSkillFactor = (value: number): number => Math.trunc(Math.fround(Math.fround(value / 10000) * 100000)) / 100000;

// Skill values (fractions: 1 = +100 %) as numbers; missing, negative or non-numeric values count as 0.
export function skillValues(skills: Iterable<unknown> | null | undefined): number[] {
  return [...(skills ?? [])].map((x) => {
    const v = Number(x);
    return Number.isFinite(v) && v > 0 ? v : 0;
  });
}

// The mean skill value over `n` members (default: the number of values given).
export function meanSkill(skills: Iterable<unknown> | null | undefined, n?: number): number {
  const x = skillValues(skills);
  const m = n ?? x.length;
  return m > 0 ? x.slice(0, m).reduce((a, b) => a + b, 0) / m : 0;
}

// W: the summed weight of every performance position.
export function weightSum(row: { weights: readonly number[] | null }): number {
  return (row.weights || []).reduce((a, b) => a + b, 0);
}

// Expected score per unit of power over the random skill order: base + xbar * W.
export function scoreRate(row: RateRow, skills: Iterable<unknown>): number {
  return (row.base as number) + meanSkill(skills, (row.weights || []).length) * weightSum(row);
}

const PERMS = new Map<number, number[][]>();
function permutations(n: number): number[][] {
  let out = PERMS.get(n);
  if (!out) {
    const found: number[][] = [];
    const walk = (p: number[], rest: number[]) => {
      if (!rest.length) { found.push(p); return; }
      rest.forEach((v, i) => walk([...p, v], [...rest.slice(0, i), ...rest.slice(i + 1)]));
    };
    walk([], [...Array(n).keys()]);
    PERMS.set(n, found);
    out = found;
  }
  return out;
}

// Score per unit of power of every skill order (n! values, ascending): member i at position perm[i].
export function orderRates(row: RateRow, skills: Iterable<unknown>): number[] {
  const w = row.weights || [];
  const x = skillValues(skills);
  return permutations(w.length).map((p) => p.reduce((s, pos, i) => s + (x[i] || 0) * (w[pos] as number), row.base as number))
    .sort((a, b) => a - b);
}

// The q-quantile (0..1) of an ascending list, by the nearest lower rank.
export function quantile(sorted: readonly number[], q: number): number | null {
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] as number : null;
}

// Expected score per unit of power per minute of play (length + overhead).
export function perMinute(row: RateRow & LengthRow, skills: Iterable<unknown>, source: LengthSource | string, overheadMs: number): number | null {
  const L = lengthMs(row, source);
  return L === null ? null : scoreRate(row, skills) / ((L + overheadMs) / 60000);
}

const rateAt = (row: RateRow, xbar: number) => (row.base as number) + xbar * weightSum(row);

// Whether `a` beats `b` in expected score per time for every mean skill value in [0, xMax] and every overhead c >= 0
// (see the top of the file), and strictly for some; charts without a length never do.
export function dominates(a: RateRow & LengthRow, b: RateRow & LengthRow, source: LengthSource | string, xMax = X_MAX): boolean {
  const La = lengthMs(a, source);
  const Lb = lengthMs(b, source);
  if (La === null || Lb === null) return false;
  let strict = false;
  for (const xbar of [0, xMax]) {
    const sa = rateAt(a, xbar), sb = rateAt(b, xbar);
    for (const d of [sa - sb, sa / La - sb / Lb]) {
      const tol = EPS * Math.max(1, Math.abs(sa), Math.abs(sb));
      if (d < -tol) return false;
      if (d > tol) strict = true;
    }
  }
  return strict;
}

// For each row the indexes of the rows that dominate it; rows with none form the frontier.
export function dominance(rows: ReadonlyArray<RateRow & LengthRow>, source: LengthSource | string, xMax = X_MAX): number[][] {
  return rows.map((b) => {
    const by: number[] = [];
    rows.forEach((a, i) => { if (a !== b && dominates(a, b, source, xMax)) by.push(i); });
    return by;
  });
}

export interface RankMetrics {
  lengthMs: number | null;
  rate: number;
  perMinute: number | null;
  notesPerSecond: number | null;
  dominatedBy: number[];
  frontier: boolean;
}

export interface RankOptions {
  skills: Iterable<unknown>;
  source: LengthSource | string;
  overheadMs: number;
  key?: string;
  xMax?: number;
}

type RankInput = RateRow & LengthRow & { scoreId: number; notes: number | null; displayLevel: number };

// The rows with their metrics under a parameter set, sorted by `key` (descending; "level" by the display level).
export function rank<T extends RankInput>(rows: readonly T[], { skills, source, overheadMs, key = "perMinute", xMax = X_MAX }: RankOptions): Array<T & RankMetrics> {
  const skillList = [...skills];
  const dom = dominance(rows, source, xMax);
  const out = rows.map((r, i) => {
    const L = lengthMs(r, source);
    return {
      ...r,
      lengthMs: L,
      rate: scoreRate(r, skillList),
      perMinute: perMinute(r, skillList, source, overheadMs),
      notesPerSecond: L ? (r.notes as number) / (L / 1000) : null,
      dominatedBy: dom[i] as number[],
      frontier: (dom[i] as number[]).length === 0,
    };
  });
  const val = (r: T & RankMetrics) => (key === "level" ? r.displayLevel : (r as unknown as Record<string, unknown>)[key]) as number | null | undefined;
  out.sort((a, b) => {
    const x = val(a), y = val(b);
    if (x === y) return a.scoreId - b.scoreId;
    if (x === null || x === undefined) return 1;
    if (y === null || y === undefined) return -1;
    return y - x;
  });
  return out;
}

// "m:ss.s" of a length in ms.
export function formatLength(ms: unknown): string {
  if (typeof ms !== "number" || !(ms >= 0)) return "";
  const ds = Math.round(ms / 100);                           // tenths of a second, rounded before the split
  const m = Math.floor(ds / 600);
  const r = ds - m * 600;
  return `${m}:${r < 100 ? "0" : ""}${Math.floor(r / 10)}.${r % 10}`;
}

// ---------------------------------------------------------------- score ranks (events)
// A live's score rank is the last of the song's `scoreRanks` (music-data.json: MasterLiveScoreRank rows of the song's
// group, every difficulty shares them) whose required score its score reaches. The client pays an event live
//   points = trunc((10000 + bonus) * boostRate * value(event, rank) / 10000)
// with the bonus from the deck's cards, boostRate = 5 per boost spent (1 without) and value from the event's point
// table: the song enters only through the rank. Whatever the table holds, as long as value grows with the rank, the
// song choice only needs the chance of each rank and the play time; a table value is recovered from one result as
// points * 10000 / ((10000 + bonus) * boostRate).
//
// Free Live rates a player's score against the song's `requiredScore`. Gekisou Live rates the room: the sum of the
// scores of its n players against trunc(sqrt(5 / n) * battleRequiredScore * n). With every player scoring the same,
// one player needs trunc(sqrt(5 / n) * R_battle * n) / n, about sqrt(5 / n) * R_battle (`room` = n below; 0 for solo).
//
// Event dominance (expected score): a beats b when L_a <= L_b and, for every rank r with thresholds R_a, R_b > 0,
//   S_a(xbar) / R_a(r) >= S_b(xbar) / R_b(r)   for all 0 <= xbar <= X_MAX
// (linear in xbar: both ends decide), strictly somewhere: a deck reaches every rank on a at a power no higher than on
// b, and a takes no longer.

export const SCORE_RANKS = ["D", "C", "B", "A", "S", "SS"] as const;
export type ScoreRank = typeof SCORE_RANKS[number];

type RankedRow = RateRow & { scoreRanks: readonly DataScoreRank[] };

// One player's share of a Gekisou Live room threshold R_battle among n players who all score the same.
export function roomThreshold(R: number, n: number): number {
  return Math.trunc(Math.sqrt(5 / n) * R * n) / n;
}

// The score one player needs for a rank on a row's song: solo (`room` 0) the song's requiredScore, in a Gekisou Live
// room of `room` players scoring the same its roomThreshold; null when the song has no such rank.
export function rankThreshold(row: { scoreRanks: readonly DataScoreRank[] }, rank: string, room = 0): number | null {
  const hit = (row.scoreRanks || []).filter((r) => r.rank === rank).pop();
  if (!hit) return null;
  if (!room) return Number.isFinite(hit.requiredScore) ? hit.requiredScore : null;
  const R = hit.battleRequiredScore;
  return typeof R === "number" && Number.isFinite(R) ? roomThreshold(R, room) : null;
}

// The power at which the expected score reaches a rank's threshold; 0 for a rank needing no score, null without
// the rank or the chart's figures. `factor` scales the score (the page folds its accuracy into the figures).
export function requiredPower(row: RankedRow, skills: Iterable<unknown>, rank: string, factor = 1, room = 0): number | null {
  const R = rankThreshold(row, rank, room);
  if (R === null || !row.weights) return null;
  return R <= 0 ? 0 : R / (scoreRate(row, skills) * factor);
}

// The chance over the random skill order that a deck of `power` reaches at least `rank` on the chart.
export function reachChance(row: RankedRow, skills: Iterable<unknown>, power: number, rank: string, factor = 1, room = 0): number | null {
  const R = rankThreshold(row, rank, room);
  if (R === null || !row.weights) return null;
  if (R <= 0) return 1;
  const rates = orderRates(row, skills);
  return rates.filter((v) => power * v * factor >= R).length / rates.length;
}

// Whether `a` beats `b` for events (see above), strictly somewhere.
export function eventDominates(a: RankedRow & LengthRow, b: RankedRow & LengthRow, source: LengthSource | string, xMax = X_MAX, room = 0): boolean {
  const La = lengthMs(a, source);
  const Lb = lengthMs(b, source);
  if (La === null || Lb === null || La > Lb + EPS || !a.weights || !b.weights) return false;
  let any = La < Lb - EPS;
  for (const rank of SCORE_RANKS) {
    const Ra = rankThreshold(a, rank, room), Rb = rankThreshold(b, rank, room);
    if (Rb === null) continue;                               // b never gets the rank
    if (Ra === null) return false;
    if (Rb <= 0) { if (Ra > 0) return false; continue; }     // b always gets it
    if (Ra <= 0) { any = true; continue; }
    for (const xbar of [0, xMax]) {
      const d = rateAt(a, xbar) / Ra - rateAt(b, xbar) / Rb;
      const tol = EPS * Math.max(1, rateAt(a, xbar) / Ra);
      if (d < -tol) return false;
      if (d > tol) any = true;
    }
  }
  return any;
}

// For each row the indexes of the rows that beat it for events.
export function eventDominance(rows: ReadonlyArray<RankedRow & LengthRow>, source: LengthSource | string, xMax = X_MAX, room = 0): number[][] {
  return rows.map((b) => {
    const by: number[] = [];
    rows.forEach((a, i) => { if (a !== b && eventDominates(a, b, source, xMax, room)) by.push(i); });
    return by;
  });
}

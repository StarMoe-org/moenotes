// Gekisou range measures and single-skill aptitude, ported from ournotes-player 1522c24.
// Baseline rankings stay unchanged. Increments of several skills must not be added.
// Legacy Δscore(r,j) = T(j) + Σ RS_i(j) · (1 + p_i(r_i)/100), with measured score used directly at rank 1.
// Nominal gains start from the measured expectation and replace only changed ranges' expected rank bonuses.
// Δw_k(r) = Δw_k + Σ (p_i(r_i) − p_i(1))/100 · Δu_k,i, for the all-Just play only.
// Perfect cross terms are unmeasured: partial Just with nonzero plain skills has no complete gain.
// Transformed means have neither a published nominal enclosure nor a known legacy sample SE.

import { modelPower, plainKind, scoreRate, skillValues } from "./ranking";
import { hasNominalStatistics, isEstimate } from "./expectation";
import { BEST_BATTLE, clampRank, greatFactor, rankPercent, type Scenario } from "./scenario";
import { localizeDataText } from "./text";
import type { AppLocale } from "@/config/locales";
import type { AptitudeShape, AptitudeVariant, CatalogSkill, ChartDeck, DeckRange, MeanSe, MusicData, RangeFactors } from "./types";

const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const mean = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
/** The mean of a [mean, se]; null when missing. */
const mOf = (x: MeanSe | null | undefined): number | null => (Array.isArray(x) && finite(x[0]) ? x[0] : null);
/** A raw sample standard error; zero if absent, as in the reference implementation. */
const seOf = (x: MeanSe | null | undefined): number => Array.isArray(x) && finite(x[1]) ? x[1] : 0;

// ---------------------------------------------------------------- range measures

/** The measures the seeds carry per range (deck `seeds[].ranges[j]`). */
export const MEASURES = ["maxCombo", "justCount", "luckPoints"] as const;
export type Measure = typeof MEASURES[number];

/** The measure a Gekisou range ranks the room by, per mission (1 combo, 2 luck, 3 Just). */
export const MISSION_MEASURE: Readonly<Record<number, Measure>> = Object.freeze({ 1: "maxCombo", 2: "luckPoints", 3: "justCount" });

/** A measure over the seeds. */
export interface MeasureStat {
  mean: number;
  min: number;
  max: number;
}

export interface RangeMeasures {
  index: number;
  mission: number | null;
  /** The measure the range ranks by; null for an unknown mission. */
  measure: Measure | null;
  /** Every measure over the seeds (no skills); a measure some seed lacks (older data) is null. */
  values: Record<Measure, MeasureStat | null>;
}

/**
 * Per Gekisou range of a chart's deck statistics (Gekisou on, no skills): its mission, the measure it ranks by and
 * every measure over the seeds; [] without statistics or for a chart unplayable with Gekisou on.
 */
export function rangeMeasures(deck: ChartDeck | null | undefined): RangeMeasures[] {
  if (!deck || deck.unplayable) return [];
  const ranges = Array.isArray(deck.ranges) ? deck.ranges : [];
  const seeds = deck.seeds ?? [];
  const stat = (i: number, key: Measure): MeasureStat | null => {
    if (hasNominalStatistics(deck)) {
      if (!Array.isArray(deck.expectation?.ranges) || deck.expectation.ranges.length !== ranges.length) return null;
      const v = deck.expectation?.ranges?.[i]?.[key];
      if (isEstimate(v)) return { mean: v[0], min: v[0] - v[1], max: v[0] + v[1] };
      return finite(v) ? { mean: v, min: v, max: v } : null;
    }
    const v = seeds.map((s) => s?.ranges?.[i]?.[key]);
    if (!v.length || !v.every(finite)) return null;
    const n = v as number[];
    return { mean: mean(n), min: Math.min(...n), max: Math.max(...n) };
  };
  return ranges.map((r, i) => ({
    index: i,
    mission: r?.mission ?? null,
    measure: (r?.mission !== undefined && MISSION_MEASURE[r.mission]) || null,
    values: Object.fromEntries(MEASURES.map((k) => [k, stat(i, k)])) as Record<Measure, MeasureStat | null>,
  }));
}

// ---------------------------------------------------------------- names

const CATALOGS = new WeakMap<object, { skills: Map<number, CatalogSkill>; supportSkills: Map<number, CatalogSkill>; shapes: Map<number, AptitudeShape> }>();
function tables(data: MusicData | null | undefined) {
  const hit = data ? CATALOGS.get(data) : undefined;
  if (hit) return hit;
  const byId = <T extends { id: number }>(list: readonly T[] | null | undefined) => new Map((Array.isArray(list) ? list : []).filter((x) => x && finite(x.id)).map((x) => [x.id, x]));
  const out = {
    skills: byId(data?.gekisouCatalog?.skills),
    supportSkills: byId(data?.gekisouCatalog?.supportSkills),
    shapes: byId(data?.deck?.gekisouAptitude?.shapes),
  };
  if (data && typeof data === "object") CATALOGS.set(data, out);
  return out;
}

export interface SkillName {
  id: number;
  /** In the locale's masterdata order; "#id" without a name. */
  name: string;
  mission: number | null;
  maxLevel: number | null;
}

/**
 * A Gekisou skill (`table` "skills") or Gekisou support skill ("supportSkills") of `gekisouCatalog` by id: its name in
 * the locale, mission and maxLevel (null when the catalog lacks them, as in older data).
 */
export function gekisouSkill(data: MusicData | null | undefined, table: "skills" | "supportSkills", id: number, locale: AppLocale): SkillName {
  const e = tables(data)[table].get(id);
  return { id, name: localizeDataText(e?.name, locale) || `#${id}`, mission: e?.mission ?? null, maxLevel: e?.maxLevel ?? null };
}

/** The (skill, level) pairs of a shape with their names: member shapes name Gekisou skills, support shapes support skills. */
export function shapeSkills(data: MusicData | null | undefined, shape: AptitudeShape | null | undefined, locale: AppLocale): Array<SkillName & { level: number }> {
  const table = shape?.source === "support" ? "supportSkills" : "skills";
  const seen = new Set<string>();
  return (shape?.skills ?? []).filter((s) => { const key = `${s.id}:${s.level}`; if (seen.has(key)) return false; seen.add(key); return true; })
    .map((s) => ({ ...gekisouSkill(data, table, s.id, locale), level: s.level }));
}

// ---------------------------------------------------------------- aptitude

/** Whether the file has the aptitude layer (`deck.gekisouAptitude`, null when made without it). */
export function aptitudeData(data: MusicData | null | undefined): boolean {
  return !!data?.deck?.gekisouAptitude;
}

export interface AptitudeFigures {
  base: number;
  baseSe: number | null;
  baseRadius: number | null;
  weights: number[] | null;
  missingPerfectCross: boolean;
  crossAtRank1: boolean;
  seeds: number | null;
  deterministic: boolean;
  seTargetMet: boolean;
}

/** A single variant's gain, matching player aptitudeFigures; SE only for the original sampled statistic. */
export function aptitudeFigures(variant: AptitudeVariant | null | undefined, ranges: readonly DeckRange[], power = modelPower(null), scenario: Scenario | null = null, nominal = false): AptitudeFigures | null {
  const sc = { ...BEST_BATTLE, ...(scenario ?? {}) };
  if (!variant || sc.id === "free" || mOf(variant.score) === null || !finite(power) || power <= 0) return null;
  const rs = Array.isArray(variant.ranges) ? variant.ranges : [];
  if (nominal && (!Array.isArray(variant.ranges) || !Array.isArray(ranges) || rs.length !== ranges.length
    || rs.some(r => !r || typeof r !== "object") || ranges.some(r => !r || typeof r !== "object")
    || !isEstimate(variant.score)
    || (variant.weights != null && (!Array.isArray(variant.weights) || !variant.weights.every(isEstimate))))) return null;
  const ranks = rs.map((_, i) => clampRank((sc.ranks ?? [])[i]));
  const j = finite(sc.just) ? clamp01(sc.just) : 1;
  const partial = j < 1;
  const g = greatFactor(sc.great);
  const pick = (x: MeanSe | undefined, xp: MeanSe | undefined): number | null => {
    if (nominal && (!isEstimate(x) || (partial && !isEstimate(xp)))) return null;
    const a = mOf(x);
    if (a === null) return null;
    if (!partial) return a;
    const b = mOf(xp);
    return b === null ? null : b + j * (a - b);
  };
  const rank1 = ranks.every((r) => r === 1);
  if (nominal && !rank1 && !Array.isArray(variant.rangeWeights)) return null;
  // rangeWeights also declares the linear rank domain. Validate it before partial Just suppresses cross terms,
  // or missing ordinary weights would otherwise bypass the domain check.
  if (nominal && variant.rangeWeights != null && (!Array.isArray(variant.weights)
    || !Array.isArray(variant.rangeWeights) || variant.rangeWeights.length !== variant.weights.length
    || !variant.rangeWeights.every(w => Array.isArray(w) && w.length === rs.length && w.every(isEstimate)))) return null;
  if (nominal && !rank1 && rs.some((_, i) => rankPercent(ranges[i], 1) === null
    || rankPercent(ranges[i], ranks[i]!) === null)) return null;
  let score: number | null;
  if (rank1) score = pick(variant.score, variant.scorePerfect);
  else if (nominal) {
    score = pick(variant.score, variant.scorePerfect);
    if (score === null) return null;
    for (let i = 0; i < rs.length; i++) {
      if (ranks[i] === 1) continue;
      const r = rs[i]!;
      const range = pick(r.rangeScore, r.rangeScorePerfect);
      const bonus = pick(r.rankBonus, r.rankBonusPerfect);
      const percent = rankPercent(ranges[i], ranks[i]!);
      if (range === null || bonus === null || percent === null) return null;
      score += range * percent / 100 - bonus;
    }
  }
  else {
    const tail = pick(variant.tail, variant.tailPerfect);
    const pr = rs.map((_, i) => rankPercent(ranges[i], ranks[i]!));
    const p1 = rs.map((_, i) => rankPercent(ranges[i], 1));
    const rsj = rs.map((x) => pick(x.rangeScore, x.rangeScorePerfect));
    if (tail === null || [...pr, ...p1].some((p) => p === null) || rsj.some((v) => v === null)) return null;
    score = tail + rsj.reduce<number>((a, v, i) => a + v! * (1 + pr[i]! / 100), 0);
  }
  if (score === null || (nominal && !finite(score))) return null;
  let weights: number[] | null = null;
  let crossAtRank1 = false;
  if (!partial && Array.isArray(variant.weights)) {
    const rw = variant.rangeWeights;
    crossAtRank1 = !rank1 && !Array.isArray(rw);
    const shift = rs.map((_, i) => rank1 || !Array.isArray(rw) ? 0 : (rankPercent(ranges[i], ranks[i]!)! - rankPercent(ranges[i], 1)!) / 100);
    weights = variant.weights.map((w, k) => ((mOf(w) ?? 0)
      + shift.reduce((a, d, i) => a + (d ? d * (mOf(rw?.[k]?.[i]) ?? 0) : 0), 0)) * g);
  }
  const base = score * g / power;
  const baseRadius = nominal && rank1 && !partial && sc.great === 0 ? variant.score![1] / power : null;
  if (nominal && (!finite(base) || (baseRadius !== null && !finite(baseRadius)) || (weights && !weights.every(finite)))) return null;
  return {
    base,
    baseSe: !nominal && rank1 && !partial && sc.great === 0 ? seOf(variant.score) / power : null,
    baseRadius,
    weights, missingPerfectCross: partial, crossAtRank1,
    seeds: variant.seeds ?? null,
    deterministic: Boolean(variant.deterministic),
    seTargetMet: variant.seTargetMet !== false,
  };
}

/** The skill order is random; only its mean matters. Missing cross terms are not zero. */
export function aptitudeRate(fig: AptitudeFigures | null | undefined, skills: Iterable<unknown>): number | null {
  if (!fig) return null;
  if (!fig.weights) return skillValues(skills).some((x) => x > 0) ? null : fig.base;
  return scoreRate(fig, skills);
}

/** No covariance data is exported, so transformed or combined gains have no known SE. */
export function aptitudeSe(fig: AptitudeFigures | null | undefined, skills: Iterable<unknown>): number | null {
  return fig && !skillValues(skills).some((x) => x > 0) ? fig.baseSe : null;
}

/** The raw nominal score enclosure; transformed scenarios and combined cross terms have no published bound. */
export function aptitudeRadius(fig: AptitudeFigures | null | undefined, skills: Iterable<unknown>): number | null {
  return fig && !skillValues(skills).some((x) => x > 0) ? fig.baseRadius : null;
}

/** Why the measured gain is zero: rank measures only, or no effect on theoretical best play. */
export function zeroGain(variant: AptitudeVariant | null | undefined): "measures" | "none" | null {
  if (!variant || mOf(variant.score) !== 0 || seOf(variant.score) !== 0) return null;
  if ((variant.weights ?? []).some((w) => (mOf(w) ?? 0) !== 0)) return null;
  const moves = (variant.ranges ?? []).some((x) => MEASURES.some((k) => (mOf(x[k]) ?? 0) !== 0)) || (mOf(variant.converted) ?? 0) !== 0;
  return moves ? "measures" : "none";
}

export function aptitudeShapes(data: MusicData | null | undefined): ReadonlyMap<number, AptitudeShape> {
  return tables(data).shapes;
}

export function chartVariants(deck: ChartDeck | null | undefined): readonly AptitudeVariant[] {
  const a = deck && !deck.unplayable && deck.gekisouAptitude;
  return a && Array.isArray(a.variants) ? a.variants : [];
}

/** One row of a chart's aptitude table. */
export interface AptitudeRow {
  /** `shape:bandMatch`, unique per chart. */
  key: string;
  shapeId: number;
  /** The file's shape (null when the file lacks it). */
  shape: AptitudeShape | null;
  /** "member" or "support"; null when unknown. */
  source: string | null;
  mission: number | null;
  bandMatch: boolean | null;
  deterministic: boolean;
  seeds: number | null;
  seTargetMet: boolean;
  /** The gain in the scenario. */
  delta: AptitudeFigures | null;
  variant: AptitudeVariant;
  /** Per range, the gains of the rank measures (rank 1, the Just play). */
  measures: Array<Record<Measure, MeanSe | null>>;
  converted: MeanSe | null;
}

/**
 * A chart's aptitude for every Gekisou skill in a scenario, in the data's order (by shape, a band condition's match
 * before its mismatch); null when the chart has none (it cannot play with Gekisou on, has no Gekisou range, the
 * master has no Gekisou skills, or the file predates the aptitude). Free Live has no Gekisou: every delta is null.
 */
export function chartAptitude(data: MusicData | null | undefined, deck: ChartDeck | null | undefined, scenario: Scenario | null | undefined): AptitudeRow[] | null {
  const apt = deck?.gekisouAptitude;
  if (!deck || deck.unplayable || !apt || !data?.deck?.gekisouAptitude) return null;
  const shapes = tables(data).shapes;
  const n = (deck.ranges ?? []).length;
  const nominal = hasNominalStatistics(deck);
  return (Array.isArray(apt.variants) ? apt.variants : []).filter(v => v && typeof v === "object").map((v) => {
    const shape = shapes.get(v.shape) ?? null;
    const bandMatch = typeof v.bandMatch === "boolean" ? v.bandMatch : null;
    return {
      key: `${v.shape}:${bandMatch}`,
      shapeId: v.shape,
      shape,
      source: shape?.source ?? null,
      mission: shape?.mission ?? null,
      bandMatch,
      deterministic: v.deterministic === true,
      seeds: finite(v.seeds) ? v.seeds : null,
      seTargetMet: v.seTargetMet !== false,
      delta: aptitudeFigures(data?.deck?.gekisouAptitude?.plainKind === plainKind(data) && plainKind(data) !== null
        ? v : { ...v, weights: null, rangeWeights: null }, deck.ranges ?? [], modelPower(data), scenario ?? null, nominal),
      variant: v,
      measures: [...Array(n).keys()].map((i) => Object.fromEntries(MEASURES.map((k) => {
        const x = v.ranges?.[i]?.[k];
        return [k, (nominal ? isEstimate(x) : Array.isArray(x) && finite(x[0])) ? x : null];
      })) as Record<Measure, MeanSe | null>),
      converted: (nominal ? isEstimate(v.converted) : Array.isArray(v.converted) && finite(v.converted[0])) ? v.converted! : null,
    };
  });
}

/** A range's chart factors with its mission. */
export interface ChartFactor extends RangeFactors {
  index: number;
  mission: number | null;
}

/** The chart factors of every Gekisou range (deck `gekisouAptitude.factors`); null when the chart has no aptitude. */
export function chartFactors(deck: ChartDeck | null | undefined): ChartFactor[] | null {
  const f = deck?.gekisouAptitude?.factors;
  if (!deck || !Array.isArray(f)) return null;
  return f.map((x, i) => ({ ...x, index: i, mission: deck.ranges?.[i]?.mission ?? null }));
}

/** Bands named by a shape’s condition, sorted by id, with localized names or #id. */
export function shapeBands(data: MusicData | null | undefined, shape: AptitudeShape | null | undefined, locale: AppLocale): string[] {
  const bands = new Map((data?.bands ?? []).map((b) => [b.id, b]));
  const ids = [...new Set((shape?.skills ?? []).flatMap((s) => s.bandIds ?? []))].sort((a, b) => a - b);
  return ids.map((id) => localizeDataText(bands.get(id)?.name, locale) || `#${id}`);
}

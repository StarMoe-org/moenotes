// Per-chart figures for the music pages, read from nnnotes' music-data.json (the chart data tool's file, loaded and
// cached by src/lib/chart-data/client.ts). Pure functions; `use-chart-metrics.ts` loads the file in the browser.
// Every figure is our own reading of the file (see the chart data tool's guide): nothing here guesses a value the file
// does not carry, so a chart without data shows "—".

import { density } from "@/lib/chart-data/catalog";
import { rangeMeasures } from "@/lib/chart-data/gekisou";
import { chartFigures, modelPower, perMinute, plainKind, scoreRate, weightSum, type LengthSource } from "@/lib/chart-data/ranking";
import { FREE } from "@/lib/chart-data/scenario";
import type { DataChart, DataSong, MusicData } from "@/lib/chart-data/types";

/** The efficiency the music pages show: the chart data tool's defaults (five +100 % skills, BGM length + 30 s). */
export const METRICS_SKILLS: readonly number[] = Object.freeze([1, 1, 1, 1, 1]);
export const METRICS_LENGTH: LengthSource = "bgm";
export const METRICS_OVERHEAD_MS = 30_000;

/** Gekisou missions (MasterLiveMusic `_gekisouMission1..3`). */
export const GEKISOU_MISSIONS = [1, 2, 3] as const;
export type GekisouMission = typeof GEKISOU_MISSIONS[number];
/** The i18n key part of a mission: 1 Combo, 2 Luck, 3 Just count. */
export const GEKISOU_MISSION_KEYS: Readonly<Record<GekisouMission, "combo" | "luck" | "just">> = Object.freeze({ 1: "combo", 2: "luck", 3: "just" });
export function isGekisouMission(value: unknown): value is GekisouMission {
  return value === 1 || value === 2 || value === 3;
}

export interface ChartMetrics {
  scoreId: number;
  musicId: number;
  difficulty: string;
  /** The song's BGM length, else the chart's music length (ms). */
  durationMs: number | null;
  bpm: number | null;
  bpmMin: number | null;
  bpmMax: number | null;
  /** Judged notes. */
  notes: number | null;
  /** Judged notes per second from the first to the last judged note. */
  nps: number | null;
  /**
   * Share of the no-skill score that falls inside the live skill windows (Free Live): Σ w_k / base, what one +100 %
   * skill in every slot adds relative to the no-skill score. null without deck statistics.
   */
  skillCoverage: number | null;
  /** Expected score per unit of power at METRICS_SKILLS (Gekisou Live at rank 1, the tool's default scenario). */
  rate: number | null;
  /** `rate` per minute of play (METRICS_LENGTH + METRICS_OVERHEAD_MS). */
  perMinute: number | null;
  /** Gekisou mission of each range. */
  missions: number[];
  /** Notes judged Just in the Just-count ranges on the best play; null without deck statistics. */
  justNotes: number | null;
  /** `justNotes` over the judged notes of the Just-count ranges; null without such a range. */
  justRate: number | null;
  /** Mean luck points over the published seeds, summed over the Luck ranges; null without such a range. */
  luckPoints: number | null;
}

const finite = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const positive = (value: unknown): number | null => (finite(value) && value > 0 ? value : null);

function songLengthMs(song: DataSong): number | null {
  const length = song.bgm?.length;
  return positive(length?.durationMs ?? length?.lengthMs);
}

/** The figures of one chart of the file. */
export function chartMetrics(data: MusicData | null | undefined, song: DataSong, chart: DataChart): ChartMetrics {
  const kind = plainKind(data);
  const power = modelPower(data);
  const deck = chart.deck ?? null;
  const bgmMs = songLengthMs(song);
  const chartMs = positive(chart.musicLengthMs);
  const best = chartFigures(deck, kind, power);
  const free = chartFigures(deck, kind, power, FREE) ?? best;
  const lengths = { bgmMs, chartMs };
  const rate = best ? scoreRate(best, METRICS_SKILLS) : null;
  const missions = (song.gekisouMissions ?? []).filter(finite);

  // Gekisou: Just counts from the aptitude factors (judged notes per range), luck from the seeds' range measures.
  const factors = deck?.gekisouAptitude?.factors ?? null;
  const ranges = deck?.ranges ?? [];
  const justRanges = ranges.map((range, index) => ({ range, index })).filter(({ range }) => range.mission === 3);
  const justNotes = deck && !deck.unplayable && finite(deck.justNotes) ? deck.justNotes : null;
  const justJudged = factors && justRanges.length
    ? justRanges.reduce((sum, { index }) => sum + (finite(factors[index]?.judgedNotes) ? factors[index]!.judgedNotes! : 0), 0)
    : 0;
  const measures = rangeMeasures(deck);
  const luckRanges = measures.filter((entry) => entry.measure === "luckPoints");
  const luckValues = luckRanges.map((entry) => entry.values.luckPoints?.mean);

  return {
    scoreId: chart.scoreId,
    musicId: song.id,
    difficulty: chart.difficulty,
    durationMs: bgmMs ?? chartMs,
    bpm: finite(chart.bpm?.main) ? chart.bpm!.main! : null,
    bpmMin: finite(chart.bpm?.min) ? chart.bpm!.min! : null,
    bpmMax: finite(chart.bpm?.max) ? chart.bpm!.max! : null,
    notes: finite(chart.notes?.judged) ? chart.notes!.judged! : null,
    nps: density(chart),
    skillCoverage: free && free.base > 0 ? weightSum(free) / free.base : null,
    rate,
    perMinute: best ? perMinute({ ...best, ...lengths }, METRICS_SKILLS, METRICS_LENGTH, METRICS_OVERHEAD_MS) : null,
    missions,
    // A chart without a Just-count range has none to land (0); without usable statistics nothing is known.
    justNotes: justNotes === null ? null : justRanges.length ? justNotes : 0,
    justRate: justNotes === null ? null : !justRanges.length ? 0 : justJudged > 0 ? Math.min(1, justNotes / justJudged) : null,
    luckPoints: luckRanges.length && luckValues.every(finite) ? (luckValues as number[]).reduce((a, b) => a + b, 0) : null,
  };
}

/** Every chart's figures, findable by score id or by song and difficulty. */
export interface ChartMetricsIndex {
  byScore: ReadonlyMap<number, ChartMetrics>;
  byChart: ReadonlyMap<string, ChartMetrics>;
}

export const EMPTY_METRICS_INDEX: ChartMetricsIndex = Object.freeze({ byScore: new Map(), byChart: new Map() });

const chartKey = (musicId: number, difficulty: string) => `${musicId}:${difficulty}`;

const INDEXES = new WeakMap<object, ChartMetricsIndex>();

/** The figures of every chart of a music-data.json snapshot (computed once per snapshot object). */
export function buildMetricsIndex(data: MusicData | null | undefined): ChartMetricsIndex {
  if (!data) return EMPTY_METRICS_INDEX;
  const cached = INDEXES.get(data);
  if (cached) return cached;
  const byScore = new Map<number, ChartMetrics>();
  const byChart = new Map<string, ChartMetrics>();
  for (const song of data.songs ?? []) {
    if (!song || !finite(song.id)) continue;
    for (const chart of song.charts ?? []) {
      if (!chart || typeof chart.difficulty !== "string") continue;
      try {
        const metrics = chartMetrics(data, song, chart);
        if (finite(chart.scoreId)) byScore.set(chart.scoreId, metrics);
        byChart.set(chartKey(song.id, chart.difficulty), metrics);
      } catch {
        // A chart whose statistics the readers cannot follow shows "—" like one without data.
      }
    }
  }
  const index = { byScore, byChart };
  INDEXES.set(data, index);
  return index;
}

/** A chart's figures: by its score id first, else by song and difficulty. */
export function lookupMetrics(index: ChartMetricsIndex, musicId: number, difficulty: string, scoreId?: number | null): ChartMetrics | null {
  return (finite(scoreId) ? index.byScore.get(scoreId) : undefined) ?? index.byChart.get(chartKey(musicId, difficulty)) ?? null;
}

// ---------------------------------------------------------------- formatting

/** "m:ss" of a length in ms; "—" without one. */
export function formatDuration(ms: number | null | undefined): string {
  if (!finite(ms) || ms <= 0) return "—";
  const seconds = Math.round(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

/** "150" or "120–180"; "—" without a BPM. */
export function formatBpm(metrics: Pick<ChartMetrics, "bpm" | "bpmMin" | "bpmMax"> | null | undefined): string {
  if (!metrics) return "—";
  const low = metrics.bpmMin ?? metrics.bpm, high = metrics.bpmMax ?? metrics.bpm;
  if (!finite(low) || !finite(high)) return finite(metrics.bpm) ? String(round(metrics.bpm, 1)) : "—";
  return low === high ? String(round(low, 1)) : `${round(low, 1)}–${round(high, 1)}`;
}

/** A number in the locale, with at most `digits` decimals; "—" without one. */
export function formatNumber(value: number | null | undefined, locale: string, digits = 0): string {
  return finite(value) ? value.toLocaleString(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
}

/** A share (0..1) as a percentage; "—" without one. */
export function formatPercent(value: number | null | undefined, locale: string, digits = 1): string {
  return finite(value) ? (value).toLocaleString(locale, { style: "percent", minimumFractionDigits: digits, maximumFractionDigits: digits }) : "—";
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

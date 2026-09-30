// Chart data tool: pure functions over nnnotes' music-data.json (nnnotes.music-data/1): one row per chart with the
// facts the page lists, ranks and plots. A port of ournotes-player's chart data page (examples/songs/catalog.js).

import { DIFFICULTIES, joinCharts, type FigureRow } from "./ranking";
import type { Scenario } from "./scenario";
import type { ChartDeck, DataChart, DataScoreRank, DataSong, DataText, MusicData } from "./types";

export { DIFFICULTIES };

// Judged notes by kind (NoteOperateType); hidden notes, guide ends and slide ticks that are not judged are left out.
export const NOTE_KINDS = [
  ["tap", [1, 101]],
  ["flick", [40, 41, 42, 102]],
  ["slide", [20, 21, 22]],
  ["trace", [60, 61, 62, 63, 104, 105]],
  ["combo", [120]],
] as const;
export type NoteKind = typeof NOTE_KINDS[number][0];

// {kind: count} of a chart's `notes.byOperateType`.
export function noteKinds(byOp: Readonly<Record<string, unknown>> | null | undefined): Record<NoteKind, number> {
  const out = Object.fromEntries(NOTE_KINDS.map(([k]) => [k, 0])) as Record<NoteKind, number>;
  for (const [k, ops] of NOTE_KINDS) for (const op of ops) out[k] += Number((byOp || {})[op]) || 0;
  return out;
}

// Judged notes per second of play: from the first to the last judged note.
export function density(chart: DataChart): number | null {
  const span = (chart.lastJudgedNoteMs ?? 0) - (chart.firstNoteMs ?? 0);
  const n = chart.notes && chart.notes.judged;
  return span > 0 && n ? n / (span / 1000) : null;
}

export interface ChartRow {
  scoreId: number;
  musicId: number;
  song: DataSong;
  chart: DataChart;
  /** The chart's own deck statistics (null in a file made without the deck model). */
  stats: ChartDeck | null;
  difficulty: string;
  level: number;
  displayLevel: number;
  title: DataText | null;
  bandIds: readonly number[];
  bandName: DataText | null;
  scoreRanks: readonly DataScoreRank[];
  notes: number | null;
  kinds: Record<NoteKind, number>;
  bpm: number | null;
  bpmMax: number | null;
  bpmMin: number | null;
  bpmChanges: number;
  density: number | null;
  bgmMs: number | null;
  chartMs: number | null;
  base: number | null;
  baseRange: [number, number] | null;
  seeds: number | null;
  skip: number | null;
  unplayable: string | null;
  weights: number[] | null;
}

// One row per chart of music-data.json, in song order then difficulty order, with the deck figures in a scenario
// (ranking.ts chartFigures; default: Gekisou Live at rank 1) when the chart has them; `stats` is the chart's own deck
// statistics (null in a file made without the deck model). The page rebuilds the rows when the scenario changes.
export function chartRows(data: MusicData | null | undefined, scenario: Scenario | null = null): ChartRow[] {
  const eff = new Map<number, FigureRow>(joinCharts(data, scenario).map((r) => [r.scoreId, r]));
  const out: ChartRow[] = [];
  for (const song of data?.songs ?? []) {
    const bgm = song.bgm?.length;
    for (const chart of song.charts ?? []) {
      const e = eff.get(chart.scoreId);
      out.push({
        scoreId: chart.scoreId,
        musicId: song.id,
        song,
        chart,
        stats: chart.deck || null,
        difficulty: chart.difficulty,
        level: chart.level,
        displayLevel: chart.displayLevel ?? chart.level,
        title: song.title || null,
        bandIds: song.bandIds || [],
        bandName: song.bandName || null,
        scoreRanks: song.scoreRanks || [],
        notes: chart.notes ? chart.notes.judged ?? null : null,
        kinds: noteKinds(chart.notes && chart.notes.byOperateType),
        bpm: chart.bpm ? chart.bpm.main ?? null : null,
        bpmMax: chart.bpm ? chart.bpm.max ?? null : null,
        bpmMin: chart.bpm ? chart.bpm.min ?? null : null,
        bpmChanges: chart.bpm && chart.bpm.changes ? chart.bpm.changes.length : 0,
        density: density(chart),
        bgmMs: bgm ? (bgm.durationMs ?? bgm.lengthMs ?? null) : null,
        chartMs: chart.musicLengthMs ?? null,
        base: e ? e.base : null,
        baseRange: e ? e.baseRange : null,
        seeds: e ? e.seeds : null,
        skip: chart.deck && !chart.deck.unplayable ? chart.deck.skip ?? null : null,
        unplayable: chart.deck ? chart.deck.unplayable ?? null : null,
        weights: e ? e.weights : null,
      });
    }
  }
  return out;
}

// Whether a row matches a search text: any language of the title, reading, credits, or the music id.
export function matches(row: { song?: DataSong | undefined; musicId: number }, text: string | null | undefined): boolean {
  const t = String(text || "").trim().toLowerCase();
  if (!t) return true;
  const s: Partial<DataSong> = row.song || {};
  const fields = [s.title, s.ruby, s.phonetic, s.lyricist, s.composer, s.arranger, s.bandName];
  return fields.some((x) => x && Object.values(x).some((v) => String(v).toLowerCase().includes(t)))
    || String(row.musicId).includes(t);
}

// Rows sorted by a numeric getter, descending (ascending with `asc`); rows without a value last, ties by score id.
export function sortBy<T extends { scoreId: number }>(rows: readonly T[], get: (row: T) => number | null | undefined, asc = false): T[] {
  return [...rows].sort((a, b) => {
    const x = get(a), y = get(b);
    const nx = x === null || x === undefined || Number.isNaN(x), ny = y === null || y === undefined || Number.isNaN(y);
    if (nx || ny) return nx === ny ? a.scoreId - b.scoreId : nx ? 1 : -1;
    if (x === y) return a.scoreId - b.scoreId;
    return asc ? (x as number) - (y as number) : (y as number) - (x as number);
  });
}

// "Nice" axis ticks covering [lo, hi]: about `n` round steps (1, 2, 2.5, 5 x 10^k).
export function ticks(lo: number, hi: number, n = 5): number[] {
  if (!(Number.isFinite(lo) && Number.isFinite(hi))) return [];
  if (hi === lo) return [lo];
  const raw = (hi - lo) / Math.max(1, n);
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw) || 10 * p;
  const out: number[] = [];
  for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(+v.toFixed(10));
  return out;
}

// [min, max] of the finite values, padded by `pad` of the range on each side; null when there are none.
export function extent(values: readonly (number | null | undefined)[], pad = 0.05): [number, number] | null {
  const v = values.filter((x): x is number => Number.isFinite(x));
  if (!v.length) return null;
  let lo = Math.min(...v), hi = Math.max(...v);
  if (lo === hi) { lo -= 1; hi += 1; }
  const d = (hi - lo) * pad;
  return [lo - d, hi + d];
}

// Counts of the rows' values bucketed by `get` (rounded down to `step`), as [[bucket, {difficulty: count}], ...]
// in ascending bucket order.
export function histogram<T extends { difficulty: string }>(rows: readonly T[], get: (row: T) => number | null | undefined, step = 1): Array<[number, Record<string, number>]> {
  const m = new Map<number, Record<string, number>>();
  for (const r of rows) {
    const v = get(r);
    if (!Number.isFinite(v)) continue;
    const b = +(Math.floor((v as number) / step + 1e-9) * step).toFixed(6);
    let counts = m.get(b);
    if (!counts) { counts = Object.fromEntries(DIFFICULTIES.map((d) => [d, 0])); m.set(b, counts); }
    counts[r.difficulty] = (counts[r.difficulty] || 0) + 1;
  }
  return [...m.entries()].sort((a, b) => a[0] - b[0]);
}

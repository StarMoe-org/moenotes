import type { MusicViewModel, SongDifficultyModel } from "./data";
import { MUSIC_OTHER_BAND } from "./filter";
import { lookupMetrics, type ChartMetrics, type ChartMetricsIndex } from "./metrics";
import type { MusicDifficulty } from "./difficulty";

/** The song meta table's modes: Free Live figures, or those plus the Gekisou measures. */
export type SongMetaMode = "normal" | "gekisou";

/** One chart of the song meta table. */
export interface SongMetaRow {
  song: MusicViewModel;
  chart: SongDifficultyModel;
  /** The chart's figures; null until music-data.json is loaded or when it lacks the chart. */
  metrics: ChartMetrics | null;
  /** Judged notes from the file, else the MasterData full combo. */
  notes: number;
  /** Gekisou missions from MasterData, else the file's. */
  missions: number[];
}

export interface SongMetaFilters {
  /** Empty: every difficulty. */
  difficulties: readonly MusicDifficulty[];
  /** Band ids (MUSIC_OTHER_BAND for songs outside every band); empty: every band. */
  bands: readonly number[];
  /** Attributes; empty: every one. */
  types: readonly number[];
}

/** One row per chart of the songs that pass the filters, in song order then difficulty order. */
export function songMetaRows(songs: readonly MusicViewModel[], metrics: ChartMetricsIndex, filters: SongMetaFilters): SongMetaRow[] {
  const rows: SongMetaRow[] = [];
  for (const song of songs) {
    if (filters.types.length && !filters.types.includes(song.musicType)) continue;
    const band = song.bandId && song.bandName ? song.bandId : MUSIC_OTHER_BAND;
    if (filters.bands.length && !filters.bands.includes(band)) continue;
    for (const chart of song.difficulties) {
      if (filters.difficulties.length && !filters.difficulties.includes(chart.difficulty)) continue;
      const figures = lookupMetrics(metrics, song.id, chart.difficulty, chart.scoreId);
      rows.push({
        song,
        chart,
        metrics: figures,
        notes: figures?.notes ?? chart.notesCount,
        missions: song.gekisouMissions?.length ? song.gekisouMissions : figures?.missions ?? [],
      });
    }
  }
  return rows;
}

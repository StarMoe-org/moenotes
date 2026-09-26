import type { MusicViewModel } from "@/lib/music/data";
import { isMusicDifficulty, type MusicDifficulty } from "@/lib/music/difficulty";

/** Music attributes (MasterLiveMusic `_musicType`), labelled by `cards.attributes.<n>`. */
export const MUSIC_TYPES: readonly number[] = [1, 2, 3, 4, 5];

export interface MusicFilterState {
  query: string;
  types: number[];
  bands: number[];
  /** Charts the level range looks at; empty means every difficulty. */
  difficulties: MusicDifficulty[];
  /** Inclusive bounds on the chart's integer level (26.9 is level 26); null leaves that side open. */
  minLevel: number | null;
  maxLevel: number | null;
}

export const EMPTY_MUSIC_FILTERS: MusicFilterState = {
  query: "",
  types: [],
  bands: [],
  difficulties: [],
  minLevel: null,
  maxLevel: null,
};

export function hasMusicFilters(filters: MusicFilterState): boolean {
  return Boolean(filters.query)
    || filters.types.length > 0
    || filters.bands.length > 0
    || filters.difficulties.length > 0
    || filters.minLevel !== null
    || filters.maxLevel !== null;
}

export function filterMusic(songs: readonly MusicViewModel[], filters: MusicFilterState): MusicViewModel[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  const { difficulties, minLevel, maxLevel } = filters;
  const filtersCharts = difficulties.length > 0 || minLevel !== null || maxLevel !== null;
  return songs.filter((song) => {
    if (filters.types.length > 0 && !filters.types.includes(song.musicType)) return false;
    if (filters.bands.length > 0 && !filters.bands.includes(song.bandId)) return false;
    // One chart has to satisfy both the difficulty and the level range.
    if (filtersCharts && !song.difficulties.some((chart) =>
      (difficulties.length === 0 || difficulties.includes(chart.difficulty))
      && (minLevel === null || chart.level >= minLevel)
      && (maxLevel === null || chart.level <= maxLevel)
    )) return false;
    return !needle || song.searchText.includes(needle);
  });
}

/** Bands that have songs, as `[id, name]` in id order. */
export function musicBandOptions(songs: readonly MusicViewModel[]): Array<[number, string]> {
  const values = new Map<number, string>();
  songs.forEach((song) => {
    if (song.bandId && song.bandName) values.set(song.bandId, song.bandName);
  });
  return [...values.entries()].sort(([a], [b]) => a - b);
}

/** Lowest and highest chart level across every difficulty, the level slider's ends. */
export function musicLevelBounds(songs: readonly MusicViewModel[]): [number, number] | null {
  const levels = songs.flatMap((song) => song.difficulties.map((chart) => chart.level));
  return levels.length > 0 ? [Math.min(...levels), Math.max(...levels)] : null;
}

export function serializeMusicFilters(filters: MusicFilterState): string {
  return JSON.stringify(filters);
}

export function parseMusicFilters(value: string | undefined): MusicFilterState {
  if (!value) return EMPTY_MUSIC_FILTERS;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    const low = readLevel(raw.minLevel);
    const high = readLevel(raw.maxLevel);
    const [minLevel, maxLevel] = low !== null && high !== null && low > high ? [high, low] : [low, high];
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      types: Array.isArray(raw.types) ? (raw.types as number[]) : [],
      bands: Array.isArray(raw.bands) ? (raw.bands as number[]) : [],
      difficulties: Array.isArray(raw.difficulties) ? raw.difficulties.filter(isMusicDifficulty) : [],
      minLevel,
      maxLevel,
    };
  } catch {
    return EMPTY_MUSIC_FILTERS;
  }
}

function readLevel(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

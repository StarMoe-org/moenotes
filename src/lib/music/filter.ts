import type { MusicViewModel } from "@/lib/music/data";

/** Music attributes (MasterLiveMusic `_musicType`), labelled by `cards.attributes.<n>`. */
export const MUSIC_TYPES: readonly number[] = [1, 2, 3, 4, 5];

export interface MusicFilterState {
  query: string;
  types: number[];
  bands: number[];
}

export const EMPTY_MUSIC_FILTERS: MusicFilterState = { query: "", types: [], bands: [] };

export function hasMusicFilters(filters: MusicFilterState): boolean {
  return Boolean(filters.query) || filters.types.length > 0 || filters.bands.length > 0;
}

export function filterMusic(songs: readonly MusicViewModel[], filters: MusicFilterState): MusicViewModel[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  return songs.filter((song) => {
    if (filters.types.length > 0 && !filters.types.includes(song.musicType)) return false;
    if (filters.bands.length > 0 && !filters.bands.includes(song.bandId)) return false;
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

export function serializeMusicFilters(filters: MusicFilterState): string {
  return JSON.stringify(filters);
}

export function parseMusicFilters(value: string | undefined): MusicFilterState {
  if (!value) return EMPTY_MUSIC_FILTERS;
  try {
    const raw = JSON.parse(value) as Record<string, unknown>;
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      types: Array.isArray(raw.types) ? (raw.types as number[]) : [],
      bands: Array.isArray(raw.bands) ? (raw.bands as number[]) : [],
    };
  } catch {
    return EMPTY_MUSIC_FILTERS;
  }
}

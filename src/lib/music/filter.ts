import type { MusicViewModel } from "@/lib/music/data";
import { isMusicDifficulty, type MusicDifficulty } from "@/lib/music/difficulty";

/** Music attributes (MasterLiveMusic `_musicType`), labelled by `cards.attributes.<n>`. */
export const MUSIC_TYPES: readonly number[] = [1, 2, 3, 4, 5];

/** Band filter value for songs outside every MasterBand row (no `bandIDs`, e.g. the CRYCHIC song). */
export const MUSIC_OTHER_BAND = 0;

/** The credit fields a song can be filtered by. */
export const MUSIC_CREDIT_FIELDS = ["composer", "lyricist", "arranger"] as const;
export type MusicCreditField = typeof MUSIC_CREDIT_FIELDS[number];

export interface MusicFilterState {
  query: string;
  types: number[];
  bands: number[];
  /** Charts the level range looks at; empty means every difficulty. */
  difficulties: MusicDifficulty[];
  /** Inclusive bounds on the chart's integer level (26.9 is level 26); null leaves that side open. */
  minLevel: number | null;
  maxLevel: number | null;
  /** MasterLiveMusicCategory ids (original, cover …); a song in any of them matches. */
  categories: number[];
  /** Credited people (see {@link creditMembers}); a song crediting any of them matches. */
  composers: string[];
  lyricists: string[];
  arrangers: string[];
}

export const EMPTY_MUSIC_FILTERS: MusicFilterState = {
  query: "",
  types: [],
  bands: [],
  difficulties: [],
  minLevel: null,
  maxLevel: null,
  categories: [],
  composers: [],
  lyricists: [],
  arrangers: [],
};

/** The filter state's list of a credit field. */
export const CREDIT_FILTER_KEYS: Readonly<Record<MusicCreditField, "composers" | "lyricists" | "arrangers">> = {
  composer: "composers",
  lyricist: "lyricists",
  arranger: "arrangers",
};

export function hasMusicFilters(filters: MusicFilterState): boolean {
  return Boolean(filters.query)
    || filters.types.length > 0
    || filters.bands.length > 0
    || filters.difficulties.length > 0
    || filters.minLevel !== null
    || filters.maxLevel !== null
    || filters.categories.length > 0
    || filters.composers.length > 0
    || filters.lyricists.length > 0
    || filters.arrangers.length > 0;
}

/**
 * The people of one credit line, each on its own: a joint credit ("A、B", "A / B", "A,B", "A & B") is split on its
 * separators, and an affiliation in brackets ("(SUPA LOVE)") is dropped, so that a writer can be picked once for every
 * song they wrote. Spaces never split ("BUMP OF CHICKEN" stays whole).
 */
export function creditMembers(value: string | null | undefined): string[] {
  // NFKC folds full-width brackets and separators into ASCII; lenticular brackets (U+3010/3011) are dropped as well.
  const text = (value ?? "").normalize("NFKC").replace(/[([\u3010][^()[\]\u3010\u3011]*[)\]\u3011]/gu, " ");
  const members: string[] = [];
  const push = (part: string) => {
    const member = part.replace(/\s+/g, " ").trim();
    if (member && !members.includes(member)) members.push(member);
  };
  // Separators: , ; / & + x, the ideographic comma (U+3001), or the words feat. / with / x.
  for (const line of text.split(/\s*[\u3001,;/\u00D7+&]\s*|\s+(?:feat\.?|with|x)\s+/iu)) {
    // A middle dot (U+30FB) inside katakana is one transliterated name; elsewhere it joins writers.
    if (/^[\u30A1-\u30FC\u30FB\s]+$/u.test(line)) push(line);
    else line.split(/\s*\u30FB\s*/u).forEach(push);
  }
  return members;
}

const CREDIT_CACHE = new WeakMap<MusicViewModel, Record<MusicCreditField, string[]>>();

/** A song's credited people per field. */
export function songCredits(song: MusicViewModel): Record<MusicCreditField, string[]> {
  let credits = CREDIT_CACHE.get(song);
  if (!credits) {
    credits = { composer: creditMembers(song.composer), lyricist: creditMembers(song.lyricist), arranger: creditMembers(song.arranger) };
    CREDIT_CACHE.set(song, credits);
  }
  return credits;
}

/** The people of a credit field with their song counts, most credited first (then by name). */
export function musicCreditOptions(songs: readonly MusicViewModel[], field: MusicCreditField, locale?: string): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const song of songs) for (const name of songCredits(song)[field]) counts.set(name, (counts.get(name) ?? 0) + 1);
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || collator.compare(a.name, b.name));
}

/** Categories that have songs, as `[id, songs]` in id order. */
export function musicCategoryOptions(songs: readonly MusicViewModel[]): Array<[number, number]> {
  const counts = new Map<number, number>();
  for (const song of songs) for (const id of song.categoryIds ?? []) counts.set(id, (counts.get(id) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a - b);
}

export function filterMusic(songs: readonly MusicViewModel[], filters: MusicFilterState): MusicViewModel[] {
  const needle = filters.query.trim().toLocaleLowerCase();
  const { difficulties, minLevel, maxLevel } = filters;
  const filtersCharts = difficulties.length > 0 || minLevel !== null || maxLevel !== null;
  const credits = MUSIC_CREDIT_FIELDS.map((field) => [field, filters[CREDIT_FILTER_KEYS[field]] ?? []] as const).filter(([, names]) => names.length > 0);
  const categories = filters.categories ?? [];
  return songs.filter((song) => {
    if (filters.types.length > 0 && !filters.types.includes(song.musicType)) return false;
    if (filters.bands.length > 0 && !filters.bands.includes(musicBandKey(song))) return false;
    if (categories.length > 0 && !(song.categoryIds ?? []).some((id) => categories.includes(id))) return false;
    for (const [field, names] of credits) {
      if (!songCredits(song)[field].some((name) => names.includes(name))) return false;
    }
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

/** Whether any song falls under the band filter's "other" option. */
export function hasOtherBandMusic(songs: readonly MusicViewModel[]): boolean {
  return songs.some((song) => musicBandKey(song) === MUSIC_OTHER_BAND);
}

function musicBandKey(song: MusicViewModel): number {
  return song.bandId && song.bandName ? song.bandId : MUSIC_OTHER_BAND;
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
      categories: readList(raw.categories, (entry): entry is number => typeof entry === "number" && Number.isFinite(entry)),
      composers: readList(raw.composers, isText),
      lyricists: readList(raw.lyricists, isText),
      arrangers: readList(raw.arrangers, isText),
    };
  } catch {
    return EMPTY_MUSIC_FILTERS;
  }
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function readList<T>(value: unknown, keep: (entry: unknown) => entry is T): T[] {
  return Array.isArray(value) ? value.filter(keep) : [];
}

function readLevel(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

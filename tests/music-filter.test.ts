import { describe, expect, test } from "bun:test";
import type { MusicViewModel, SongDifficultyModel } from "../src/lib/music/data";
import {
  EMPTY_MUSIC_FILTERS,
  MUSIC_OTHER_BAND,
  filterMusic,
  hasMusicFilters,
  hasOtherBandMusic,
  musicBandOptions,
  musicLevelBounds,
  parseMusicFilters,
  serializeMusicFilters,
  type MusicFilterState,
} from "../src/lib/music/filter";

function chart(difficulty: SongDifficultyModel["difficulty"], displayLevel: number): SongDifficultyModel {
  return { difficulty, level: Math.floor(displayLevel), displayLevel, notesCount: 0, chartKey: "" };
}

function song(id: number, levels: [number, number, number, number]): MusicViewModel {
  const [easy, normal, hard, expert] = levels;
  return {
    id,
    title: `Song ${id}`,
    difficulties: [chart("easy", easy), chart("normal", normal), chart("hard", hard), chart("expert", expert)],
    searchText: `song ${id}`,
  } as MusicViewModel;
}

const songs = [song(1, [5, 9, 15, 20.5]), song(2, [7, 12, 18, 25.5]), song(3, [11, 16, 23, 29])];
const ids = (filters: Partial<MusicFilterState>) => filterMusic(songs, { ...EMPTY_MUSIC_FILTERS, ...filters }).map((entry) => entry.id);

describe("music difficulty filter", () => {
  test("a level range matches any chart of the song", () => {
    expect(ids({ minLevel: 16, maxLevel: 18 })).toEqual([2, 3]);
    expect(ids({ minLevel: 26 })).toEqual([3]);
    expect(ids({ maxLevel: 6 })).toEqual([1]);
  });
  test("difficulties narrow which charts the range looks at", () => {
    expect(ids({ difficulties: ["expert"], minLevel: 16, maxLevel: 18 })).toEqual([]);
    expect(ids({ difficulties: ["hard", "expert"], minLevel: 18, maxLevel: 23 })).toEqual([1, 2, 3]);
    expect(ids({ difficulties: ["expert"], maxLevel: 22 })).toEqual([1]);
  });
  test("fractional display levels belong to their integer level", () => {
    expect(ids({ difficulties: ["expert"], minLevel: 25, maxLevel: 25 })).toEqual([2]);
    expect(ids({ difficulties: ["expert"], minLevel: 20, maxLevel: 20 })).toEqual([1]);
  });
  test("bounds span every chart level and count as active filters", () => {
    expect(musicLevelBounds(songs)).toEqual([5, 29]);
    expect(musicLevelBounds([])).toBeNull();
    expect(hasMusicFilters(EMPTY_MUSIC_FILTERS)).toBe(false);
    expect(hasMusicFilters({ ...EMPTY_MUSIC_FILTERS, maxLevel: 20 })).toBe(true);
    expect(hasMusicFilters({ ...EMPTY_MUSIC_FILTERS, difficulties: ["hard"] })).toBe(true);
  });
  test("remembered filters round-trip and tolerate old or broken state", () => {
    const filters: MusicFilterState = { ...EMPTY_MUSIC_FILTERS, difficulties: ["expert"], minLevel: 25, maxLevel: 28 };
    expect(parseMusicFilters(serializeMusicFilters(filters))).toEqual(filters);
    expect(parseMusicFilters(JSON.stringify({ query: "a", types: [], bands: [] }))).toEqual({ ...EMPTY_MUSIC_FILTERS, query: "a" });
    expect(parseMusicFilters(JSON.stringify({ difficulties: ["expert", "special", 3], minLevel: 28, maxLevel: "x" })))
      .toEqual({ ...EMPTY_MUSIC_FILTERS, difficulties: ["expert"], minLevel: 28 });
    expect(parseMusicFilters(JSON.stringify({ minLevel: 28, maxLevel: 20 }))).toMatchObject({ minLevel: 20, maxLevel: 28 });
  });
});

describe("music band filter", () => {
  const banded = (id: number, bandId: number, bandName: string) => ({ ...song(id, [5, 9, 15, 20]), bandId, bandName });
  // Song 3 has no bandIDs; song 4 names a band MasterBand does not list.
  const bandSongs = [banded(1, 1, "MyGO!!!!!"), banded(2, 2, "Ave Mujica"), banded(3, 0, ""), banded(4, 9, "")];
  const bandIds = (bands: number[]) => filterMusic(bandSongs, { ...EMPTY_MUSIC_FILTERS, bands }).map((entry) => entry.id);

  test("the other option collects songs outside every listed band", () => {
    expect(musicBandOptions(bandSongs)).toEqual([[1, "MyGO!!!!!"], [2, "Ave Mujica"]]);
    expect(bandIds([MUSIC_OTHER_BAND])).toEqual([3, 4]);
    expect(bandIds([1, MUSIC_OTHER_BAND])).toEqual([1, 3, 4]);
    expect(bandIds([9])).toEqual([]);
  });
  test("the other option only shows when some song needs it", () => {
    expect(hasOtherBandMusic(bandSongs)).toBe(true);
    expect(hasOtherBandMusic(bandSongs.slice(0, 2))).toBe(false);
  });
});

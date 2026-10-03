import { describe, expect, test } from "bun:test";
import type { MusicViewModel } from "../src/lib/music/data";
import { gekisouMissions, normalizeMusic, type RawMusic } from "../src/lib/music/data";
import {
  EMPTY_MUSIC_FILTERS,
  creditMembers,
  filterMusic,
  hasMusicFilters,
  musicCategoryOptions,
  musicCreditOptions,
  parseMusicFilters,
  serializeMusicFilters,
  type MusicFilterState,
} from "../src/lib/music/filter";
import { buildComboTiers, buildExpRewards } from "../src/lib/music/live-rewards";
import { buildMetricsIndex, chartMetrics, formatBpm, formatDuration, lookupMetrics } from "../src/lib/music/metrics";
import { songTitle } from "../src/lib/music/title-preference";
import { songMetaRows } from "../src/lib/music/song-meta";
import { musicPlaylists, playlistDuration } from "../src/lib/music/playlists";
import type { DataSong, MusicData } from "../src/lib/chart-data/types";
import type { RewardViewModel } from "../src/lib/rewards/resources";

const seedRanges = [
  { maxCombo: 40, justCount: 0, luckPoints: 0 },
  { maxCombo: 80, justCount: 0, luckPoints: 50 },
  { maxCombo: 90, justCount: 44, luckPoints: 0 },
];

const song: DataSong = {
  id: 100020,
  gekisouMissions: [1, 2, 3],
  bgm: { length: { durationMs: 120_000 } },
  charts: [
    {
      difficulty: "expert",
      scoreId: 10002003,
      level: 26,
      notes: { judged: 670 },
      bpm: { main: 180, min: 90, max: 180 },
      firstNoteMs: 2000,
      lastJudgedNoteMs: 102_000,
      musicLengthMs: 110_000,
      deck: {
        positions: 2,
        justNotes: 44,
        ranges: [{ mission: 1 }, { mission: 2 }, { mission: 3 }],
        seeds: [
          { score: 3_000_000, weights: [[100, 200]], ranges: seedRanges },
          { score: 3_300_000, weights: [[100, 200]], ranges: seedRanges.map((range, index) => (index === 1 ? { ...range, luckPoints: 70 } : range)) },
        ],
        offSeeds: [{ score: 2_000_000, weights: [[1, 2]] }],
        gekisouAptitude: { factors: [{ judgedNotes: 39 }, { judgedNotes: 84 }, { judgedNotes: 88 }] },
      },
    },
    { difficulty: "easy", scoreId: 10002000, level: 8, notes: null, bpm: null },
  ],
};

const data: MusicData = {
  deck: { model: { power: 300_000 }, kinds: [{ id: 0, effectType: 2000 }] },
  songs: [song],
};

describe("chart metrics", () => {
  const expert = chartMetrics(data, song, song.charts![0]!);

  test("plain chart facts", () => {
    expect(expert.durationMs).toBe(120_000);
    expect(expert.notes).toBe(670);
    expect(expert.nps).toBeCloseTo(6.7, 5);
    expect(formatBpm(expert)).toBe("90–180");
    expect(formatDuration(expert.durationMs)).toBe("2:00");
    expect(formatDuration(null)).toBe("—");
  });

  test("efficiency follows the chart data tool's formulas", () => {
    // base = mean(score) / power = 10.5, W = 300, five +100 % skills average 1.
    expect(expert.rate).toBeCloseTo(10.5 + 300, 6);
    expect(expert.perMinute).toBeCloseTo((10.5 + 300) / ((120_000 + 30_000) / 60_000), 6);
    // Free Live: W / base = 3 / (2,000,000 / 300,000).
    expect(expert.skillCoverage).toBeCloseTo(3 / (2_000_000 / 300_000), 6);
  });

  test("Gekisou measures read the Just and Luck ranges", () => {
    expect(expert.missions).toEqual([1, 2, 3]);
    expect(expert.justNotes).toBe(44);
    expect(expert.justRate).toBeCloseTo(44 / 88, 6);
    expect(expert.luckPoints).toBe(60);
  });

  test("a chart without statistics has no figures", () => {
    const easy = chartMetrics(data, song, song.charts![1]!);
    expect(easy.rate).toBeNull();
    expect(easy.skillCoverage).toBeNull();
    expect(easy.justNotes).toBeNull();
    expect(easy.luckPoints).toBeNull();
    expect(formatBpm(easy)).toBe("—");
  });

  test("the index finds charts by score id, else by song and difficulty", () => {
    const index = buildMetricsIndex(data);
    expect(lookupMetrics(index, 1, "hard", 10002003)?.difficulty).toBe("expert");
    expect(lookupMetrics(index, 100020, "easy")?.scoreId).toBe(10002000);
    expect(lookupMetrics(index, 100020, "hard")).toBeNull();
    expect(buildMetricsIndex(null).byScore.size).toBe(0);
    expect(buildMetricsIndex(data)).toBe(index);
  });
});

describe("credit and category filters", () => {
  const make = (id: number, composer: string, lyricist: string, categoryIds: number[]) =>
    ({ id, composer, lyricist, arranger: "", categoryIds, difficulties: [], searchText: String(id), musicType: 1, bandId: 1, bandName: "B" }) as unknown as MusicViewModel;
  const songs = [
    make(1, "長谷川大介(SUPA LOVE)、Diggy-MO’", "A", [1]),
    make(2, "長谷川大介(SUPA LOVE)", "B", [4]),
    make(3, "Diggy-MO’", "A / B", [1]),
    make(4, "アイナ・ジ・エンド、Shin Sakiura", "BUMP OF CHICKEN", [2]),
  ];

  test("joint credits split into people; affiliations and katakana names stay whole", () => {
    expect(creditMembers("長谷川大介(SUPA LOVE)、Diggy-MO’")).toEqual(["長谷川大介", "Diggy-MO’"]);
    expect(creditMembers("アイナ・ジ・エンド、Shin Sakiura")).toEqual(["アイナ・ジ・エンド", "Shin Sakiura"]);
    expect(creditMembers("BUMP OF CHICKEN")).toEqual(["BUMP OF CHICKEN"]);
    expect(creditMembers("")).toEqual([]);
  });

  test("options count songs, most credited first", () => {
    expect(musicCreditOptions(songs, "composer", "en-US").slice(0, 2).map((entry) => entry.count)).toEqual([2, 2]);
    expect(new Set(musicCreditOptions(songs, "composer", "en-US").slice(0, 2).map((entry) => entry.name))).toEqual(new Set(["Diggy-MO’", "長谷川大介"]));
    expect(musicCreditOptions(songs, "lyricist")[0]).toEqual({ name: "A", count: 2 });
    expect(musicCategoryOptions(songs)).toEqual([[1, 2], [2, 1], [4, 1]]);
  });

  test("filters combine", () => {
    const ids = (filters: Partial<MusicFilterState>) => filterMusic(songs, { ...EMPTY_MUSIC_FILTERS, ...filters }).map((entry) => entry.id);
    expect(ids({ composers: ["長谷川大介"] })).toEqual([1, 2]);
    expect(ids({ composers: ["長谷川大介"], lyricists: ["A"] })).toEqual([1]);
    expect(ids({ categories: [1, 2] })).toEqual([1, 3, 4]);
    expect(hasMusicFilters({ ...EMPTY_MUSIC_FILTERS, arrangers: ["x"] })).toBe(true);
  });

  test("new filter state round-trips; old and broken state still parses", () => {
    const state: MusicFilterState = { ...EMPTY_MUSIC_FILTERS, categories: [1], composers: ["Diggy-MO’"], lyricists: [], arrangers: ["x"] };
    expect(parseMusicFilters(serializeMusicFilters(state))).toEqual(state);
    expect(parseMusicFilters(JSON.stringify({ query: "a", types: [1], bands: [], difficulties: [], minLevel: null, maxLevel: null })))
      .toEqual({ ...EMPTY_MUSIC_FILTERS, query: "a", types: [1] });
    expect(parseMusicFilters(JSON.stringify({ categories: ["x", 2], composers: [3, "", "y"] })))
      .toEqual({ ...EMPTY_MUSIC_FILTERS, categories: [2], composers: ["y"] });
  });
});

describe("live rewards", () => {
  const resolve = (row: { resourceType: number; resourceId: number; resourceCount: number }) =>
    ({ id: row.resourceId, kind: "item", count: row.resourceCount, name: `#${row.resourceId}` }) as unknown as RewardViewModel;
  const row = (id: number, group: number, difficulty: number, comboRateType: number, resourceCount: number) =>
    ({ id, group, difficulty, comboRateType, resourceType: 1, resourceId: 3, resourceCount });

  test("combo tiers group by difficulty and tier", () => {
    const tiers = buildComboTiers([row(1, 1, 3, 3, 25), row(2, 1, 3, 0, 2000), row(3, 1, 0, 0, 500), row(4, 2, 0, 0, 1), row(5, 1, 9, 0, 1)], 1, resolve);
    expect(tiers.map((entry) => entry.difficulty)).toEqual(["easy", "expert"]);
    expect(tiers[1]!.tiers.map((tier) => [tier.percent, tier.rewards[0]!.count])).toEqual([[25, 2000], [100, 25]]);
    expect(buildComboTiers([row(1, 1, 0, 0, 1)], 0, resolve)).toEqual([]);
    expect(buildComboTiers([], 1, resolve)).toEqual([]);
  });

  test("exp rewards keep rank order and drop all-zero figures", () => {
    const exp = buildExpRewards([
      { id: 2, liveScoreRank: 7, playerExp: 300, memberCardExp: 1000, eventPoint: 30, livePoint: 0 },
      { id: 1, liveScoreRank: 2, playerExp: 300, memberCardExp: 500, eventPoint: 5, livePoint: 0 },
    ]);
    expect(exp.ranks.map((rank) => rank.rank)).toEqual(["D", "SS"]);
    expect(exp.fields).toEqual(["playerExp", "memberCardExp", "eventPoint"]);
    expect(buildExpRewards([]).ranks).toEqual([]);
  });
});

describe("song titles", () => {
  const raw = {
    id: 1, titleTextID: "t", jacketAssetName: "j", composerTextID: "", lyricistTextID: "", arrangerTextID: "",
    bandIDs: [1], vocalCharacterIDs: [], musicType: 1, startAt: "", easyID: 0, normalID: 0, hardID: 0, expertID: 0,
    musicSoundID: 0, jingleSoundID: 0, sortOrder: 10110001, musicCategories: [3], gekisouMission1: 1, gekisouMission2: 3, gekisouMission3: 2,
  } as unknown as RawMusic;

  test("the normalizer keeps the Japanese title, order, categories and missions", () => {
    const [entry] = normalizeMusic([raw], [], [], [], [{ id: "t", japanese: "迷星叫", english: "Mayoiuta" }], "en-US");
    expect(entry!.title).toBe("Mayoiuta");
    expect(entry!.titleJa).toBe("迷星叫");
    expect(entry!.sortOrder).toBe(10110001);
    expect(entry!.categoryIds).toEqual([3]);
    expect(entry!.gekisouMissions).toEqual([1, 3, 2]);
    expect(entry!.searchText).toContain("迷星叫");
    const [fallback] = normalizeMusic([raw], [], [], [], [{ id: "t", english: "Only English" }], "en-US");
    expect(fallback!.titleJa).toBe("Only English");
  });

  test("the preference picks the title", () => {
    expect(songTitle({ title: "Mayoiuta", titleJa: "迷星叫" }, true)).toBe("迷星叫");
    expect(songTitle({ title: "Mayoiuta", titleJa: "迷星叫" }, false)).toBe("Mayoiuta");
    expect(songTitle({ title: "Mayoiuta" }, true)).toBe("Mayoiuta");
    expect(gekisouMissions({ gekisouMission1: 1, gekisouMission2: 0, gekisouMission3: 2 })).toEqual([]);
  });
});

describe("song meta rows and playlists", () => {
  const chart = (difficulty: "easy" | "expert", scoreId: number, displayLevel: number) => ({ difficulty, scoreId, level: displayLevel, displayLevel, notesCount: 100, chartKey: "" });
  const make = (id: number, bandIds: number[], sortOrder: number, musicType = 1) =>
    ({ id, title: `S${id}`, bandId: bandIds[0] ?? 0, bandIds, bandName: bandIds.length ? `B${bandIds[0]}` : "", sortOrder, musicType,
      difficulties: [chart("easy", id * 10, 5), chart("expert", id * 10 + 3, 25)] }) as unknown as MusicViewModel;
  const songs = [make(3, [2], 20), make(1, [1], 12), make(2, [1], 11), make(4, [], 99, 2)];

  test("one row per chart, filtered by difficulty, band and attribute", () => {
    const index = buildMetricsIndex({ songs: [{ id: 1, gekisouMissions: [2, 2, 2], charts: [{ difficulty: "expert", scoreId: 13, level: 25, notes: { judged: 321 } }] }] });
    const rows = songMetaRows(songs, index, { difficulties: ["expert"], bands: [], types: [] });
    expect(rows.map((row) => row.song.id)).toEqual([3, 1, 2, 4]);
    expect(rows[1]!.notes).toBe(321);
    expect(rows[1]!.missions).toEqual([2, 2, 2]);
    expect(rows[0]!.metrics).toBeNull();
    expect(songMetaRows(songs, index, { difficulties: [], bands: [0], types: [] }).map((row) => row.chart.scoreId)).toEqual([40, 43]);
    expect(songMetaRows(songs, index, { difficulties: [], bands: [], types: [2] })).toHaveLength(2);
  });

  test("playlists group by band in game order, bandless songs last", () => {
    const lists = musicPlaylists(songs);
    expect(lists.map((list) => list.bandId)).toEqual([1, 2, 0]);
    expect(lists[0]!.songs.map((song) => song.id)).toEqual([2, 1]);
    expect(playlistDuration(songs, (song) => (song.id === 4 ? null : 60_000))).toEqual({ totalMs: 180_000, known: 3 });
    expect(musicPlaylists([])).toEqual([]);
  });
});

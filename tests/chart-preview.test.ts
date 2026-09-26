import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getChartManifestUrl, getChartPreviewHref, parseChartPreviewSearch } from "../src/lib/music/chart-preview";
import type { MusicViewModel } from "../src/lib/music/data";
import { EMPTY_MUSIC_FILTERS, filterMusic, musicBandOptions, parseMusicFilters, serializeMusicFilters } from "../src/lib/music/filter";

describe("chart preview addresses", () => {
  test("manifests follow the nnnotes site layout, by MasterLiveMusic id", () => {
    expect(getChartManifestUrl({ musicId: 100001, difficulty: "expert" })).toBe(`${assetConfig.chartSite}/charts/100001_expert.json`);
  });

  test("the previewer link carries the chart and is localized", () => {
    expect(getChartPreviewHref("zh-CN")).toBe("/tools/chart-preview");
    expect(getChartPreviewHref("ja-JP", { musicId: 100003, difficulty: "hard" })).toBe("/ja/tools/chart-preview?music=100003&difficulty=hard");
  });

  test("query parsing ignores unknown values", () => {
    expect(parseChartPreviewSearch("?music=100001&difficulty=normal")).toEqual({ musicId: 100001, difficulty: "normal" });
    expect(parseChartPreviewSearch("?music=abc&difficulty=master")).toEqual({ musicId: null, difficulty: null });
    expect(parseChartPreviewSearch("")).toEqual({ musicId: null, difficulty: null });
  });
});

describe("music filters", () => {
  const song = (id: number, bandId: number, musicType: number, searchText: string) =>
    ({ id, bandId, bandName: `Band ${bandId}`, musicType, searchText }) as MusicViewModel;
  const songs = [song(1, 2, 1, "haruhikage mygo"), song(2, 1, 3, "shiori"), song(3, 2, 3, "mayoiuta mygo")];

  test("search, attribute and band combine", () => {
    expect(filterMusic(songs, { query: " MyGO ", types: [], bands: [] }).map((entry) => entry.id)).toEqual([1, 3]);
    expect(filterMusic(songs, { query: "mygo", types: [3], bands: [] }).map((entry) => entry.id)).toEqual([3]);
    expect(filterMusic(songs, { query: "", types: [], bands: [1] }).map((entry) => entry.id)).toEqual([2]);
  });

  test("band options are unique and in id order", () => {
    expect(musicBandOptions(songs)).toEqual([[1, "Band 1"], [2, "Band 2"]]);
  });

  test("remembered state round-trips and tolerates bad input", () => {
    const state = { query: "a", types: [1], bands: [2] };
    expect(parseMusicFilters(serializeMusicFilters(state))).toEqual(state);
    expect(parseMusicFilters("{not json")).toEqual(EMPTY_MUSIC_FILTERS);
    expect(parseMusicFilters(undefined)).toEqual(EMPTY_MUSIC_FILTERS);
  });
});

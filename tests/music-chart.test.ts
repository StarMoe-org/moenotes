import { expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { ReleaseRequestError, fetchReleaseBytes } from "../src/lib/assets/release";
import { getChartFileUrl, getChartImageFileName, getChartJacketUrl, getChartSheetMetadata } from "../src/lib/music/chart";
import { normalizeMusic, validateMasterTable, type RawMusic, type RawMusicScore } from "../src/lib/music/data";

const api = assetConfig.api;

const music: RawMusic = {
  id: 69,
  titleTextID: "title",
  jacketAssetName: "jkt_004_100069",
  composerTextID: "composer",
  lyricistTextID: "lyricist",
  arrangerTextID: "",
  bandIDs: [4],
  vocalCharacterIDs: [],
  musicType: 1,
  startAt: "2025/01/01 00:00:00",
  easyID: 10006900,
  normalID: 10006901,
  hardID: 10006902,
  expertID: 10006903,
  musicSoundID: 0,
  jingleSoundID: 0,
};

// The published table prefixes fields with "_".
const scores = validateMasterTable<RawMusicScore>({ _allData: [
  { _id: 10006902, _musicScoreTextFileName: "0069/0069_02", _musicScoreLevel: 21, _musicScoreDisplayLevel: 21, _fullComboCount: 675 },
  { _id: 10006903, _musicScoreTextFileName: "0069/0069_03", _musicScoreLevel: 28, _musicScoreDisplayLevel: 28.5, _fullComboCount: 874 },
] })._allData;

const texts = [
  { id: "title", japanese: "起死開戦", simplifiedChinese: "起死开战" },
  { id: "composer", japanese: "藤井健太郎" },
  { id: "lyricist", english: "Lyric Writer" },
];

test("each difficulty carries the chart key of its score row", () => {
  const [song] = normalizeMusic([music], scores, [], [], texts, "zh-CN");
  expect(song!.difficulties.map(({ difficulty, chartKey }) => [difficulty, chartKey])).toEqual([
    ["hard", "0069/0069_02"],
    ["expert", "0069/0069_03"],
  ]);
});

test("chart and PNG jacket are addressed by release path in one language", () => {
  expect(getChartFileUrl("0069/0069_03")).toBe(`${api}/zh-Hans/Live/MusicScore/0069/0069_03/0069_03.json`);
  expect(getChartJacketUrl("jkt_004_100069")).toBe(`${api}/zh-Hans/Image/Jacket/jkt_004_100069/jkt_004_100069.png`);
});

test("sheet header uses localized labels and skips empty credits", () => {
  const [song] = normalizeMusic([music], scores, [], [], texts, "en-US");
  const expert = song!.difficulties.find((entry) => entry.difficulty === "expert")!;
  expect(getChartSheetMetadata(song!, expert, "en-US")).toEqual({
    title: "起死開戦",
    difficulty: "EXPERT",
    level: "28.5",
    author: "Lyricist: Lyric Writer · Composer: 藤井健太郎",
    master_full_combo: 874,
  });
  expect(getChartSheetMetadata(song!, expert, "zh-CN").author).toBe("作词：Lyric Writer · 作曲：藤井健太郎");
});

test("downloaded sheets get a file-system safe name", () => {
  expect(getChartImageFileName("A/B: C?", "expert")).toBe("A_B_ C__expert.png");
  expect(getChartImageFileName("  ", "easy")).toBe("chart_easy.png");
});

test("a missing chart surfaces its HTTP status without retrying", async () => {
  let calls = 0;
  const fetcher = (async () => {
    calls += 1;
    return new Response("missing", { status: 404 });
  }) as unknown as typeof fetch;
  const error = await fetchReleaseBytes("https://example.test/chart.json", fetcher).catch((reason: unknown) => reason);
  expect(error).toBeInstanceOf(ReleaseRequestError);
  expect((error as ReleaseRequestError).status).toBe(404);
  expect(calls).toBe(1);
});

test("chart bytes are returned verbatim", async () => {
  const fetcher = (async () => new Response(new Uint8Array([31, 139, 8]))) as unknown as typeof fetch;
  expect([...await fetchReleaseBytes("https://example.test/chart.json.gz", fetcher)]).toEqual([31, 139, 8]);
});

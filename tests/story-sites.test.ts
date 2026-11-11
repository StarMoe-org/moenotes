import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getPlayerFileKey } from "../src/lib/cache/player-files";
import {
  buildStoryPlayerEntries,
  getStoryManifestUrl,
  getStoryPlayerArtworkUrl,
  getStorySiteProxyRoot,
  getStorySiteRoots,
  isStoryPlayerEntryReleased,
  isStoryPlayerRequestReleased,
  mergeStorySiteEntries,
  type StoryPickerStory,
  type StorySiteEntry,
} from "../src/lib/story/player-data";

function entry(advId: number, server: "tw" | "jp", languages: string[]): StorySiteEntry {
  return {
    id: String(advId), advId, server, root: getStorySiteProxyRoot(server), manifest: `stories/${advId}.json`,
    titles: {}, languages, language: languages[0]!, playbackMode: 0, audio: true,
  };
}

function story(advId: number, servers: StoryPickerStory["servers"], releaseDates: StoryPickerStory["releaseDates"]): StoryPickerStory {
  return {
    advId,
    assetServer: servers[0] ?? "tw",
    category: "event",
    title: `EP${advId}`,
    servers,
    releaseDates,
    groupId: "chapter:6",
    groupTitle: "Event",
    groupSubtitle: "",
    groupImage: "Story/Banner/Chapter/ui_banner_chapter_6",
    episodeLabel: "EPISODE 1",
    episodeKind: "main",
    episodeNote: "",
    image: "Story/Banner/Episode/ui_banner_chapter_6_episode_1",
    searchText: "",
  };
}

describe("story sites", () => {
  test("the international site comes before the JP one", () => {
    expect(getStorySiteRoots()).toEqual([assetConfig.storySite, assetConfig.storySiteJp]);
  });

  test("an episode on both sites keeps its region on each index entry", () => {
    const tw = [entry(10000, "tw", ["zh-Hant", "ja"])];
    const jp = [entry(10000, "jp", ["ja"]), entry(10946, "jp", ["ja"])];
    const merged = mergeStorySiteEntries([tw, jp]);
    expect(merged.map((item) => [item.advId, item.root, item.server])).toEqual([
      [10000, getStorySiteProxyRoot("tw"), "tw"],
      [10946, getStorySiteProxyRoot("jp"), "jp"],
    ]);
  });

  test("a manifest resolves against its own same-origin regional proxy", () => {
    expect(getStoryManifestUrl(getStorySiteProxyRoot("jp"), "stories/10946.json"))
      .toBe("/api/v1/story-site/jp/stories/10946.json");
  });

  test("JP event episodes use JP artwork and JP's release date", () => {
    const site = [entry(10946, "jp", ["ja"])];
    const [built] = buildStoryPlayerEntries([story(10946, ["jp"], { jp: "2026/10/01 12:00:00" })], site);
    expect(built?.section).toBe("event");
    expect(built?.site.root).toBe(getStorySiteProxyRoot("jp"));
    expect(built?.site.server).toBe("jp");
    expect(built?.startAt).toBe("2026/10/01 12:00:00");
    expect(built?.assetServer).toBe("jp");
    expect(isStoryPlayerEntryReleased(built!, Date.UTC(2026, 9, 27))).toBe(true);
    expect(getStoryPlayerArtworkUrl(built!.image, "zh-CN", built!.assetServer)).toBe(`${assetConfig.api}/jp/ja/Story/Banner/Episode/ui_banner_chapter_6_episode_1/ui_banner_chapter_6_episode_1.webp`);
    expect(getStoryPlayerArtworkUrl(built!.groupImage, "zh-CN", built!.assetServer)).toBe(`${assetConfig.api}/jp/ja/Story/Banner/Chapter/ui_banner_chapter_6/ui_banner_chapter_6.webp`);
  });

  test("hides a story until every region that contains it has released it", () => {
    const site = [entry(10000, "tw", ["zh-Hant", "ja"])];
    const [built] = buildStoryPlayerEntries([story(10000, ["tw", "jp"], {
      tw: "2026/10/01 12:00:00",
      jp: "2026/11/01 12:00:00",
    })], site);
    expect(isStoryPlayerEntryReleased(built!, Date.UTC(2026, 9, 27))).toBe(false);
    expect(isStoryPlayerEntryReleased(built!, Date.UTC(2026, 11, 1))).toBe(true);
  });

  test("omits cloud-only entries without a locally verified release record", () => {
    expect(buildStoryPlayerEntries([], [entry(99999, "jp", ["ja"])] )).toEqual([]);
  });

  test("a direct ?story id is denied unless it matches a verified and released entry", () => {
    const site = [entry(10000, "tw", ["zh-Hant", "ja"])];
    const [released] = buildStoryPlayerEntries([story(10000, ["tw", "jp"], {
      tw: "2026/10/01 12:00:00",
      jp: "2026/10/20 12:00:00",
    })], site);
    const [notReleased] = buildStoryPlayerEntries([story(10001, ["tw"], { tw: "2026/11/01 12:00:00" })], [entry(10001, "tw", ["ja"])]);
    expect(isStoryPlayerRequestReleased(10000, [released!], Date.UTC(2026, 9, 27))).toBe(true);
    expect(isStoryPlayerRequestReleased(10001, [notReleased!], Date.UTC(2026, 9, 27))).toBe(false);
    expect(isStoryPlayerRequestReleased(99999, [released!], Date.UTC(2026, 9, 27))).toBe(false);
  });

  test("does not match an international cloud entry to a story that only exists in JP MasterData", () => {
    const built = buildStoryPlayerEntries([story(99998, ["jp"], { jp: "2026/10/01 12:00:00" })], [entry(99998, "tw", ["ja"]) ]);
    expect(built).toEqual([]);
  });

  test.each(["zh-CN", "zh-TW", "ja-JP", "en-US", "ko-KR"] as const)("JP episode banners use the Japanese catalog in %s", (locale) => {
    expect(getStoryPlayerArtworkUrl("Story/Banner/Episode/ui_banner_chapter_6_episode_2", locale, "jp"))
      .toBe(`${assetConfig.api}/jp/ja/Story/Banner/Episode/ui_banner_chapter_6_episode_2/ui_banner_chapter_6_episode_2.webp`);
  });

  test.each([["zh-CN", "zh-Hans"], ["zh-TW", "zh-Hant"], ["ja-JP", "ja"], ["en-US", "en"], ["ko-KR", "ko"]] as const)("international banners keep their %s language", (locale, language) => {
    expect(getStoryPlayerArtworkUrl("Story/Banner/Episode/ui_banner_chapter_1_episode_1", locale, "tw"))
      .toBe(`${assetConfig.api}/${language}/Story/Banner/Episode/ui_banner_chapter_1_episode_1/ui_banner_chapter_1_episode_1.webp`);
  });

  test("episodes without artwork keep an empty URL", () => {
    expect(getStoryPlayerArtworkUrl("", "zh-CN", "jp")).toBe("");
    expect(buildStoryPlayerEntries([], [entry(99999, "jp", ["ja"])] )).toEqual([]);
  });

  test("the same-origin player proxy keeps only its content-addressed assets in the file cache", () => {
    const hash = "a".repeat(64);
    const proxied = `/api/v1/story-site/jp/stories/10946/assets/${hash}.m4a`;
    expect(getPlayerFileKey(proxied, "https://bdon.moe/tools/story-player")).toBe(`https://bdon.moe${proxied}`);
    expect(getPlayerFileKey(`/api/v1/story-site/jp/stories/10946/assets/${hash}.m4a?x=1`, "https://bdon.moe/tools/story-player")).toBeNull();
    expect(getPlayerFileKey(`/api/v1/story-site/jp/stories/10946/assets/sub/${hash}.m4a`, "https://bdon.moe/tools/story-player")).toBeNull();
  });
});

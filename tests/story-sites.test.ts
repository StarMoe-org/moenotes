import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getPlayerFileKey } from "../src/lib/cache/player-files";
import { buildStoryPlayerEntries, getStoryManifestUrl, getStoryPlayerArtworkUrl, getStorySiteRoots, mergeStorySiteEntries, type StorySiteEntry } from "../src/lib/story/player-data";

function entry(advId: number, root: string, languages: string[]): StorySiteEntry {
  return { id: String(advId), advId, root, manifest: `stories/${advId}.json`, titles: {}, languages, language: languages[0]!, playbackMode: 0, audio: true };
}

describe("story sites", () => {
  test("the international site comes before the JP one", () => {
    expect(getStorySiteRoots()).toEqual([assetConfig.storySite, assetConfig.storySiteJp]);
  });

  test("an episode on both sites plays from the first; JP-only episodes are added", () => {
    const tw = [entry(10000, assetConfig.storySite, ["zh-Hant", "ja"])];
    const jp = [entry(10000, assetConfig.storySiteJp, ["ja"]), entry(10946, assetConfig.storySiteJp, ["ja"])];
    const merged = mergeStorySiteEntries([tw, jp]);
    expect(merged.map((item) => [item.advId, item.root])).toEqual([[10000, assetConfig.storySite], [10946, assetConfig.storySiteJp]]);
  });

  test("a manifest resolves against its own site", () => {
    expect(getStoryManifestUrl(assetConfig.storySiteJp, "stories/10946.json")).toBe(`${assetConfig.storySiteJp}/stories/10946.json`);
  });

  test("JP event episodes use JP artwork even when the build's base data comes from TW", () => {
    const site = [entry(10946, assetConfig.storySiteJp, ["ja"])];
    const [built] = buildStoryPlayerEntries([{
      advId: 10946, assetServer: "tw", category: "event", title: "EP1", groupId: "chapter:6", groupTitle: "Event", groupSubtitle: "", groupImage: "Story/Banner/Chapter/ui_banner_chapter_6",
      episodeLabel: "EPISODE 1", episodeKind: "main", episodeNote: "", image: "Story/Banner/Episode/ui_banner_chapter_6_episode_1", searchText: "",
    }], site, "ja-JP", "Other");
    expect(built?.section).toBe("event");
    expect(built?.site.root).toBe(assetConfig.storySiteJp);
    expect(built?.assetServer).toBe("jp");
    expect(getStoryPlayerArtworkUrl(built!.image, "zh-CN", built!.assetServer)).toBe(`${assetConfig.api}/jp/ja/Story/Banner/Episode/ui_banner_chapter_6_episode_1/ui_banner_chapter_6_episode_1.webp`);
    expect(getStoryPlayerArtworkUrl(built!.groupImage, "zh-CN", built!.assetServer)).toBe(`${assetConfig.api}/jp/ja/Story/Banner/Chapter/ui_banner_chapter_6/ui_banner_chapter_6.webp`);
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
    const [unknown] = buildStoryPlayerEntries([], [entry(99999, assetConfig.storySiteJp, ["ja"])], "zh-CN", "Other");
    expect(unknown?.image).toBe("");
    expect(getStoryPlayerArtworkUrl(unknown!.image, "zh-CN", unknown!.assetServer)).toBe("");
  });

  test("the JP site's assets are kept in the player file cache", () => {
    const hash = "a".repeat(64);
    expect(getPlayerFileKey(`${assetConfig.storySiteJp}/assets/${hash}.m4a`)).toBe(`${assetConfig.storySiteJp}/assets/${hash}.m4a`);
  });
});

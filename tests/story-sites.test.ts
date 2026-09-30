import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getPlayerFileKey } from "../src/lib/cache/player-files";
import { buildStoryPlayerEntries, getStoryManifestUrl, getStorySiteRoots, mergeStorySiteEntries, type StorySiteEntry } from "../src/lib/story/player-data";

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

  test("JP event episodes land in the event list", () => {
    const site = [entry(10946, assetConfig.storySiteJp, ["ja"])];
    const [built] = buildStoryPlayerEntries([{
      advId: 10946, category: "event", title: "EP1", groupId: "chapter:6", groupTitle: "Event", groupSubtitle: "", groupImage: "",
      episodeLabel: "EPISODE 1", episodeKind: "main", episodeNote: "", image: "", searchText: "",
    }], site, "ja-JP", "Other");
    expect(built?.section).toBe("event");
    expect(built?.site.root).toBe(assetConfig.storySiteJp);
  });

  test("the JP site's assets are kept in the player file cache", () => {
    const hash = "a".repeat(64);
    expect(getPlayerFileKey(`${assetConfig.storySiteJp}/assets/${hash}.m4a`)).toBe(`${assetConfig.storySiteJp}/assets/${hash}.m4a`);
  });
});

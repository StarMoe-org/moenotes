import { describe, expect, test } from "bun:test";
import { getApprovedStoryResourcePath, getIndexedStoryManifestPath, isStorySiteRegion } from "../src/lib/story/site-access";

describe("story-site resource access", () => {
  test("accepts only an index manifest path for the same numeric episode", () => {
    expect(getIndexedStoryManifestPath("stories/123.json", 123)).toBe("stories/123.json");
    expect(getIndexedStoryManifestPath("stories/jp/123.json", 123)).toBe("stories/jp/123.json");
    for (const [path, advId] of [
      ["stories/124.json", 123],
      ["../stories/123.json", 123],
      ["stories/%2e%2e/123.json", 123],
      ["https://example.invalid/stories/123.json", 123],
      ["stories/123.json?x=1", 123],
      ["stories/jp/other/123.json", 123],
      ["stories/123.json", 0],
    ] as const) {
      expect(getIndexedStoryManifestPath(path, advId)).toBeNull();
    }
  });

  test("only permits content-addressed assets and model manifests under a released story", () => {
    const asset = `assets/${"a".repeat(64)}.json.gz`;
    expect(getApprovedStoryResourcePath(asset)).toBe(asset);
    expect(getApprovedStoryResourcePath("models/adv_live2d_rana_003_casual.json")).toBe("models/adv_live2d_rana_003_casual.json");
    for (const path of [
      "../stories/123.json",
      "/assets/file.png",
      "assets/../../private.json",
      "assets/not-a-hash.png",
      "models/../../outside.json",
      "models/Other-Model.json",
      "assets/a".repeat(64),
      `assets/${"b".repeat(64)}.png?download=1`,
      `assets/${"c".repeat(64)}.png#fragment`,
      `assets/${"d".repeat(64)}.png\\..\\secret`,
    ]) {
      expect(getApprovedStoryResourcePath(path)).toBeNull();
    }
  });

  test("only configured story regions are accepted", () => {
    expect(isStorySiteRegion("tw")).toBe(true);
    expect(isStorySiteRegion("jp")).toBe(true);
    expect(isStorySiteRegion("kr")).toBe(false);
    expect(isStorySiteRegion("../../jp")).toBe(false);
  });
});

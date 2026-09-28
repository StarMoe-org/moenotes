import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getPlayerFileKey, selectPlayerFilesToEvict } from "../src/lib/cache/player-files";
import { formatBytes } from "../src/lib/format/bytes";

const hash = "3d6ceea9bb8c57f985156d6334d83eb78a8a36a936d0136a3bcc8e966a1448cb";

describe("player file cache keys", () => {
  test("content-addressed files of the story site and the chart site are kept", () => {
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash}.m4a`)).toBe(`${assetConfig.storySite}/assets/${hash}.m4a`);
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash}.glsl.gz`)).toBe(`${assetConfig.storySite}/assets/${hash}.glsl.gz`);
    expect(getPlayerFileKey(`${assetConfig.chartSite}/assets/${hash}.moc3`)).toBe(`${assetConfig.chartSite}/assets/${hash}.moc3`);
  });

  test("the key leaves out the hash", () => {
    expect(getPlayerFileKey(`${assetConfig.chartSite}/assets/${hash}.png#frame`)).toBe(`${assetConfig.chartSite}/assets/${hash}.png`);
  });

  test("manifests, indexes and other hosts pass through", () => {
    expect(getPlayerFileKey(`${assetConfig.storySite}/stories.json`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.storySite}/stories/10000.json`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.chartSite}/models/adv_live2d_anon_002_casual_spring_01.json`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.chartSite}/charts/1_expert.json`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.api}/assets/${hash}.png`)).toBeNull();
  });

  test("names that are not a sha256, and queries, pass through", () => {
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash.slice(1)}.m4a`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash.toUpperCase()}.m4a`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash}`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/sub/${hash}.m4a`)).toBeNull();
    expect(getPlayerFileKey(`${assetConfig.storySite}/assets/${hash}.m4a?v=2`)).toBeNull();
    expect(getPlayerFileKey("not a url")).toBeNull();
  });
});

describe("player file eviction", () => {
  const file = (key: string, size: number, lastAccessedAt: number) => ({ key, size, lastAccessedAt });

  test("nothing goes while the store is within budget", () => {
    expect(selectPlayerFilesToEvict([file("a", 40, 1), file("b", 60, 2)], 100)).toEqual([]);
  });

  test("the least recently used go first, down to the target share of the budget", () => {
    const files = [file("new", 50, 30), file("old", 50, 10), file("mid", 50, 20)];
    expect(selectPlayerFilesToEvict(files, 100, 0.9)).toEqual(["old", "mid"]);
    expect(selectPlayerFilesToEvict(files, 120, 0.9)).toEqual(["old"]);
  });

  test("an empty store evicts nothing", () => {
    expect(selectPlayerFilesToEvict([], 0)).toEqual([]);
  });
});

describe("byte counts", () => {
  test("each unit", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(38 * 1024 + 100)).toBe("38 KB");
    expect(formatBytes(15.3 * 1024 ** 2)).toBe("15.3 MB");
    expect(formatBytes(2 * 1024 ** 3)).toBe("2 GB");
    expect(formatBytes(1.25 * 1024 ** 3)).toBe("1.25 GB");
  });
});

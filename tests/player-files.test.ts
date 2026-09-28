import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { PLAYER_FILE_KINDS, classifyManifestFiles, getPlayerFileKey, selectPlayerFilesToEvict, storyFileKind } from "../src/lib/cache/player-files";
import { CACHE_CATEGORIES, PLAYER_KIND_CATEGORIES, assetCacheCategory } from "../src/lib/cache/usage";
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

describe("player file kinds", () => {
  // A content-addressed name ending in `id` (hex digits): assets/<sha256>.<ext>.
  const file = (name: string) => {
    const [id = "", ...ext] = name.split(".");
    return `assets/${hash.slice(0, 64 - id.length)}${id}.${ext.join(".")}`;
  };
  const key = (site: string, name: string) => `${site}/${file(name)}`;

  test("a story file's kind goes by its path", () => {
    expect(storyFileKind("audio/adv_voice_mygo_001_1_01/adv_voice_mygo_001_1_01_001.m4a")).toBe("voice");
    expect(storyFileKind("audio/VoiceSystem_13/BandTop_Ritsu_Autumn_01.m4a")).toBe("voice");
    expect(storyFileKind("audio/spot_03_01_02/spot_03_01_02_arale_01_tap.m4a")).toBe("voice");
    expect(storyFileKind("audio/sound_bgm_adv_liminal/sound_bgm_adv_liminal.m4a")).toBe("sound");
    expect(storyFileKind("audio/sound_se_adv_walk/cues.json")).toBe("sound");
    expect(storyFileKind("textures/adv_bkg_stage_000021-d29d7375.png")).toBe("background");
    expect(storyFileKind("textures/adv_still_anime_000001-4f378e15.png")).toBe("background");
    expect(storyFileKind("host/spot/room.glb")).toBe("background");
    expect(storyFileKind("live2d/adv_live2d_anon_002_casual_spring_01/model.json")).toBe("live2d");
    expect(storyFileKind("textures/Thin01-da21b8b2.png")).toBe("story");
    expect(storyFileKind("host/ui/ui.json")).toBe("story");
    expect(storyFileKind("shaders/Adv_AlphaBlend.json")).toBe("story");
    expect(storyFileKind("episode.json")).toBe("story");
  });

  test("a story manifest names the kinds of its files, every language's included", () => {
    const manifest = {
      format: "ournotes.story-manifest/2",
      root: "../",
      files: {
        "audio/adv_voice_x/adv_voice_x_001.m4a": { asset: file("0a.m4a"), size: 1 },
        "textures/adv_bkg_room-00.png": { asset: file("0b.png"), size: 1 },
        "ui/ui.json": { parts: [["key", file("0c.json.gz"), 1, 1], ["nodes", file("0d.json.gz"), 1, 1]], size: 2 },
      },
      languages: { ja: { files: { "ui/fonts/font.png": { asset: file("0e.png"), size: 1 } } } },
    };
    const kinds = classifyManifestFiles(`${assetConfig.storySite}/stories/10000.json`, manifest);
    expect([...kinds]).toEqual([
      [key(assetConfig.storySite, "0a.m4a"), "voice"],
      [key(assetConfig.storySite, "0b.png"), "background"],
      [key(assetConfig.storySite, "0c.json.gz"), "story"],
      [key(assetConfig.storySite, "0d.json.gz"), "story"],
      [key(assetConfig.storySite, "0e.png"), "story"],
    ]);
  });

  test("a model manifest's files are Live2D, on either site", () => {
    const manifest = { format: 3, id: "m", files: { "m.moc3": { asset: file("0f.moc3.gz"), size: 2, stored: 1 } } };
    expect([...classifyManifestFiles(`${assetConfig.storySite}/models/m.json`, manifest)]).toEqual([[key(assetConfig.storySite, "0f.moc3.gz"), "live2d"]]);
    expect([...classifyManifestFiles(`${assetConfig.chartSite}/models/m.json`, manifest)]).toEqual([[key(assetConfig.chartSite, "0f.moc3.gz"), "live2d"]]);
  });

  test("charts, indexes and assets of other hosts name no kind", () => {
    const chart = { files: { "music/song.m4a": { asset: file("1a.m4a"), size: 1 } } };
    expect(classifyManifestFiles(`${assetConfig.chartSite}/charts/1_expert.json`, chart).size).toBe(0);
    expect(classifyManifestFiles(`${assetConfig.storySite}/stories.json`, { stories: [] }).size).toBe(0);
    const elsewhere = { format: "ournotes.story-manifest/2", root: "https://example.com/", files: { "episode.json": { asset: file("1b.json"), size: 1 } } };
    expect(classifyManifestFiles(`${assetConfig.storySite}/stories/1.json`, elsewhere).size).toBe(0);
  });
});

describe("cache categories", () => {
  test("the release asset cache counts by content type", () => {
    expect(assetCacheCategory("image/webp")).toBe("images");
    expect(assetCacheCategory("audio/mpeg")).toBe("audio");
    expect(assetCacheCategory("application/json")).toBe("data");
  });

  test("a story's backgrounds count as images, its voices and sounds as audio, the rest as data", () => {
    expect(PLAYER_KIND_CATEGORIES).toEqual({ live2d: "live2d", background: "images", voice: "audio", sound: "audio", chart: "chart", story: "data" });
    for (const kind of PLAYER_FILE_KINDS) expect(CACHE_CATEGORIES).toContain(PLAYER_KIND_CATEGORIES[kind]);
  });

  test("every category has a color token, a label and a hint in the core locales", async () => {
    const css = `${await Bun.file("src/styles/tokens.css").text()}\n${await Bun.file("src/styles/themes.css").text()}`;
    for (const category of CACHE_CATEGORIES) expect(css.match(new RegExp(`--mn-cache-${category}:`, "g"))?.length).toBe(2);
    const { enUS } = await import("../src/i18n/messages/en-US");
    for (const category of CACHE_CATEGORIES) {
      expect(enUS.settings.data.categories[category]).toBeTruthy();
      expect(enUS.settings.data.categoryHints[category]).toBeTruthy();
    }
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

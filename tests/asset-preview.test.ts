import { expect, test } from "bun:test";
import { getAssetBrowserPreview } from "../src/lib/assets/preview";

test("resolves image preview for AddressableResources path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Band/1/band_arena_background.png", "zh-CN");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("image");
  expect(result?.url).toBe("https://assets.bdon.moe/zh-Hans/Band/1/band_arena_background/band_arena_background.webp");
});

test("returns null for non-exported or unmapped path", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Unknown/not_exist.bytes", "zh-CN");
  expect(result).toBeNull();
});

test("resolves audio preview for CRI sound cue sheet path with subdirectory", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Cri/Sound/Bgm/sound_bgm_mygo_offline.acb", "zh-CN");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("audio");
  expect(result?.url).toBe("https://assets.bdon.moe/zh-Hans/Cri/Sound/sound_bgm_mygo_offline/sound_bgm_mygo_offline.m4a");
});

test("resolves audio preview for CRI sound cue sheet path on specific server", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Cri/Sound/MusicScore/sound_bgm_1001.awb", "ja-JP", "jp");
  expect(result).not.toBeNull();
  expect(result?.type).toBe("audio");
  expect(result?.url).toBe("https://assets.bdon.moe/jp/ja/Cri/Sound/sound_bgm_1001/sound_bgm_1001.m4a");
});

test("resolves a CRI movie to its exported MP4 under the movie's own key", () => {
  const result = getAssetBrowserPreview("Assets/AddressableResources/Cri/Video/live/MV/music_mv_001_100001.usm", "ja-JP", "jp");
  expect(result).toEqual({
    type: "video",
    url: "https://assets.bdon.moe/jp/ja/Cri/Video/live/MV/music_mv_001_100001/music_mv_001_100001.mp4",
  });
});

test("keeps a story clip's nested movie key", () => {
  const result = getAssetBrowserPreview(
    "Assets/AddressableResources/Cri/Video/live/MV/music_mv_001_100001/music_mv_001_100001.usm",
    "zh-CN",
    "kr",
  );
  expect(result).toEqual({
    type: "video",
    url: "https://assets.bdon.moe/kr/zh-Hans/Cri/Video/live/MV/music_mv_001_100001/music_mv_001_100001/music_mv_001_100001.mp4",
  });
});

test("does not map a movie outside the exported Cri/Video layout", () => {
  expect(getAssetBrowserPreview("Assets/AddressableResources/MemberCard/30/card_movie.usm", "zh-CN")).toBeNull();
});

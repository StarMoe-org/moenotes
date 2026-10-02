import { expect, test } from "bun:test";
import { getAssetUrl, getAudioAssetUrl, getImageAssetUrl } from "../src/lib/assets/url";
import { assetLanguage } from "../src/lib/assets/release";
import { getCostumeIconUrl } from "../src/lib/assets/costume";
import { getVoiceAudioUrl } from "../src/lib/assets/voice";
import { getStoryBackgroundUrl, getStoryBgmUrl, getStoryScriptTableUrl, getStoryStillUrl, getStoryVoiceUrl } from "../src/lib/story/assets";
import { getMusicAudioUrl } from "../src/lib/music/data";
import { isManagedAssetUrl } from "../src/lib/cache/cached-fetch";
import { assetConfig } from "../src/config/assets";

const api = assetConfig.api;

test("release files are addressed by asset path, not by ID", () => {
  expect(getAssetUrl({ path: "Character/Image/11/character_face_icon.png" }))
    .toBe(`${api}/zh-Hans/Character/Image/11/character_face_icon/character_face_icon.webp`);
  expect(getAssetUrl({ path: "Cri/Sound/MusicScore/A_AveMujica.wav" })).toBe("");
});

test("audio requests resolve a cue sheet's published m4a", () => {
  expect(getAssetUrl({ type: "audio", path: "A_Abracadabra" })).toBe(`${api}/zh-Hans/Cri/Sound/A_Abracadabra/A_Abracadabra.m4a`);
  expect(getAssetUrl({ type: "audio", path: "Cri/Sound/MusicScore/A_AveMujica.acb", locale: "ja-JP" }))
    .toBe(`${api}/ja/Cri/Sound/MusicScore/A_AveMujica/A_AveMujica.m4a`);
  expect(getAudioAssetUrl("sound_bgm_adv_cafe_time", "en-US")).toBe(`${api}/en/Cri/Sound/sound_bgm_adv_cafe_time/sound_bgm_adv_cafe_time.m4a`);
  expect(getAssetUrl({ type: "audio", path: " " })).toBe("");
});

test("json requests pass through as published", () => {
  expect(getAssetUrl({ type: "json", path: "Assets/AddressableResources/scores/expert/MySong" }))
    .toBe(`${api}/Assets/AddressableResources/scores/expert/MySong.json`);
  expect(getAssetUrl({ type: "json", path: " " })).toBe("");
});

test("character voices resolve by their cue sheet", () => {
  expect(getVoiceAudioUrl(42, "live_voice_kasumi_001", "live_voice_kasumi", "ko-KR"))
    .toBe(`${api}/ko/Cri/Sound/live_voice_kasumi/live_voice_kasumi.m4a`);
});

test("costume icons follow the image release layout", () => {
  expect(getCostumeIconUrl("live2d/icon/icon_costume_001", "ja-JP")).toBe(`${api}/ja/live2d/icon/icon_costume_001/icon_costume_001.webp`);
});

test("card textures use their named output rather than a crop", () => {
  expect(getAssetUrl({ path: "MemberCard/1/member_full_atlas.png" })).toBe(`${api}/zh-Hans/MemberCard/1/member_full/member_full.webp`);
});

test("artwork follows the locale's first text language", () => {
  expect(["zh-CN", "zh-TW", "ja-JP", "ko-KR", "en-US", "fr-FR"].map((locale) => assetLanguage(locale as never)))
    .toEqual(["zh-Hans", "zh-Hant", "ja", "ko", "en", "en"]);
  expect(getImageAssetUrl("Band/3/band_logo", "ja-JP")).toBe(`${api}/ja/Band/3/band_logo/band_logo.webp`);
  expect(getImageAssetUrl("Band/3/band_logo.png", "zh-TW")).toBe(`${api}/zh-Hant/Band/3/band_logo/band_logo.webp`);
  expect(getImageAssetUrl("", "en-US")).toBe("");
});

test("downloads keep a readable file name", () => {
  expect(getImageAssetUrl("Image/Comic/comic_022_1", "en-US").split("/").pop()).toBe("comic_022_1.webp");
});

test("story tables, backgrounds and stills use their published paths", () => {
  const name = "adv_script_mygo_001_1_01";
  expect(getStoryScriptTableUrl(name, "Text", "en-US")).toBe(`${api}/en/Adv/Episode/${name}/${name}-Text/${name}-Text.json`);
  expect(getStoryScriptTableUrl(" ", "Text")).toBe("");
  expect(getStoryBackgroundUrl("adv_bkg_stage_000218/adv_bkg_stage_000218"))
    .toBe(`${api}/zh-Hans/Adv/Stage/adv_bkg_stage_000218/data/adv_bkg_stage_000218/adv_bkg_stage_000218.webp`);
  expect(getStoryStillUrl("anime/adv_still_anime_000001/adv_still_anime_000001"))
    .toBe(`${api}/zh-Hans/Adv/Still/anime/adv_still_anime_000001/data/adv_still_anime_000001/adv_still_anime_000001.webp`);
});

test("cues are selected by sheet and exact cue without adjusting the cue number", () => {
  const sheet = "adv_voice_anotherstory_10435";
  const cue = "adv_voice_mygo_001_1_02_029";
  expect(getStoryVoiceUrl({ cueName: cue, cueSheetName: sheet, scriptName: "unused", soundId: 1 }, "ko-KR"))
    .toBe(`${api}/ko/Cri/Sound/${sheet}/${cue}.m4a`);
  expect(getStoryVoiceUrl({ cueName: "", cueSheetName: sheet, scriptName: "unused", soundId: 1 }, "ko-KR")).toBeUndefined();
  // BGM and SE sheets publish one cue named after the sheet.
  expect(getStoryBgmUrl(" sound_bgm_adv_cafe_time ", "ja-JP")).toBe(`${api}/ja/Cri/Sound/sound_bgm_adv_cafe_time/sound_bgm_adv_cafe_time.m4a`);
});

test("songs resolve by cue sheet and cue", () => {
  expect(getMusicAudioUrl({ id: 1, cueSheetName: "A_Abracadabra", cueName: "A_Abracadabra" }, "zh-CN"))
    .toBe(`${api}/zh-Hans/Cri/Sound/A_Abracadabra/A_Abracadabra.m4a`);
  expect(getMusicAudioUrl(undefined, "zh-CN")).toBeUndefined();
});

test("the asset cache manages release paths but not browser API listings", () => {
  expect(isManagedAssetUrl(getImageAssetUrl("Band/3/band_logo", "ja-JP"))).toBe(true);
  expect(isManagedAssetUrl(`${api}/browse?directory=Assets`)).toBe(false);
});

import { expect, test } from "bun:test";
import { getAssetUrl } from "../src/lib/assets/url";
import { resolveReleaseAssetPath } from "../src/lib/assets/release-path";
import { resolveReleaseAudioPath } from "../src/lib/story/release-audio";
import { getStoryBackgroundUrl, getStoryBgmUrl, getStoryVoiceUrl, getStoryScriptTableUrl } from "../src/lib/story/assets";
import { getMusicAudioUrl } from "../src/lib/music/data";
import { assetConfig } from "../src/config/assets";

test("card textures use their named output rather than a crop or a fixed index", () => {
  expect(resolveReleaseAssetPath("MemberCard/1/member_full_atlas.png")).toBe("MemberCard/1/member_full/member_full__00001.png");
  expect(resolveReleaseAssetPath("MemberCard/60/member_character_atlas.png")).toBe("MemberCard/60/member_character/member_character__00005.png");
});

test("release character icons and item paths resolve from the manifest", () => {
  expect(getAssetUrl({ path: "Character/Image/11/character_face_icon.png" })).toBe(`${assetConfig.releaseSource}/Character/Image/11/character_face_icon/character_face_icon__00000.png`);
  expect(resolveReleaseAssetPath("Item/common/item_icon_star.png")).toStartWith("Item/common/item_icon_star/");
});

test("story tables use the published JSON layout", () => {
  const name = "adv_script_mygo_001_1_01";
  expect(getStoryScriptTableUrl(name, "Text")).toBe(`${assetConfig.releaseSource}/Adv/Episode/${name}/${name}-Text/${name}-Text.json`);
  expect(resolveReleaseAssetPath("Adv/Episode/unknown/unknown-Text.txt")).toBeUndefined();
});

test("audio is selected by sheet and exact cue without subtracting a cue index", () => {
  const cue = "adv_voice_mygo_001_1_02_029";
  const sheet = "adv_voice_anotherstory_10435";
  expect(getStoryVoiceUrl({ cueName: cue, cueSheetName: sheet, scriptName: "unused", soundId: 1 }))
    .toBe(`${assetConfig.releaseSource}/Cri/Sound/${sheet}/${cue}__00044.m4a`);
  expect(resolveReleaseAudioPath("Bgm")).toBeUndefined();
  expect(resolveReleaseAudioPath(sheet, "missing")).toBeUndefined();
});

test("assets missing from the release index get no URL instead of a test-server path", () => {
  expect(getAssetUrl({ path: "Cri/Sound/MusicScore/A_AveMujica.wav" })).toBe("");
  expect(getStoryScriptTableUrl("unknown", "Text")).toBe("");
  expect(getStoryBackgroundUrl("adv_bkg_stage_000001")).toBeUndefined();
  expect(getStoryBgmUrl("sound_bgm_adv_not_exported")).toBeUndefined();
});

test("songs resolve through the release audio index by cue sheet and cue", () => {
  expect(getMusicAudioUrl({ id: 1, cueSheetName: "sound_bgm_adv_cafe_time", cueName: "sound_bgm_adv_cafe_time" })).toStartWith(`${assetConfig.releaseSource}/Cri/Sound/sound_bgm_adv_cafe_time/`);
  expect(getMusicAudioUrl({ id: 2, cueSheetName: "A_Abracadabra", cueName: "A_Abracadabra" })).toBeUndefined();
  expect(getMusicAudioUrl(undefined)).toBeUndefined();
});

import { expect, test } from "bun:test";
import { getAssetUrl, getAssetFallbackUrls } from "../src/lib/assets/url";
import { resolveReleaseAssetPath } from "../src/lib/assets/release-path";
import { resolveReleaseAudioPath } from "../src/lib/story/release-audio";
import { getStoryVoiceUrl, getStoryScriptTableUrl } from "../src/lib/story/assets";
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

test("unknown assets stay on legacy storage and backups retain their original layout", () => {
  const path = "Cri/Sound/MusicScore/A_AveMujica.wav";
  expect(getAssetUrl({ path })).toBe(`${assetConfig.sources.main}/${path}`);
  const request = { path: "Character/Image/11/character_face_icon.png" };
  expect(getAssetFallbackUrls(request)).toEqual([
    getAssetUrl(request), `${assetConfig.sources.main}/${request.path}`, `${assetConfig.sources.backup}/${request.path}`,
  ]);
  expect(getAssetUrl({ ...request, source: "backup" })).toBe(`${assetConfig.sources.backup}/${request.path}`);
});

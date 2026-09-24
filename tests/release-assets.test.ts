import { expect, test } from "bun:test";
import imageFiles from "../src/lib/assets/generated/images.json";
import audioExports from "../src/lib/assets/generated/audio.json";
import storyTables from "../src/lib/assets/generated/stories.json";
import { getAssetFileName, getAssetUrl, getImageAssetUrl } from "../src/lib/assets/url";
import { releaseExportUrl, releaseFileUrl } from "../src/lib/assets/release";
import { loadReleaseAudio } from "../src/lib/story/release-audio";
import { getStoryBackgroundUrl, getStoryBgmUrl, getStoryScriptTableUrl, loadStoryAudio } from "../src/lib/story/assets";
import { getMusicAudioUrl } from "../src/lib/music/data";
import { assetConfig } from "../src/config/assets";

const images: Record<string, string | Record<string, string>> = imageFiles;
const audio: Record<string, string> = audioExports;
const stories: Record<string, Record<string, string>> = storyTables;

function manifestFetcher(files: Array<{ id: string; label: string; media_type?: string; sha256?: string }>) {
  const requests: string[] = [];
  const fetcher = (async (input: string | URL | Request) => {
    requests.push(String(input));
    const manifest = { files: files.map((file) => ({ media_type: "audio/mp4", sha256: file.id, ...file })) };
    return new Response(JSON.stringify(manifest), { headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  return { fetcher, requests };
}

test("release files are served by ID from the asset service", () => {
  expect(getAssetUrl({ path: "Character/Image/11/character_face_icon.png" }))
    .toBe(`${assetConfig.api}/files/${images["Character/Image/11/character_face_icon"]}`);
});

test("card textures use their named output rather than a crop or a fixed index", () => {
  expect(getAssetUrl({ path: "MemberCard/1/member_full_atlas.png" })).toBe(releaseFileUrl(images["MemberCard/1/member_full"] as string));
  expect(getAssetUrl({ path: "MemberCard/60/member_character_atlas.png" })).toBe(getAssetUrl({ path: "MemberCard/60/member_character.png" }));
});

test("lettered artwork follows the locale's language chain", () => {
  const logo = images["Band/3/band_logo"] as Record<string, string>;
  expect(getImageAssetUrl("Band/3/band_logo", "ja-JP")).toBe(releaseFileUrl(logo.ja!));
  expect(getImageAssetUrl("Band/3/band_logo", "zh-CN")).toBe(releaseFileUrl(logo["zh-Hans"]!));
  expect(getImageAssetUrl("Band/3/band_logo", "zh-TW")).toBe(releaseFileUrl(logo["zh-Hant"]!));
  expect(getImageAssetUrl("Band/3/band_logo", "ko-KR")).toBe(releaseFileUrl(logo.ko!));
  // UI-only locales read English, like masterdata text.
  expect(getImageAssetUrl("Band/3/band_logo", "fr-FR")).toBe(releaseFileUrl(logo.en!));
  // Content shared by every language has one URL.
  expect(getImageAssetUrl("Item/common/item_icon_star", "ja-JP")).toBe(getImageAssetUrl("Item/common/item_icon_star", "en-US"));
});

test("downloads get a readable WebP name instead of the file ID", () => {
  expect(getAssetFileName(getImageAssetUrl("Band/3/band_logo", "en-US"))).toBe("band_logo.webp");
  expect(getAssetFileName(getAssetUrl({ path: "MemberCard/1/member_full_atlas.png" }))).toBe("member_full.webp");
  expect(getAssetFileName("https://example.invalid/files/x")).toBeUndefined();
});

test("story tables use the published JSON files", () => {
  const name = "adv_script_mygo_001_1_01";
  expect(getStoryScriptTableUrl(name, "Text")).toBe(releaseFileUrl(stories[name]!.Text!));
  expect(getStoryScriptTableUrl("unknown", "Text")).toBe("");
  expect(getAssetUrl({ path: `Adv/Episode/${name}/${name}-Text.txt` })).toBe("");
});

test("audio is selected by sheet and exact cue from the export manifest", async () => {
  const sheet = "adv_voice_anotherstory_10435";
  const { fetcher, requests } = manifestFetcher([
    { id: "a1", label: `${sheet}_001` },
    { id: "b1", label: "duplicate", sha256: "one" },
    { id: "b2", label: "duplicate", sha256: "two" },
    { id: "c1", label: "not-audio", media_type: "image/webp" },
  ]);
  const release = await loadReleaseAudio([sheet, sheet, "Bgm_not_exported"], "zh-CN", fetcher);
  expect(requests).toEqual([releaseExportUrl(audio[`Cri/Sound/${sheet}`]!)]);
  expect(release.url(sheet, `${sheet}_001`)).toBe(releaseFileUrl("a1"));
  // Labels with conflicting content are ambiguous, not guessed.
  expect(release.url(sheet, "duplicate")).toBeUndefined();
  expect(release.url(sheet, "not-audio")).toBeUndefined();
  expect(release.url(sheet, "missing")).toBeUndefined();
  // Without a cue, a sheet's only unambiguous file is used.
  expect(release.url(sheet)).toBe(releaseFileUrl("a1"));
  expect(release.url("Bgm_not_exported")).toBeUndefined();
});

test("story background music without a cue uses the cue named after its sheet", async () => {
  const sheet = "sound_bgm_adv_cafe_time";
  const { fetcher } = manifestFetcher([{ id: "intro", label: "intro" }, { id: "main", label: sheet }]);
  const release = await loadStoryAudio([` ${sheet} `], "en-US", fetcher);
  expect(getStoryBgmUrl(release, sheet)).toBe(releaseFileUrl("main"));
});

test("assets missing from the release index get no URL", () => {
  expect(getAssetUrl({ path: "Cri/Sound/MusicScore/A_AveMujica.wav" })).toBe("");
  expect(getStoryBackgroundUrl("adv_bkg_stage_000001")).toBeUndefined();
  expect(getImageAssetUrl("constructor", "en-US")).toBe("");
});

test("songs resolve through the release audio by cue sheet and cue", async () => {
  const sheet = "A_Abracadabra_short";
  const { fetcher } = manifestFetcher([{ id: "song", label: sheet }]);
  const release = await loadReleaseAudio([sheet, "A_Abracadabra"], "ja-JP", fetcher);
  expect(getMusicAudioUrl(release, { id: 1, cueSheetName: sheet, cueName: sheet })).toBe(releaseFileUrl("song"));
  // Only short versions are exported so far.
  expect(getMusicAudioUrl(release, { id: 2, cueSheetName: "A_Abracadabra", cueName: "A_Abracadabra" })).toBeUndefined();
  expect(getMusicAudioUrl(release, undefined)).toBeUndefined();
});

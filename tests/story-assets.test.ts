import { describe, expect, test } from "bun:test";
import { releaseFileUrl } from "../src/lib/assets/release";
import { getStoryVoiceUrl, loadStoryAudio } from "../src/lib/story/assets";
import { classifyAdv, type RawAdv } from "../src/lib/story/data";

const voiceManifest = (async () => new Response(JSON.stringify({
  files: [{ id: "voice-file", label: "adv_voice_linkstory_anon_rana_10471_001", media_type: "audio/mp4", sha256: "x" }],
}))) as unknown as typeof fetch;

describe("release story voices", () => {
  test("link-story voices resolve by their exported cue sheet and exact cue", async () => {
    const sheet = "adv_voice_linkstory_anon_rana_10471";
    const audio = await loadStoryAudio([sheet], "zh-CN", voiceManifest);
    expect(getStoryVoiceUrl(audio, { scriptName: "unused", cueSheetName: sheet, cueName: `${sheet}_001`, soundId: 1 }))
      .toBe(releaseFileUrl("voice-file"));
  });

  test("voices missing from the export resolve to nothing rather than a legacy WAV path", async () => {
    const sheet = "adv_voice_linkstory_tomori_anon_1";
    const audio = await loadStoryAudio([sheet], "zh-CN", voiceManifest);
    expect(getStoryVoiceUrl(audio, { scriptName: "unused", cueSheetName: sheet, cueName: "voice_001", soundId: 1 }))
      .toBeUndefined();
  });

  test.each(["mygo", "mujica", "yumemita", "millsage", "kadan"])("recognizes %s main stories", (band) => {
    expect(classifyAdv({ advEpisodeAsset: `adv_script_${band}_003_1_01` } as RawAdv)).toBe("main");
  });

  test("keeps link stories distinct from main stories", () => {
    expect(classifyAdv({ advEpisodeAsset: "adv_script_arale_nonoka_linkstory_1" } as RawAdv)).toBe("friendship");
    expect(classifyAdv({ advEpisodeAsset: "adv_script_unknown_001" } as RawAdv)).toBeNull();
  });
});

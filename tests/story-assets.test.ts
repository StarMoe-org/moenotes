import { describe, expect, test } from "bun:test";
import { getStoryVoiceUrl } from "../src/lib/story/assets";
import { classifyAdv, type RawAdv } from "../src/lib/story/data";

describe("release story voices", () => {
  test("link-story voices resolve by their exported cue sheet and exact cue", () => {
    const sheet = "adv_voice_linkstory_anon_rana_10471";
    expect(getStoryVoiceUrl({ scriptName: "unused", cueSheetName: sheet, cueName: `${sheet}_001`, soundId: 1 }))
      .toEndWith(`/Cri/Sound/${sheet}/${sheet}_001__00000.m4a`);
  });

  test("voices missing from the export resolve to nothing rather than a legacy WAV path", () => {
    expect(getStoryVoiceUrl({ scriptName: "unused", cueSheetName: "adv_voice_linkstory_tomori_anon_1", cueName: "voice_001", soundId: 1 }))
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

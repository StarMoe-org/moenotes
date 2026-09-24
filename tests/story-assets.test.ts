import { describe, expect, test } from "bun:test";
import { getStoryVoiceUrl } from "../src/lib/story/assets";
import { classifyAdv, type RawAdv } from "../src/lib/story/data";

describe("release story asset names", () => {
  test.each([
    ["tomori", "anon", "001_002"],
    ["uika", "sakiko", "006_010"],
    ["arale", "nonoka", "011_012"],
    ["arare", "ritsu", "011_013"],
    ["miyako", "yuno", "014_015"],
    ["hotaru", "natsume", "016_017"],
    ["nagi", "mahoro", "018_019"],
    ["houka", "raika", "020_021"],
    ["miku", "yomogi", "022_023"],
    ["chieri", "shizuku", "024_025"],
  ])("resolves %s / %s to %s", (first, second, directory) => {
    const sheet = `adv_voice_linkstory_${first}_${second}_1`;
    expect(getStoryVoiceUrl({ scriptName: "unused", cueSheetName: sheet, cueName: "voice_001", soundId: 1 }))
      .toEndWith(`/Cri/Sound/Adv/Voice/Linkstory/${directory}/${sheet}/voice_000.wav`);
  });

  test("skips unresolved link-story characters", () => {
    expect(getStoryVoiceUrl({ scriptName: "unused", cueSheetName: "adv_voice_linkstory_unknown_anon_1", cueName: "voice_001", soundId: 1 }))
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

import { describe, expect, test } from "bun:test";
import { assetConfig } from "../src/config/assets";
import { getVoiceAudioUrl } from "../src/lib/assets/voice";
import {
  costumeCharacterId,
  costumeGroupId,
  normalizeCharacterCostumes,
  type RawCharacterCostume,
  type RawCharacterCostumeGroup,
} from "../src/lib/characters/data";

describe("character voice audio", () => {
  test("a voice line resolves to its exact cue inside the cue sheet, not to the sheet name", () => {
    // ja/Cri/Sound/VoiceSystem_01/VoiceSystem_01.m4a answers 404; the cue-named file is the one the service publishes.
    expect(getVoiceAudioUrl(1, "Growth_Tomori_SpecialTraining_01", "VoiceSystem_01", "ja-JP"))
      .toBe(`${assetConfig.api}/ja/Cri/Sound/VoiceSystem_01/Growth_Tomori_SpecialTraining_01.m4a`);
  });
});

describe("character costumes", () => {
  // MasterCharacterCostume / MasterCharacterCostumeGroup rows as validateMasterTable leaves them: capital `ID` keys.
  const costumes = [
    { id: 1001, characterID: 1, groupID: 1, costumeType: 2, costumeId: 1, isDefault: false, live2dPath: "001_adv/model_a" },
    { id: 1002, characterID: 1, groupID: 2, costumeType: 2, costumeId: 2, isDefault: true, live2dPath: "001_adv/model_b" },
    { id: 2001, characterID: 2, groupID: 3, costumeType: 2, costumeId: 1, isDefault: false, live2dPath: "002_adv/model_a" },
  ] satisfies RawCharacterCostume[];
  const groups = [
    { id: 1, characterID: 1, costumeNameTextId: "Costume_Name_1", iconPath: "Character/costume/1/icon_a", isInitial: true, isChangeable: false, specialConditionMemberCardId: 0, startAt: "" },
    { id: 2, characterID: 1, costumeNameTextId: "", iconPath: "", isInitial: false, isChangeable: true, specialConditionMemberCardId: 0, startAt: "" },
    { id: 3, characterID: 2, costumeNameTextId: "", iconPath: "", isInitial: true, isChangeable: false, specialConditionMemberCardId: 0, startAt: "" },
  ] satisfies RawCharacterCostumeGroup[];

  test("reads the character and group from either key spelling", () => {
    expect(costumeCharacterId({ characterID: 7 })).toBe(7);
    expect(costumeCharacterId({ characterId: 8 })).toBe(8);
    expect(costumeCharacterId({})).toBe(0);
    expect(costumeGroupId({ groupID: 3 })).toBe(3);
    expect(costumeGroupId({ groupId: 4 })).toBe(4);
  });

  test("a character's costumes are found by the capital-ID keys and joined to their groups", () => {
    const own = costumes.filter((row) => costumeCharacterId(row) === 1);
    const ownGroups = groups.filter((row) => costumeCharacterId(row) === 1);
    expect(own).toHaveLength(2);
    const texts = [{ id: "Costume_Name_1", japanese: "制服", english: "Uniform", simplifiedChinese: "制服", traditionalChinese: "制服", korean: "교복" }];
    const normalized = normalizeCharacterCostumes(own, ownGroups, texts, "en-US");
    expect(normalized.map((costume) => [costume.id, costume.groupId, costume.name, costume.iconPath, costume.isInitial])).toEqual([
      [1001, 1, "Uniform", "Character/costume/1/icon_a", true],
      [1002, 2, "", "", false],
    ]);
  });
});

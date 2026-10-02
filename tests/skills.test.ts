import { describe, expect, it } from "bun:test";
import {
  formatSkillDescription,
  type RawSkillCondition,
  type RawSkillConditionSet,
  type RawSkillCumulativeCondition,
  type RawSkillEffect,
  type RawSkillTarget,
} from "@/lib/cards/skills";
import type { RawBand, RawCharacter } from "@/lib/cards/data";

describe("skill description formatting", () => {
  const dummyEffect: RawSkillEffect = {
    id: 1,
    level: 1,
    activationTimeSecond: 5,
    effectValue: 1250,
    maxEffectValue: 2000,
    skillEffectType: 1000,
    skillConditionGroup: 10,
    skillTriggerConditionGroup: 20,
    skillCumulativeConditionID: 30,
    effectLimitCount: 3,
    effectExecuteLimitCount: 4,
    skillTargetIDs: [101],
  };

  const dummyEffect2: RawSkillEffect = {
    id: 2,
    level: 1,
    activationTimeSecond: 0,
    effectValue: 8000,
    skillEffectType: 2000,
    skillConditionGroup: 11,
    effectLimitCount: 1,
    effectExecuteLimitCount: 2,
    skillTargetIDs: [],
  };

  const conditionSets: RawSkillConditionSet[] = [
    { id: 1, group: 10, conditionIds: [100, 101] },
    { id: 2, group: 11, conditionIds: [102, 103] },
    { id: 3, group: 20, conditionIds: [200, 201] },
  ];

  const conditions: RawSkillCondition[] = [
    { id: 100, conditionValues: [15, 30] },
    { id: 101, conditionValues: [700] },
    { id: 102, conditionValues: [50], conditionTargetIDs: [1] }, // points to char target
    { id: 103, conditionValues: [80], conditionTargetIDs: [2] }, // points to band target
    { id: 200, conditionValues: [25] },
    { id: 201, conditionValues: [10] },
  ];

  const cumulativeConditions: RawSkillCumulativeCondition[] = [
    { id: 30, conditionValues: [100], maxCumulativeCount: 5 },
  ];

  const skillTargets: RawSkillTarget[] = [
    { id: 1, characterID: 10, bandID: 0 },
    { id: 2, characterID: 0, bandID: 5 },
  ];

  const characters = new Map<number, RawCharacter>([
    [10, { id: 10, bandID: 5, displayOrder: 1, nameTextID: "Char_10", enDisplayNameTextId: "", mainColorCode: "#fff" }],
  ]);

  const bands = new Map<number, RawBand>([
    [5, { id: 5, nameTextID: "Band_5", mainColorCode: "#fff" }],
  ]);

  const texts: Record<string, string> = {
    Char_10: "高松 燈",
    Band_5: "MyGO!!!!!",
  };
  const resolveText = (id: string) => texts[id] ?? id;

  it("formats basic time and effect values with fractions", () => {
    const template = "{effects[0].time:F1}秒間 スコア<color=#66FF8C>{effects[0].value/100:F1}%UP</color>";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("5.0秒間 スコア12.5%UP");
  });

  it("formats integer values and division by 1000", () => {
    const template = "提升{effects[0].value}点 / {effects[0].value/1000:F2}";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("提升1250点 / 1.25");
  });

  it("formats limitCount and EffectExecuteLimitCount", () => {
    const template = "次数：{effects[0].limitCount}回、最大{effects[0].EffectExecuteLimitCount}回";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("次数：3回、最大4回");
  });

  it("formats conditions (con) with double and single indexing and multiplier math", () => {
    const template = "值1={effects[0].con[0][0].values[0]} 值2={effects[0].con[0].values1[0]} 乘法={effects[0].con[0][0].values[0]*10:F1}";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("值1=15 值2=15 乘法=150.0");
  });

  it("formats trigger conditions (tCon)", () => {
    const template = "达成{effects[0].tCon[0][1].values[0]}回, 触发{effects[0].tCon[0].values1[0]}";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("达成10回, 触发25");
  });

  it("formats cumulative conditions with whitespace tolerance", () => {
    const template = "累计{effects[0]. cCon. values [0]}回，最大{effects[0].cCon.maxCount}次";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("累计100回，最大5次");
  });

  it("resolves target names for character and band", () => {
    const template = "若为「{effects[1].con[0][0].targets[0].name}」成员或「{effects[1].con[0][1].targets[0].name}」成员";
    const result = formatSkillDescription(
      template,
      [dummyEffect, dummyEffect2],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("若为「高松 燈」成员或「MyGO!!!!!」成员");
  });

  it("evaluates ternaries with time > 0 and time = 0", () => {
    const tpl1 = '{0 < effects[0].time ? "COMBO激奏开始后" : ""}';
    const tpl2 = '{0 < effects[0].time ? effects[0].time ~ "秒内" : "COMBO激奏期间"}';
    const tpl3 = '{0 <effects[0].time ? "for " ~ effects[0].time ~ " sec." : "During COMBO GEKISO"}';

    // With positive time (dummyEffect.activationTimeSecond = 5)
    expect(formatSkillDescription(tpl1, [dummyEffect], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("COMBO激奏开始后");
    expect(formatSkillDescription(tpl2, [dummyEffect], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("5秒内");
    expect(formatSkillDescription(tpl3, [dummyEffect], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("for 5 sec.");

    // With zero time (dummyEffect2.activationTimeSecond = 0)
    expect(formatSkillDescription(tpl1, [dummyEffect2], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("");
    expect(formatSkillDescription(tpl2, [dummyEffect2], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("COMBO激奏期间");
    expect(formatSkillDescription(tpl3, [dummyEffect2], conditionSets, conditions, cumulativeConditions, skillTargets, characters, bands, resolveText)).toBe("During COMBO GEKISO");
  });

  it("converts escaped newlines and removes color tags", () => {
    const template = "Line 1\\n<color=#FF0000>Line 2</color>\\nLine 3";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("Line 1\nLine 2\nLine 3");
  });

  it("returns empty string if unresolved effect tokens remain", () => {
    const template = "未知占位符 {effects[99].nonexistent}";
    const result = formatSkillDescription(
      template,
      [dummyEffect],
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      characters,
      bands,
      resolveText,
    );
    expect(result).toBe("");
  });
});

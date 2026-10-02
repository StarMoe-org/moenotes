import { expect, test } from "bun:test";
import { normalizeSupportSkill, type RawSupportSkillEffect } from "../src/lib/support-cards/skills";
import type { RawBand, RawCharacter, RawText } from "../src/lib/cards/data";

const texts = [
  { id: "name", english: "Conditional support" },
  { id: "desc", english: "If {effects[0].con[0][0].targets[0].name}, give {effects[0].value/100:F0}% to {effects[0].targets[0].name}" },
  { id: "character", english: "Mutsumi" }, { id: "band", english: "Ave Mujica" },
] as RawText[];
const definitions = [{ id: 31, nameTextID: "name", descriptionTextFormatID: "desc", skillIconID: 0 }];
const effects: RawSupportSkillEffect[] = [1, 2].map((level) => ({ id: level, supportSkillID: 31, level, effectValue: level * 1000, skillEffectType: 2000, skillConditionGroup: 5, skillTargetIDs: [14] }));
const conditions = [{ id: 3, conditionValues: [], conditionTargetIDs: [11] }];
const sets = [{ id: 8, group: 5, conditionIds: [3] }];

test("support descriptions resolve separate condition and effect targets at the selected level", () => {
  const characterMap = new Map([[3, { id: 3, nameTextID: "character" } as RawCharacter]]);
  const bandMap = new Map([[7, { id: 7, nameTextID: "band" } as RawBand]]);
  const targets = [{ id: 11, bandID: 7 }, { id: 14, characterID: 3 }];
  const skill = normalizeSupportSkill("support", 31, definitions, effects, [], texts, "en-US", sets, conditions, [], characterMap, bandMap, targets)!;
  expect(skill.levels.map((level) => level.description)).toEqual(["If Ave Mujica, give 10% to Mutsumi", "If Ave Mujica, give 20% to Mutsumi"]);
});

test("an unresolved predicate omits the description instead of inventing an unconditional effect", () => {
  const characterMap = new Map([[3, { id: 3, nameTextID: "character" } as RawCharacter]]);
  const skill = normalizeSupportSkill("support", 31, definitions, effects, [], texts, "en-US", sets, conditions, [], characterMap, new Map(), [{ id: 14, characterID: 3 }])!;
  expect(skill.levels.every((level) => level.description === "")).toBe(true);
});

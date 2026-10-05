import { expect, test } from "bun:test";
import { createBox, createCard, answerField } from "../src/lib/box/model";
import { answerDeckFields } from "../src/lib/box/deck-answers";

function fixture() {
  const box = createBox("jp", "skill-input-test", 1);
  box.cards = [createCard("member", "first", "1", 1), createCard("member", "other", "2", 1)];
  return box;
}
test("an ordinary answer leaves unknown Gekisou unknown unless explicitly linked", () => {
  const box = fixture(), answer = answerDeckFields(box, ["first"], "liveSkillLevel", 2, {}, 2);
  expect(answer.cards[0]!.fields.liveSkillLevel.value).toBe(2);
  expect(answer.cards[0]!.fields.liveSkillLevel.history.at(-1)!.source).toBe("deck-answer");
  expect(answer.cards[0]!.fields.gekisouSkillLevel).toEqual(box.cards[0]!.fields.gekisouSkillLevel);
  expect(answer.cards[1]).toEqual(box.cards[1]);
  expect(answer.player).toEqual(box.player);
});
test("explicit linking synchronizes either skill while preserving independent evidence histories", () => {
  const box = fixture();
  box.cards[0]!.fields.liveSkillLevel = answerField(box.cards[0]!.fields.liveSkillLevel, { id: "ordinary-old", value: 1, source: "manual", at: 1 });
  box.cards[0]!.fields.gekisouSkillLevel = answerField(box.cards[0]!.fields.gekisouSkillLevel, { id: "gekisou-old", value: 4, source: "manual", at: 1 });
  const reverse = answerDeckFields(box, ["first"], "gekisouSkillLevel", 3, { first: true }, 2);
  expect(reverse.cards[0]!.fields.liveSkillLevel.value).toBe(3);
  expect(reverse.cards[0]!.fields.gekisouSkillLevel.value).toBe(3);
  expect(reverse.cards[0]!.fields.liveSkillLevel.history[0]!.id).toBe("ordinary-old");
  expect(reverse.cards[0]!.fields.gekisouSkillLevel.history[0]!.id).toBe("gekisou-old");
  expect(reverse.cards[0]!.fields.liveSkillLevel.history.at(-1)!.id).not.toBe(reverse.cards[0]!.fields.gekisouSkillLevel.history.at(-1)!.id);
  const forward = answerDeckFields(reverse, ["first"], "liveSkillLevel", 5, { first: true }, 3);
  expect(forward.cards[0]!.fields.gekisouSkillLevel.value).toBe(5);
});
test("unlinked clears are independent and linked clears do not revive old answers", () => {
  const paired = answerDeckFields(fixture(), ["first"], "liveSkillLevel", 2, { first: true }, 2);
  const separate = answerDeckFields(paired, ["first"], "gekisouSkillLevel", null, {}, 3);
  expect(separate.cards[0]!.fields.liveSkillLevel.value).toBe(2);
  expect(separate.cards[0]!.fields.gekisouSkillLevel.value).toBeNull();
  const clearBoth = answerDeckFields(paired, ["first"], "gekisouSkillLevel", null, { first: true }, 4);
  expect(clearBoth.cards[0]!.fields.liveSkillLevel.value).toBeNull();
  expect(clearBoth.cards[0]!.fields.gekisouSkillLevel.value).toBeNull();
  expect(clearBoth.cards[0]!.fields.liveSkillLevel.history).toHaveLength(2);
  expect(clearBoth.cards[0]!.fields.gekisouSkillLevel.history).toHaveLength(2);
});

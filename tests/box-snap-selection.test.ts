import { expect, test } from "bun:test";
import { createBox, createCard, answerField, unknownField } from "../src/lib/box/model";
import { ownedSnapChoices } from "../src/lib/box/snap-selection";
import type { SnapSkillChoice } from "../src/lib/chart-data/snap-types";

test("the shared Snap filter uses actual known rank bindings and never promotes unknown rank to Lv5", () => {
  const box = createBox("jp", "local");
  const known = createCard("snap", "known", "11"), unknown = createCard("snap", "unknown", "12");
  known.fields.rank = answerField(unknownField(), { id: "rank", value: 2, source: "manual", at: 1 });
  box.cards = [known, unknown];
  const choice = (level: number, ranks: [number, number][]): SnapSkillChoice => ({ key: `support:1:${level}`, kind: "support", skillId: 1, level,
    cardIds: ranks.map(([cardId]) => cardId), rankBindings: ranks.map(([cardId, rank]) => ({ cardId, rank, binding: 1 })),
    name: "Synthetic", description: "", searchTerms: [], effectTypes: [], requirements: [], status: "supported" });
  const input = [choice(1, [[11, 1]]), choice(2, [[11, 2], [12, 2]]), choice(5, [[11, 5], [12, 5]])];
  const selected = ownedSnapChoices(input, box);
  expect(selected).toHaveLength(1); expect(selected[0]!.level).toBe(2);
  expect(selected[0]!.cardIds).toEqual([11]); expect(input[1]!.rankBindings).toHaveLength(2);
  expect(box.cards).toHaveLength(2); expect(box.cards[1]!.fields.rank.value).toBeNull();
});

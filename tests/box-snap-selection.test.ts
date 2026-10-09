import { expect, test } from "bun:test";
import { createBox, createCard, answerField, unknownField } from "../src/lib/box/model";
import { gameSaveBoxView, parseGameSave } from "../src/lib/box/game-save";
import { ownedSnapChoices } from "../src/lib/box/snap-selection";
import type { SnapSkillChoice } from "../src/lib/chart-data/snap-types";

const choice = (level: number, ranks: [number, number][]): SnapSkillChoice => ({ key: `support:1:${level}`, kind: "support", skillId: 1, level,
  cardIds: ranks.map(([cardId]) => cardId), rankBindings: ranks.map(([cardId, rank]) => ({ cardId, rank, binding: 1 })),
  name: "Synthetic", description: "", searchTerms: [], effectTypes: [], requirements: [], status: "supported" });

test("the shared Snap filter uses actual known rank bindings and never promotes unknown rank to Lv5", () => {
  const box = createBox("jp", "local");
  const known = createCard("snap", "known", "11"), unknown = createCard("snap", "unknown", "12");
  known.fields.rank = answerField(unknownField(), { id: "rank", value: 2, source: "manual", at: 1 });
  box.cards = [known, unknown];
  const input = [choice(1, [[11, 1]]), choice(2, [[11, 2], [12, 2]]), choice(5, [[11, 5], [12, 5]])];
  const selected = ownedSnapChoices(input, box);
  expect(selected).toHaveLength(1); expect(selected[0]!.level).toBe(2);
  expect(selected[0]!.cardIds).toEqual([11]); expect(input[1]!.rankBindings).toHaveLength(2);
  expect(box.cards).toHaveLength(2); expect(box.cards[1]!.fields.rank.value).toBeNull();
});

test("a Box linked to a game save is filtered with the save's cards, and with no cards until the save is read", () => {
  const stored = createBox("tw", "linked");
  const own = createCard("snap", "own", "12");
  own.fields.rank = answerField(unknownField(), { id: "rank", value: 2, source: "manual", at: 1 });
  stored.cards = [own];
  stored.save = { server: "intl", accountId: "20000000001", sha256: "a".repeat(64), uploadedAt: 1_700_000_000_000 };
  const save = parseGameSave(JSON.stringify({ _memberCards: [{ _masterId: 101, _rank: 1 }], _supportCards: [{ _masterId: 11, _rank: 2 }] }));
  const input = [choice(2, [[11, 2], [12, 2]]), choice(5, [[11, 5]])];

  const { box, derivation } = gameSaveBoxView(stored, save, null, null);
  expect(box!.cards.map(card => [card.kind, card.identity.value, card.fields.rank.value])).toEqual([["member", "101", 1], ["snap", "11", 2]]);
  expect(derivation!.box).toBe(box!);
  expect(ownedSnapChoices(input, box!).map(value => [value.level, value.cardIds])).toEqual([[2, [11]]]);

  const unread = gameSaveBoxView(stored, null, null, null);
  expect(unread.box!.cards).toEqual([]); expect(unread.derivation).toBeNull();
  expect(ownedSnapChoices(input, unread.box!)).toEqual([]);

  const unlinked = { ...stored, save: null };
  expect(gameSaveBoxView(unlinked, save, null, null)).toEqual({ box: unlinked, derivation: null });
  expect(gameSaveBoxView(null, save, null, null)).toEqual({ box: null, derivation: null });
  expect(stored.cards).toEqual([own]);
});

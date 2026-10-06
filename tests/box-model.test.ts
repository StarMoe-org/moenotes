import { describe, expect, test } from "bun:test";
import { answerField, createBox, createCard, mergeBoxes, mergeField, observeField, parseBox, unknownField, type Observation } from "../src/lib/box/model";

const observed = (id: string, value: number, at: number): Observation<number> => ({ id, value, at, source: "screenshot", screenshot: { sourceId: `image-${id}`, bbox: [10, 20, 30, 40] } });
const manual = (id: string, value: number | null, at: number): Observation<number> => ({ id, value, at, source: "deck-answer" });

describe("card box field lifecycle", () => {
  test("later observations update observed values and retain their sources", () => {
    const first = observeField(unknownField<number>(), observed("first", 20, 100));
    const later = observeField(first, observed("later", 30, 200));
    expect(later.status).toBe("observed"); expect(later.value).toBe(30); expect(later.history).toHaveLength(2);
    expect(first.value).toBe(20);
    expect(observeField(later, observed("older", 10, 50)).value).toBe(30);
  });
  test("conflicting observations in one batch need a decision, never max-value selection", () => {
    const first = observeField(unknownField<number>(), observed("a", 40, 100));
    const conflict = observeField(first, observed("b", 60, 100));
    expect(conflict.status).toBe("conflict"); expect(conflict.value).toBeNull();
    const fixed = answerField(conflict, manual("answer", 40, 200));
    expect(fixed.status).toBe("manual"); expect(fixed.value).toBe(40); expect(fixed.history).toHaveLength(3);
  });
  test("screenshots cannot replace manual answers and two manual branches conflict", () => {
    const known = answerField(unknownField<number>(), manual("manual", 2, 1));
    const updated = observeField(known, observed("photo", 5, 10));
    expect(updated.status).toBe("manual"); expect(updated.value).toBe(2); expect(updated.needsReview).toBe(true);
    const other = answerField(unknownField<number>(), manual("other-device", 4, 20));
    expect(mergeField(updated, other)).toMatchObject({ status: "conflict", value: null });
    const cleared = answerField(updated, manual("clear", null, 30));
    expect(cleared).toMatchObject({ status: "unknown", value: null });
    expect(cleared.history).toHaveLength(3);
  });
  test("evidence deduplicates by identity and detects reused IDs with different data", () => {
    const source = observed("same", 5, 1);
    const field = observeField(unknownField<number>(), source);
    expect(observeField(field, { source: source.source, at: source.at, value: source.value, id: source.id, screenshot: source.screenshot! }).history).toHaveLength(1);
    expect(() => observeField(field, observed("same", 4, 1))).toThrow("identity collision");
  });
  test("explicit clearing and conflict resolution dominate their stale snapshots", () => {
    const old = answerField(unknownField<number>(), manual("original", 2, 10));
    const cleared = answerField(old, manual("clear", null, 20));
    expect(mergeField(cleared, old)).toMatchObject({ status: "unknown", value: null });
    expect(mergeField(old, cleared)).toMatchObject({ status: "unknown", value: null });
    expect(mergeField(cleared, observeField(unknownField(), observed("old-photo", 4, 15)))).toMatchObject({ status: "unknown", value: null });
    expect(observeField(cleared, observed("new-photo", 4, 30))).toMatchObject({ status: "observed", value: 4 });
    const independent = answerField(unknownField<number>(), manual("other-account", 3, 40));
    expect(mergeField(cleared, independent)).toMatchObject({ status: "conflict", value: null });
    const conflict = mergeField(old, independent);
    const resolved = answerField(conflict, manual("resolution", 3, 50));
    expect(mergeField(resolved, old)).toMatchObject({ status: "manual", value: 3 });
    expect(mergeField(conflict, resolved)).toMatchObject({ status: "manual", value: 3 });
  });
  test("an imported screenshot descendant cannot demote the manual value it retains in history", () => {
    const known = answerField(unknownField<number>(), manual("manual-source", 2, 10));
    const imported = { status: "observed" as const, value: 5, history: [...known.history, observed("new-photo", 5, 20)], needsReview: false };
    expect(mergeField(known, imported)).toMatchObject({ status: "manual", value: 2, needsReview: true });
    expect(mergeField(imported, known)).toMatchObject({ status: "manual", value: 2, needsReview: true });
  });
});

describe("shared card box facts", () => {
  test("complete furniture backups retain their coverage when merged with an empty furniture record", () => {
    for (const hasItems of [false, true]) {
      const backup = createBox("tw", "backup", 1);
      backup.player.bandItemsComplete = true;
      if (hasItems) {
        backup.player.bandItems["101"] = answerField(unknownField(), manual("level", 2, 1));
        backup.player.bandItemStates["101"] = answerField(unknownField(), { id: "ownership", value: "owned", source: "manual", at: 1 });
      }
      const restored = parseBox(JSON.stringify(backup));
      const target = createBox("tw", "target", 2);
      target.cards.push(createCard("member", "local-card", "1", 2));
      target.player.vipRank = answerField(unknownField(), manual("vip", 1, 2));
      for (const [a, b] of [[target, restored], [restored, target]] as const) {
        const merged = parseBox(JSON.stringify(mergeBoxes(a, b, 3)));
        expect(merged.player.bandItemsComplete).toBe(true);
        expect(merged.player.bandItems).toEqual(backup.player.bandItems);
        expect(merged.player.bandItemStates).toEqual(backup.player.bandItemStates);
        expect(merged.player.vipRank.value).toBe(1);
        expect(merged.player.memory.value).toBeNull();
      }
    }
  });
  test("partial furniture entries keep merged coverage partial, including unknown and cleared answers", () => {
    const complete = createBox("jp", "complete", 1);
    complete.player.bandItemsComplete = true;
    for (const field of [unknownField<number>(), answerField(unknownField<number>(), manual("clear-level", null, 2)), answerField(unknownField<number>(), manual("known-level", 2, 2))]) {
      const partial = createBox("jp", "partial", 2);
      partial.player.bandItems["101"] = field;
      expect(mergeBoxes(complete, partial).player.bandItemsComplete).toBe(false);
      expect(mergeBoxes(partial, complete).player.bandItemsComplete).toBe(false);
    }
    const ownership = createBox("jp", "ownership", 2);
    ownership.player.bandItemStates["101"] = unknownField();
    expect(mergeBoxes(complete, ownership).player.bandItemsComplete).toBe(false);
    expect(mergeBoxes(createBox("jp", "a"), createBox("jp", "b")).player.bandItemsComplete).toBe(false);
  });
  test("complete furniture records retain independent conflicting field evidence", () => {
    const a = createBox("jp", "a", 1), b = createBox("jp", "b", 2);
    a.player.bandItemsComplete = b.player.bandItemsComplete = true;
    a.player.bandItems["101"] = answerField(unknownField(), manual("a-level", 2, 1));
    b.player.bandItems["101"] = answerField(unknownField(), manual("b-level", 4, 2));
    expect(mergeBoxes(a, b).player).toMatchObject({ bandItemsComplete: true, bandItems: { "101": { status: "conflict", value: null, needsReview: true } } });
  });
  test("merges card identities while keeping manual conflicts and independent completeness", () => {
    const a = createBox("jp", "a", 1), b = createBox("jp", "b", 2);
    a.cards.push(createCard("member", "one", "1", 1)); b.cards.push(createCard("member", "two", "1", 2));
    a.cards[0]!.fields.liveSkillLevel = answerField(unknownField(), manual("a-skill", 2, 1));
    b.cards[0]!.fields.liveSkillLevel = answerField(unknownField(), manual("b-skill", 4, 2));
    a.coverage.member = { complete: true, declaredAt: 10 };
    b.coverage.member = { complete: false, declaredAt: 20 };
    const merged = mergeBoxes(a, b, 30);
    expect(merged.id).toBe("a"); expect(merged.cards).toHaveLength(1);
    expect(merged.cards[0]!.fields.liveSkillLevel).toMatchObject({ status: "conflict", value: null });
    expect(merged.coverage.member.complete).toBe(false);
    expect(a.cards[0]!.fields.liveSkillLevel.value).toBe(2);
    expect(parseBox(JSON.stringify(merged)).cards).toHaveLength(1);
  });
  test("identity corrections on one card become a conflict, not two owned cards", () => {
    const a = createBox("jp", "a", 1), b = createBox("jp", "b", 2);
    a.cards.push(createCard("member", "shared-key", "1", 1)); b.cards.push(createCard("member", "shared-key", "2", 2));
    const result = mergeBoxes(a, b);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]!.identity).toMatchObject({ status: "conflict", value: null });
    expect(result.cards[0]!.candidates).toEqual(["1", "2"]);
  });
  test("server separation and unknown skill/global fields survive export/import", () => {
    const box = createBox("jp", "local", 1);
    box.cards.push(createCard("member", "large-id", "9007199254740993", 1));
    const restored = parseBox(JSON.stringify(box));
    expect(restored.cards[0]!.identity.value).toBe("9007199254740993");
    expect(restored.cards[0]!.fields.liveSkillLevel.value).toBeNull();
    expect(restored.player.vipRank.value).toBeNull();
    expect(restored.player.memory.value).toBeNull();
    expect(() => mergeBoxes(box, createBox("tw", "other"))).toThrow("different servers");
  });
  test("imports reject unknown payloads, untraceable values and invalid cultivation", () => {
    const box = createBox("jp", "local", 1);
    box.cards.push(createCard("member", "one", "1", 1));
    expect(() => parseBox(JSON.stringify({ ...box, rawImage: "not part of the storage schema" }))).toThrow();
    const noEvidence = structuredClone(box);
    noEvidence.cards[0]!.identity.history = [];
    expect(() => parseBox(JSON.stringify(noEvidence))).toThrow("source evidence");
    for (const value of [0, 6, 1.5]) {
      const invalid = structuredClone(box);
      invalid.cards[0]!.fields.rank = answerField(unknownField(), manual("invalid", value, 2));
      expect(() => parseBox(JSON.stringify(invalid))).toThrow();
    }
    const snap = createCard("snap", "snap", "1", 1);
    snap.fields.liveSkillLevel = answerField(unknownField(), manual("not-derived", 3, 2));
    expect(() => parseBox(JSON.stringify({ ...box, cards: [snap] }))).toThrow("derived from rank");
  });
});

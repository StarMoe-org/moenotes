import { describe, expect, test } from "bun:test";
import { createBox, createCard } from "../src/lib/box/model";
import { createDeckPreview } from "../src/lib/box/deck-preview";

const catalogue = { members: [{ id: 1, characterId: 1 }, { id: 2, characterId: 2 }, { id: 3, characterId: 3 },
  { id: 4, characterId: 4 }, { id: 5, characterId: 5 }, { id: 6, characterId: 1 }], snaps: [{ id: 1 }, { id: 2 }] };
const fixture = () => ({ ...createBox("tw", "box"), cards: [6, 1, 2, 3, 4, 5].map(id => createCard("member", `m${id}`, String(id)))
  .concat([1, 2].map(id => createCard("snap", `s${id}`, String(id)))) });
describe("owned team preview", () => {
  test("uses the saved physical slots and preserves deliberately empty Snaps", () => {
    const box = { ...fixture(), baseline: { members: ["5", "4", "3", "2", "1"], snaps: ["2", null, "1", null, null] } };
    const before = structuredClone(box);
    const preview = createDeckPreview(box, catalogue, { excluded: ["m5"], required: ["m6"] });
    expect(preview.source).toBe("baseline");
    expect(preview.members.map(card => card?.identity.value)).toEqual(["5", "4", "3", "2", "1"]);
    expect(preview.snaps.map(card => card?.identity.value ?? null)).toEqual(["2", null, "1", null, null]);
    expect(box).toEqual(before);
  });
  test("does not display stale ownership or a repeated character as a saved team", () => {
    const box = { ...fixture(), baseline: { members: ["1", "6", "3", "4", "5"], snaps: [null, null, null, null, null] } };
    expect(createDeckPreview(box, catalogue).source).toBe("collection");
    box.baseline.members = ["1", "2", "3", "4", "5"];
    box.cards = box.cards.filter(card => card.key !== "m5");
    const preview = createDeckPreview(box, catalogue);
    expect(preview.source).toBe("collection");
    expect(preview.members.filter(Boolean)).toHaveLength(4);
  });
  test("collection preview respects explicit constraints and actual character identity", () => {
    const preview = createDeckPreview(fixture(), catalogue, { required: ["m1"], excluded: ["m2"] });
    expect(preview.members.map(card => card?.identity.value ?? null)).toEqual(["1", "3", "4", "5", null]);
    expect(preview.members[0]?.fields.level.value).toBeNull();
    expect(preview.members[0]?.fields.rank.value).toBeNull();
  });
  test("does not turn uncertain identities or missing region cards into owned slots", () => {
    const box = fixture(); box.cards[0]!.identity.needsReview = true;
    box.cards.push(createCard("member", "outside", "999"));
    box.cards.find(card => card.key === "s1")!.identity.status = "conflict";
    const preview = createDeckPreview(box, catalogue);
    expect(preview.members.map(card => card?.identity.value)).toEqual(["1", "2", "3", "4", "5"]);
    expect(preview.snaps.map(card => card?.identity.value ?? null)).toEqual(["2", null, null, null, null]);
    expect(createDeckPreview(null, catalogue).members).toEqual([null, null, null, null, null]);
  });
});

import { describe, expect, test } from "bun:test";
import { createSnapLegalityContext, resolveSnapSupportCardId, validateSnapFormation, validateSnapMemberReplacement, validateSnapSkillReplacement,
  type SnapLegalityState } from "../src/lib/chart-data/snap-legality";
import { groupSnapSkillCards } from "../src/lib/chart-data/snap-search";
import { parseSnapQuery, writeSnapQuery } from "../src/lib/chart-data/snap-query";
import type { SnapDeckData, SnapSkillChoice } from "../src/lib/chart-data/snap-types";

const choice = (id: number, level: number, cardIds: number[], extras: Partial<SnapSkillChoice> = {}): SnapSkillChoice => ({
  key: `support:${id}:${level}`, kind: "support", skillId: id, level, name: "Shared skill", description: "", searchTerms: [], cardIds,
  rankBindings: cardIds.map((cardId) => ({ cardId, rank: level, binding: 1 })), effectTypes: [2000], requirements: [], status: "supported", ...extras,
});
const choices = [choice(1, 1, [11, 12]), choice(1, 3, [11]), choice(7, 1, [13]), choice(7, 2, [13]),
  choice(8, 1, [14], { status: "unsupported" }), choice(2, 1, [11], { key: "gekisou-support:2:1", kind: "gekisou-support", status: "needs-context" })];
const data: SnapDeckData = { format: "nnnotes.deck-data/1", provenance: {}, charts: [], master: {
  MasterMemberCard: { columns: ["_id", "_characterID", "_gekisouSkillID"], rows: [[101, 1, 5], [102, 1, 5], [103, 2, 6]] },
  MasterGekisouSkillEffect: { columns: ["_gekisouSkillID", "_level"], rows: [[5, 1], [5, 3], [6, 2]] },
  MasterSupportCard: { columns: ["_id"], rows: [[11], [12], [13], [14]] },
} };
const ctx = createSnapLegalityContext(data, choices);
const blank = (): SnapLegalityState => ({ snapSkills: [null, null, null, null, null], snapMembers: [null, null, null, null, null] });

describe("same-source formation legality", () => {
  test("None remains allowed; member character identity rejects variants across physical slots", () => {
    const state = blank(); state.snapMembers = [{ memberId: 101, gekisouLevel: 3 }, null, null, null, null];
    expect(validateSnapMemberReplacement(state, ctx, 0, state.snapMembers[0]!)).toBeNull();
    expect(validateSnapMemberReplacement(state, ctx, 1, { memberId: 102, gekisouLevel: null })).toEqual({ code: "duplicate-character", slot: 1, otherSlot: 0 });
    expect(validateSnapMemberReplacement(state, ctx, 1, { memberId: 103, gekisouLevel: null })).toBeNull();
    expect(validateSnapMemberReplacement(state, ctx, 0, null)).toBeNull();
    expect(validateSnapFormation(blank(), ctx)).toEqual([]);
  });
  test("unknown member and GK level are rejected even when the ID/level is well-formed in a URL", () => {
    const state = parseSnapQuery(new URLSearchParams("sm=999:0,101:2,103:3"));
    expect(validateSnapFormation(state, ctx).map((issue) => issue.code)).toEqual(["unknown-member", "unknown-gk-level", "unknown-gk-level"]);
    expect(validateSnapMemberReplacement(state, ctx, 1, { memberId: 101, gekisouLevel: 1 })).toBeNull();
  });
  test("supportCardID is unique across kinds and levels, while shared skills on distinct real cards stay legal", () => {
    const state = blank(); state.snapSkills = [{ kind: "support", skillId: 1, level: 1, cardId: 11 }, null, null, null, null];
    expect(validateSnapSkillReplacement(state, ctx, 0, state.snapSkills[0]!)).toBeNull();
    expect(validateSnapSkillReplacement(state, ctx, 1, { kind: "support", skillId: 1, level: 1, cardId: 12 })).toBeNull();
    expect(validateSnapSkillReplacement(state, ctx, 1, { kind: "support", skillId: 1, level: 3, cardId: 11 })).toEqual({ code: "duplicate-snap-card", slot: 1, otherSlot: 0 });
    expect(validateSnapSkillReplacement(state, ctx, 1, { kind: "gekisou-support", skillId: 2, level: 1, cardId: 11 })).toEqual({ code: "duplicate-snap-card", slot: 1, otherSlot: 0 });
    expect(validateSnapSkillReplacement(state, ctx, 0, null)).toBeNull();
  });
  test("skill levels must be bound to that actual card, and unsupported skills cannot bypass the UI", () => {
    expect(validateSnapSkillReplacement(blank(), ctx, 0, { kind: "support", skillId: 1, level: 3, cardId: 12 })?.code).toBe("unknown-snap-card");
    expect(validateSnapSkillReplacement(blank(), ctx, 0, { kind: "support", skillId: 1, level: 2, cardId: 11 })?.code).toBe("unknown-skill-level");
    expect(validateSnapSkillReplacement(blank(), ctx, 0, { kind: "support", skillId: 999, level: 1, cardId: 11 })?.code).toBe("unknown-skill");
    expect(validateSnapSkillReplacement(blank(), ctx, 0, { kind: "support", skillId: 8, level: 1, cardId: 14 })?.code).toBe("unsupported-skill");
    const invalidBinding = createSnapLegalityContext(data, [choice(4, 1, [11], { rankBindings: [{ cardId: 12, rank: 1, binding: 1 }] })]);
    expect(validateSnapSkillReplacement(blank(), invalidBinding, 0, { kind: "support", skillId: 4, level: 1, cardId: 11 })?.code).toBe("unknown-snap-card");
  });
  test("legacy URLs resolve only unique card bindings and never silently assign an ambiguous skill", () => {
    const state = parseSnapQuery(new URLSearchParams("ss=support:1:1,support:7:1,support:7:2"));
    expect(resolveSnapSupportCardId(state.snapSkills[0], choices)).toBeNull();
    expect(resolveSnapSupportCardId(state.snapSkills[1], choices)).toBe(13);
    expect(validateSnapFormation(state, ctx).map((issue) => issue.code)).toEqual(["ambiguous-snap-card", "duplicate-snap-card", "duplicate-snap-card"]);
    // One malformed imported slot does not prevent correcting a different slot.
    expect(validateSnapSkillReplacement(state, ctx, 0, { kind: "support", skillId: 1, level: 1, cardId: 12 })).toBeNull();
  });
  test("explicit card identities round-trip without changing physical slots or legacy three-field values", () => {
    const params = new URLSearchParams("ss=0,support:1:1:12,0,gekisou-support:2:1:11,support:7:1&sm=101:0,0,103:2");
    const state = parseSnapQuery(params);
    expect(state.snapSkills[1]).toEqual({ kind: "support", skillId: 1, level: 1, cardId: 12 });
    expect(state.snapSkills[4]).toEqual({ kind: "support", skillId: 7, level: 1 });
    const serialized = new URLSearchParams(); writeSnapQuery(serialized, state);
    expect(parseSnapQuery(serialized)).toEqual(state);
    expect(validateSnapFormation(state, ctx)).toEqual([]);
    expect(parseSnapQuery(new URLSearchParams("ss=support:1:1:0,support:1:1:NaN,support:1:1:12:extra")).snapSkills).toEqual([null, null, null, null, null]);
  });
  test("picker groups actual cards and only levels each card can reach via its rank binding", () => {
    expect(groupSnapSkillCards(choices).map((group) => [group[0]!.kind, group[0]!.cardId, group[0]!.skillId, group.map((entry) => entry.level)])).toEqual([
      ["support", 11, 1, [1, 3]], ["support", 12, 1, [1]], ["support", 13, 7, [1, 2]], ["support", 14, 8, [1]], ["gekisou-support", 11, 2, [1]],
    ]);
  });
});

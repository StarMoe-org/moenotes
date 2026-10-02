import { describe, expect, test } from "bun:test";
import type { CardViewModel } from "../src/lib/cards/data";
import { draftSnapMember, isValidSnapMemberDraft, searchSnapMembers, type SearchableSnapMember } from "../src/lib/chart-data/member-search";

const vm = (id: number, extras: Partial<CardViewModel> = {}): CardViewModel => ({
  id, assetId: 1001, characterId: 11, bandId: 1, rarity: 4, cardType: 2, title: "A New Beginning",
  characterName: "Tomori", bandName: "MyGO!!!!!", characterColor: "#666", performancePower: 1, technicPower: 1, visualPower: 1,
  totalPower: 3, startAt: "", gachaVoice: "", liveSkillId: 1, leaderSkillId: 1, gekisouSkillId: 1, searchText: "", ...extras,
});
const members: SearchableSnapMember[] = [
  { id: 31, name: "Tomori A New Beginning", vm: vm(31), gkLevels: [1, 2] },
  { id: 99, name: "Mutsumi Moon", vm: vm(99, { characterName: "Mutsumi", title: "Moon", bandId: 2, bandName: "Ave Mujica", cardType: 4 }), gkLevels: [1, 3] },
  { id: 777, name: "Snapshot name only", gkLevels: [] },
];

describe("paired member picker", () => {
  test("NFKC AND search finds titles, characters, bands and IDs without mixing cards", () => {
    expect(searchSnapMembers(members, "ＴＯＭＯＲＩ　31 beginning").map((entry) => entry.id)).toEqual([31]);
    expect(searchSnapMembers(members, "Ave Moon").map((entry) => entry.id)).toEqual([99]);
    expect(searchSnapMembers(members, "Tomori Moon")).toEqual([]);
  });
  test("band and attribute filters combine and never infer metadata for missing VMs", () => {
    expect(searchSnapMembers(members, "", 2, 4).map((entry) => entry.id)).toEqual([99]);
    expect(searchSnapMembers(members, "", 2, 2)).toEqual([]);
    expect(searchSnapMembers(members, "777")).toEqual([members[2]!]);
    expect(searchSnapMembers(members, "777", 1)).toEqual([]);
    expect(members[2]!.vm).toBeUndefined();
  });
  test("changing member clears Gekisou level rather than inheriting or maximizing it", () => {
    expect(draftSnapMember({ memberId: 31, gekisouLevel: 2 }, 99)).toEqual({ memberId: 99, gekisouLevel: null });
    expect(draftSnapMember(null, 99)).toEqual({ memberId: 99, gekisouLevel: null });
    expect(draftSnapMember({ memberId: 99, gekisouLevel: 3 }, 99)).toEqual({ memberId: 99, gekisouLevel: 3 });
  });
  test("only levels belonging to the selected snapshot member can be applied", () => {
    expect(isValidSnapMemberDraft(null, members)).toBe(true);
    expect(isValidSnapMemberDraft({ memberId: 31, gekisouLevel: null }, members)).toBe(true);
    expect(isValidSnapMemberDraft({ memberId: 31, gekisouLevel: 2 }, members)).toBe(true);
    expect(isValidSnapMemberDraft({ memberId: 31, gekisouLevel: 3 }, members)).toBe(false);
    expect(isValidSnapMemberDraft({ memberId: 404, gekisouLevel: null }, members)).toBe(false);
    expect(isValidSnapMemberDraft({ memberId: 777, gekisouLevel: null }, members)).toBe(true);
    expect(isValidSnapMemberDraft({ memberId: 777, gekisouLevel: 1 }, members)).toBe(false);
  });
});

import { describe, expect, test } from "bun:test";
import { parseSnapQuery, replaceSnapSlot, writeSnapQuery } from "../src/lib/chart-data/snap-query";
import { groupSnapSkills, searchSnapSkills } from "../src/lib/chart-data/snap-search";
import type { SnapSkillChoice } from "../src/lib/chart-data/snap-types";
import { parseChartDataQuery, serializeChartDataQuery } from "../src/lib/chart-data/query";
import { scenarioSupport } from "../src/lib/chart-data/scenario";
import { chartSnapProfile, snapDisplayedMeasurement } from "../src/lib/chart-data/snap-profile";
import { emptySnapRanking, snapProfileKey } from "../src/lib/chart-data/snap-client";

const choice = (id: number, level: number, extras: Partial<SnapSkillChoice> = {}): SnapSkillChoice => ({
  kind: "support", skillId: id, level, key: `support:${id}:${level}`, name: "技能 ABC", description: "Great 转换",
  searchTerms: ["睦 Ave Mujica"], cardIds: [17], rankBindings: [], effectTypes: [2000], requirements: [], status: "supported", ...extras,
});

describe("five optional Snap selections", () => {
  test("empty URL stays empty and all five slots default to none", () => {
    const state = parseSnapQuery(new URLSearchParams());
    expect(state.snapSkills).toEqual([null, null, null, null, null]);
    expect(state.snapMembers).toEqual([null, null, null, null, null]);
    const query = new URLSearchParams(); writeSnapQuery(query, state);
    expect(query.toString()).toBe("");
  });
  test("levels, member context and physical slots round-trip through the chart URL", () => {
    const ctx = { hasStats: false, support: scenarioSupport(null) };
    const state = parseChartDataQuery("ss=0,support:31:2,0,gekisou-support:19:3,0&sm=0,7:0,0,4:2,0&mp=321000", ctx);
    expect(state.snapSkills[1]).toEqual({ kind: "support", skillId: 31, level: 2 });
    expect(state.snapMembers[3]).toEqual({ memberId: 4, gekisouLevel: 2 });
    expect(parseChartDataQuery(serializeChartDataQuery(state, ctx), ctx)).toEqual(state);
  });
  test("untrusted URL cannot inject malformed IDs, levels or out-of-range power", () => {
    const state = parseSnapQuery(new URLSearchParams("ss=support:1:2:3,unknown:1:2,support:-1:2,support:1:NaN,support:9007199254740993:1&sm=2:0:9,1:4,0:1&mp=20000001"));
    expect(state.snapSkills).toEqual([null, null, null, null, null]);
    expect(state.snapMembers[0]).toBeNull();
    expect(state.snapMembers[1]).toEqual({ memberId: 1, gekisouLevel: 4 });
    expect(state.snapPower).toBe(300000);
    expect(() => replaceSnapSlot(state.snapSkills, 5, null)).toThrow();
  });
  test("an invalid member URL hides same-null-profile results synchronously", () => {
    const ctx = { hasStats: false, support: scenarioSupport(null) };
    const state = parseChartDataQuery("ss=support:31:1&sm=999:0", ctx);
    const evaluation = chartSnapProfile(state, { format: "nnnotes.deck-data/1", provenance: {}, master: { MasterMemberCard: { columns: ["_id"], rows: [] } }, charts: [] });
    const previous = { ...emptySnapRanking(snapProfileKey(evaluation.profile)), status: "complete" as const,
      rows: new Map([[1, { scoreId: 1, score: 100, baselineScore: 99, delta: 1, life: 1000, combo: 1, randomDraws: 0, convertedJudgements: 0 }]]) };
    const shown = snapDisplayedMeasurement(evaluation, null, previous);
    expect(evaluation.invalidMembers).toEqual([0]);
    expect(shown.status).toBe("needs-context");
    expect(shown.rows.size).toBe(0);
    expect(previous.rows.size).toBe(1);
  });
});

describe("Snap catalogue search", () => {
  test("NFKC token search includes source card names, effects and IDs", () => {
    const list = [choice(31, 1), choice(8, 1, { searchTerms: [], cardIds: [99] })];
    expect(searchSnapSkills(list, "ＡＢＣ 睦 17").map((c) => c.skillId)).toEqual([31]);
    expect(searchSnapSkills(list, "31 Great").map((c) => c.skillId)).toEqual([31]);
    expect(searchSnapSkills(list, "睦 99")).toEqual([]);
  });
  test("kind and unsupported filters apply independently; levels stay explicit", () => {
    const list = [choice(31, 2), choice(31, 1), choice(31, 1), choice(4, 1, { status: "unsupported" }), choice(2, 1, { kind: "gekisou-support" })];
    expect(searchSnapSkills(list, "", "support", true)).toHaveLength(3);
    expect(groupSnapSkills(list).map((group) => [group[0]!.kind, group[0]!.skillId, group.map((entry) => entry.level)])).toEqual([
      ["support", 4, [1]], ["support", 31, [1, 2]], ["gekisou-support", 2, [1]],
    ]);
  });
});

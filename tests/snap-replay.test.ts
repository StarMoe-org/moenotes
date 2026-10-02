import { describe, expect, test } from "bun:test";
import { buildSnapSkillCatalogue, snapMemberContext } from "../src/lib/chart-data/snap-catalogue";
import { createSnapEvaluator, snapProfileData, validateSnapProfile } from "../src/lib/chart-data/snap-bridge";
import type { SnapDeckData, SnapEvaluationProfile, SnapTable } from "../src/lib/chart-data/snap-types";
import { buildSnapLabeler, type SnapLabelSource } from "../src/lib/chart-data/snap-labels";
import { buildSnapSourceCards, labelSnapRankingCatalogue } from "../src/lib/chart-data/snap-source-vms";

function table(rows: Record<string, unknown>[]): SnapTable {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  return { columns, rows: rows.map((r) => columns.map((k) => r[k])) };
}
function fixture(): SnapDeckData {
  const effect = { _id: 1, _supportSkillID: 1, _level: 1, _skillEffectType: 15000, _activationTimeSecond: 0, _effectValue: 250,
    _skillTriggerConditionGroup: 0, _skillConditionGroup: 1, _skillReleaseConditionGroup: 0, _skillTargetIDs: [], _maxEffectValue: 0,
    _effectLimitCount: 0, _skillCumulativeConditionID: 0, _effectExecuteLimitCount: 0, _effectExecuteLimitResetConditionGroup: 0 };
  return { format: "nnnotes.deck-data/1", provenance: {}, charts: [], master: {
    MasterSupportCard: table([{ _id: 7, _characterIDs: [10], _rarity: 2, _cardType: 1, _supportCardRankGroup: 1, _supportSkillId01: 1, _supportSkillId02: 0, _gekisouSupportSkillId01: 2, _gekisouSupportSkillId02: 0 }]),
    MasterSupportCardRank: table([{ _id: 1, _group: 1, _rank: 1, _supportSkill01Level: 1, _supportSkill02Level: 1, _gekisouSupportSkill01Level: 1, _gekisouSupportSkill02Level: 1 }]),
    MasterSupportSkillEffect: table([effect, { ...effect, _id: 99, _supportSkillID: 99 }]),
    MasterGekisouSupportSkillEffect: table([{ ...effect, _gekisouSupportSkillID: 2, _skillEffectType: 2000 }]),
    MasterSkillCondition: table([{ _id: 1, _conditionType: 5000, _conditionTargetIDs: [1] }]),
    MasterSkillConditionSet: table([{ _id: 1, _group: 1, _conditionIds: [1] }]),
    MasterSkillTarget: table([{ _id: 1, _characterID: 0, _bandID: 3, _cardType: 0, _tagID: 0, _gekisouMissionType: 0, _liveSkillCategories: [], _gekisouSkillCategories: [] }]),
    MasterSkillCumulativeCondition: table([]),
    MasterMemberCard: table([{ _id: 5, _characterID: 10, _cardType: 2, _bestMusicTagIDs: [8], _liveSkillID: 4, _gekisouSkillID: 3 }]),
    MasterCharacter: table([{ _id: 10, _bandID: 3 }]),
    MasterLiveSkill: table([{ _id: 1, _skillCategories: [7] }, { _id: 4, _skillCategories: [99] }]),
    MasterLiveSkillEffect: table([{ ...effect, _liveSkillID: 1, _skillEffectType: 2000, _activationTimeSecond: 5, _skillConditionGroup: 0 }]),
    MasterGekisouSkill: table([{ _id: 3, _skillCategories: [6], _gekisouMissionType: 2 }]),
    MasterGekisouSkillEffect: table([{ _gekisouSkillID: 3, _level: 1 }]),
  } };
}
function profile(data = fixture()): SnapEvaluationProfile {
  const member = snapMemberContext(data, 5, 1);
  return { memberSkillPercent: [100, 90, 80, 70, 60], selections: [null, null, null, null, null], pairedMembers: [member, member, member, member, member],
    power: 300000, mode: { kind: "normal" }, seed: 0, fps: 60, greatFraction: 0, justFraction: 0, skillOrder: [0, 1, 2, 3, 4] };
}

describe("same-snapshot Snap inputs", () => {
  test("catalogue excludes unbound future skills and gives the actual level to labels", () => {
    const calls: number[] = [];
    const choices = buildSnapSkillCatalogue(fixture(), (_kind, _id, level) => { calls.push(level); return { name: String(level), description: String(level) }; });
    expect(choices.map((c) => c.key)).toEqual(["support:1:1", "gekisou-support:2:1"]);
    expect(calls).toEqual([1, 1]);
    expect(choices[0]?.requirements).toContain("paired-member");
    expect(choices[0]?.rankBindings).toEqual([{ cardId: 7, rank: 1, binding: 1 }]);
  });
  test("missing predicates and paired Gekisou skill refuse computation", () => {
    const data = fixture(), p = profile(data);
    p.selections = [{ kind: "support", skillId: 1, level: 1 }, null, null, null, null];
    p.pairedMembers = [null, null, null, null, null];
    expect(() => validateSnapProfile(data, p)).toThrow("paired member");
    p.selections = [{ kind: "gekisou-support", skillId: 2, level: 1 }, null, null, null, null];
    p.pairedMembers = [snapMemberContext(data, 5, null), null, null, null, null];
    p.mode = { kind: "fixedSoloGekisou", ranks: [1, 1, 1] };
    expect(() => validateSnapProfile(data, p)).toThrow("paired member Gekisou skill");
  });
  test("a raw-window skill cannot pretend to work on completed judgement inputs", () => {
    const data = fixture();
    const t = data.master.MasterSupportSkillEffect!;
    t.rows[0]![t.columns.indexOf("_skillEffectType")] = 4004;
    expect(buildSnapSkillCatalogue(data)[0]?.status).toBe("unsupported");
  });
  test("a supplied object with unknown predicates is not a confirmed member context", () => {
    const data = fixture(), p = profile(data);
    p.pairedMembers = [{ ...p.pairedMembers[0]!, bandId: 0 }, null, null, null, null];
    expect(() => validateSnapProfile(data, p)).toThrow("incomplete");
    p.pairedMembers = [{ ...snapMemberContext(data, 5, 1), gekisouMissionType: 3 }, null, null, null, null];
    expect(() => validateSnapProfile(data, p)).toThrow("Gekisou predicates");
  });
  test("synthetic profile categories describe the injected plain skill, not the reference card skill", () => {
    const data = fixture(), original = JSON.stringify(data), p = profile(data), derived = snapProfileData(data, p);
    expect(JSON.stringify(data)).toBe(original);
    const table = derived.master.MasterLiveSkill!;
    expect(table.rows.slice(-5).map((r) => r[table.columns.indexOf("_skillCategories")])).toEqual([[7], [7], [7], [7], [7]]);
    expect(p.pairedMembers[0]?.liveSkillCategories).toEqual([99]);
  });
  test("bridge preserves physical pairing while skill order changes; Rust alone returns the score", () => {
    const data = fixture(), p = profile(data);
    p.selections = [null, null, { kind: "support", skillId: 1, level: 1 }, null, null];
    p.skillOrder = [4, 3, 2, 1, 0];
    let input: Record<string, unknown> = {};
    const runtime = createSnapEvaluator({ data, manifestSha256: "a", dataSha256: "b", modelCommit: "c", factory: () => ({
      template: () => JSON.stringify({ format: "ournotes.replay/1", frames: [], scoreId: 10 }), describeChart: () => "{}",
      run: (raw) => { input = JSON.parse(raw); return JSON.stringify({ format: "ournotes.replay-result/1", scoreId: 10, complete: true, score: 123 }); },
    }) }, p);
    expect(runtime.evaluate(10).score).toBe(123);
    expect(input.skillOrder).toEqual([4, 3, 2, 1, 0]);
    const performers = input.performers as Array<Record<string, unknown>>;
    expect(performers[2]?.supportSkills).toEqual([[1, 1]]);
    expect(performers[0]?.supportSkills).toEqual([]);
    expect(performers[2]?.liveSkillCategories).toEqual([7]);
  });
  test("non-default accuracy needs the shared input-plan helper", () => {
    const data = fixture(), p = profile(data); p.justFraction = 1;
    expect(() => createSnapEvaluator({ data, manifestSha256: "a", dataSha256: "b", modelCommit: "c", factory: () => { throw Error("must not allocate"); } }, p)).toThrow("input-plan helper");
  });
  test("same-version labels still require exact table hashes and actual-level descriptions", () => {
    const data = fixture();
    const names = ["MasterSupportSkill", "MasterSupportSkillEffect", "MasterGekisouSupportSkill", "MasterGekisouSupportSkillEffect", "MasterText", "MasterSkillConditionSet", "MasterSkillCondition", "MasterSkillCumulativeCondition", "MasterSkillTarget", "MasterCharacter", "MasterBand"];
    data.provenance = { region: "tw", master: { version: "v", tables: Object.fromEntries(names.map((n) => [n, { sha256: "a".repeat(64) }])) } };
    const source: SnapLabelSource = { format: "nnnotes.replay-labels/1", region: "tw", masterVersion: "v", tables: Object.fromEntries(names.map((n) => [n, { sha256: "a".repeat(64), rows: [] }])) };
    source.tables.MasterSupportSkill!.rows = [{ _id: 1, _nameTextID: "name", _descriptionTextFormatID: "desc", _skillIconID: 1 }];
    source.tables.MasterSupportSkillEffect!.rows = [{ _id: 1, _supportSkillID: 1, _level: 1, _skillEffectType: 15000, _effectValue: 250 }, { _id: 2, _supportSkillID: 1, _level: 2, _skillEffectType: 15000, _effectValue: 500 }];
    source.tables.MasterText!.rows = [{ _id: "name", _english: "Extension" }, { _id: "desc", _english: "{effects[0].value/100:F2}" }];
    const label = buildSnapLabeler(data, source, "en-US");
    expect(label("support", 1, 1)?.description).toBe("2.50");
    expect(label("support", 1, 2)?.description).toBe("5.00");
    source.tables.MasterText!.sha256 = "b".repeat(64);
    expect(() => buildSnapLabeler(data, source, "en-US")).toThrow("table identity");
  });
  test("later caller edits cannot change the evaluated profile or its reported identity", () => {
    const data = fixture(), p = profile(data); let power = 0;
    const runtime = createSnapEvaluator({ data, manifestSha256: "a", dataSha256: "b", modelCommit: "c", factory: () => ({
      template: (_id, measurementPower) => { power = measurementPower; return JSON.stringify({ format: "ournotes.replay/1", frames: [] }); }, describeChart: () => "{}",
      run: () => JSON.stringify({ format: "ournotes.replay-result/1", scoreId: 10, complete: true, score: 123 }),
    }) }, p);
    p.power = 900000;
    runtime.evaluate(10);
    expect(power).toBe(300000);
    expect(runtime.profile.power).toBe(300000);
    expect(Object.isFrozen(runtime.profile.pairedMembers)).toBe(true);
  });
  test("same-source fallback searches card/character/band names but suppresses raw templates", () => {
    const data = fixture(); data.provenance = { region: "tw", master: { version: "v" }, deck: { commit: "c" } };
    const music = { format: "nnnotes.music-data/1", provenance: { region: "tw", master: { version: "v" }, deck: { commit: "c" } },
      bands: [{ id: 3, name: { en: "Source band" } }], characters: [{ id: 10, name: { en: "Source character" } }],
      gekisouCatalog: { snaps: [{ id: 7, name: { en: "Source Snap" }, subtitle: { en: "Source subtitle" } }], members: [{ id: 5, name: { en: "Source member" } }], supportSkills: [{ id: 2, name: { en: "Source skill" }, description: { en: "{effects[0].value}" } }] } };
    const choices = labelSnapRankingCatalogue(buildSnapSkillCatalogue(data), data, music, undefined, "en-US");
    expect(choices[0]?.name).toBe("Source Snap");
    expect(choices[0]?.searchTerms).toContain("Source character");
    expect(choices[0]?.searchTerms).toContain("Source band");
    expect(choices[0]?.searchTerms).toContain("Source subtitle");
    expect(choices[1]?.description).toBe("");
    const cards = buildSnapSourceCards(data, music, undefined, "en-US");
    expect(cards.members[0]?.name).toBe("Source member");
    expect(cards.members[0]?.gkLevels).toEqual([1]);
    expect(cards.members[0]?.vm).toBeUndefined();
    expect(cards.snaps.size).toBe(0); // _assetID is not in this source; card ID is not a substitute.
    expect(() => buildSnapSourceCards(data, { ...music, provenance: { ...music.provenance, master: { version: "different" } } }, undefined, "en-US")).toThrow("another replay snapshot");
  });
});

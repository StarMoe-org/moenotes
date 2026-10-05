import { describe, expect, test } from "bun:test";
import { answerField, createBox, mergeBoxes, parseBox, unknownField } from "../src/lib/box/model";
import { answerFurnitureLevel, answerPlayerField, exportBandItemFacts, exportPlayerRankFacts, playerCatalogueIssues, serializeBandItemFacts, serializePlayerBonusFacts, serializePlayerRankFacts, type PlayerFieldCatalogue } from "../src/lib/box/player-catalog";

const catalogue: PlayerFieldCatalogue = { format: "moenotes.player-fields/1", server: "jp", masterVersion: "synthetic/1", sha256: "a".repeat(64),
  fields: [
    { key: "furniture.1.level", kind: "band-item", id: "1", label: { english: "Synthetic furniture" }, levels: [1, 2, 4], sourceEvidence: "synthetic legal level rows" },
    ...["1", "2"].map(id => ({ key: `furniture.${id}.state`, kind: "band-item-state" as const, id, label: { english: "Synthetic furniture state" },
      options: ["active", "inactive", "not-owned", "no-bonus"].map(value => ({ value, label: { english: value } })), equipmentGroup: "synthetic-exclusive", sourceEvidence: "synthetic equipment-state contract" })),
    { key: "vip.rank", kind: "vip-rank", label: { english: "Synthetic VIP rank" }, levels: [0, 1, 2], sourceEvidence: "synthetic VIP rows" },
  ], equipmentLimits: [{ group: "synthetic-exclusive", maxActive: 1 }] };

describe("player facts use a versioned legal-value catalogue", () => {
  test("unknown, explicit absence, inactive and no-bonus remain different facts", () => {
    const original = createBox("jp", "player");
    expect(playerCatalogueIssues(original, catalogue).every(item => item.reason === "unknown")).toBe(true);
    const absent = answerPlayerField(original, catalogue, "furniture.1.state", "not-owned", 1);
    expect(absent.player.bandItemStates["1"]?.value).toBe("not-owned");
    expect(absent.player.bandItems["1"]).toBeUndefined();
    expect(original.player.bandItemStates).toEqual({});
    const inactive = answerPlayerField(absent, catalogue, "furniture.1.state", "inactive", 2);
    const none = answerPlayerField(inactive, catalogue, "furniture.1.state", "no-bonus", 3);
    const cleared = answerPlayerField(none, catalogue, "furniture.1.state", null, 4);
    expect(mergeBoxes(cleared, none).player.bandItemStates["1"]?.value).toBeNull();
    expect(parseBox(JSON.stringify(cleared)).player.bandItemStates["1"]?.history).toHaveLength(4);
  });
  test("legal rows define levels; a larger effect-table range is not accepted", () => {
    const box = createBox("jp", "player");
    expect(() => answerPlayerField(box, catalogue, "furniture.1.level", 3)).toThrow("Illegal player field value");
    expect(() => answerPlayerField(box, catalogue, "furniture.1.level", 50)).toThrow("Illegal player field value");
    const updated = answerPlayerField(box, catalogue, "furniture.1.level", 4, 10);
    expect(updated.player.bandItems["1"]?.history[0]?.catalog).toMatchObject({ masterVersion: "synthetic/1", sha256: "a".repeat(64), fieldKey: "furniture.1.level" });
    expect(playerCatalogueIssues(updated, catalogue).some(item => item.key === "furniture.1.level")).toBe(false);
    expect(playerCatalogueIssues(updated, { ...catalogue, sha256: "b".repeat(64) }).find(item => item.key === "furniture.1.level")?.reason).toBe("version");
  });
  test("confirmed equipment constraints are enforced; absent constraints are not invented", () => {
    const box = answerPlayerField(createBox("jp", "player"), catalogue, "furniture.1.state", "active");
    expect(() => answerPlayerField(box, catalogue, "furniture.2.state", "active")).toThrow("Equipment limit");
    expect(answerPlayerField(box, { ...catalogue, equipmentLimits: [] }, "furniture.2.state", "active").player.bandItemStates["2"]?.value).toBe("active");
  });
  test("zero VIP is explicit evidence, and cross-server or unversioned facts remain unusable", () => {
    const box = answerPlayerField(createBox("jp", "player"), catalogue, "vip.rank", 0, 10);
    expect(box.player.vipRank.value).toBe(0); expect(box.player.vipRank.status).toBe("manual");
    expect(() => answerPlayerField(createBox("tw", "player"), catalogue, "vip.rank", 0)).toThrow("another server");
    const legacy = createBox("jp", "legacy"); legacy.player.vipRank = answerField(unknownField(), { id: "unbound", source: "manual", value: 0, at: 1 });
    expect(playerCatalogueIssues(legacy, catalogue).find(item => item.key === "vip.rank")?.reason).toBe("version");
    const invalid = structuredClone(box); invalid.player.vipRank.history[0]!.catalog!.server = "tw";
    expect(() => parseBox(JSON.stringify(invalid))).toThrow("another server");
  });
  test("the strict-core adapter separates actual level, explicit absence and unresolved facts", () => {
    const original = createBox("jp", "player");
    expect(exportBandItemFacts(original, catalogue)).toEqual({ coverage: "partial", values: [{ id: "1", owned: null, level: null }] });
    const owned = answerFurnitureLevel(original, catalogue, "furniture.1.level", 4, 10);
    expect(exportBandItemFacts(owned, catalogue).values).toEqual([{ id: "1", owned: true, level: 4 }]);
    const ownedUnknown = answerFurnitureLevel(owned, catalogue, "furniture.1.level", null, 11);
    expect(exportBandItemFacts(ownedUnknown, catalogue).values).toEqual([{ id: "1", owned: true, level: null }]);
    const expiredLevel = structuredClone(owned);
    expiredLevel.player.bandItems["1"]!.history[0]!.catalog!.sha256 = "b".repeat(64);
    expect(exportBandItemFacts(expiredLevel, catalogue).values).toEqual([{ id: "1", owned: true, level: null }]);
    const absent = answerFurnitureLevel(owned, catalogue, "furniture.1.level", "not-owned", 20);
    expect(exportBandItemFacts(absent, catalogue).values).toEqual([{ id: "1", owned: false, level: null }]);
    expect(playerCatalogueIssues(absent, catalogue).some(item => item.key === "furniture.1.level")).toBe(false);
    const cleared = answerFurnitureLevel(absent, catalogue, "furniture.1.level", null, 30);
    expect(exportBandItemFacts(cleared, catalogue).values[0]!.owned).toBeNull();
    expect(exportBandItemFacts(owned, { ...catalogue, sha256: "b".repeat(64) }).values[0]!.owned).toBeNull();
    expect(parseBox(JSON.stringify(absent)).player.bandItems["1"]!.value).toBeNull();
  });
  test("native furniture IDs cross the Worker boundary as exact unquoted i64 tokens", () => {
    const text = serializeBandItemFacts({ coverage: "partial", values: [{ id: "9007199254740993", owned: true, level: 2 }, { id: "9223372036854775807", owned: false, level: null }] });
    expect(text).toContain('"id":9007199254740993'); expect(text).not.toContain('"id":"'); expect(text).not.toContain("bandItems");
    for (const id of ["01", "0", "1.2", "9223372036854775808"]) expect(() => serializeBandItemFacts({ coverage: "complete", values: [{ id, owned: null, level: null }] })).toThrow("i64");
    expect(() => serializeBandItemFacts({ coverage: "partial", values: [{ id: "1", owned: false, level: 3 }] })).toThrow("fact");
    expect(() => serializeBandItemFacts({ coverage: "wrong" as "partial", values: [] })).toThrow("coverage");
  });

  test("character completeness cannot invent missing ranks or a total-rank observation", () => {
    const ranks: PlayerFieldCatalogue = { ...catalogue, fields: [
      ...["1", "9007199254740993"].map(id => ({ key: `characterRank.${id}`, kind: "character-rank" as const, id, label: {}, levels: [1, 4], sourceEvidence: "synthetic character domain" })),
      { key: "characterTotalRank", kind: "character-total-rank", label: {}, min: 2, max: 8, sourceEvidence: "synthetic total rank" },
      { key: "vipRank", kind: "vip-rank", label: {}, levels: [1, 2], sourceEvidence: "synthetic positive VIP rows" },
    ] };
    let box = createBox("jp", "ranks"); box.player.characterCoverage = "complete";
    expect(exportPlayerRankFacts(box, ranks)).toEqual({ characterRanks: { coverage: "partial", values: [] }, characterTotalRank: null, vipRank: null });
    box = answerPlayerField(box, ranks, "characterRank.1", 4, 10);
    expect(exportPlayerRankFacts(box, ranks).characterRanks).toEqual({ coverage: "partial", values: [{ id: "1", value: 4 }] });
    box = answerPlayerField(box, ranks, "characterRank.9007199254740993", 1, 20);
    expect(exportPlayerRankFacts(box, ranks).characterRanks.coverage).toBe("complete");
    expect(exportPlayerRankFacts(box, ranks).characterTotalRank).toBeNull(); expect(box.player.characterTotalRank.history).toEqual([]);
    box = answerPlayerField(box, ranks, "characterTotalRank", 5, 30);
    box = answerPlayerField(box, ranks, "vipRank", 1, 40);
    expect(exportPlayerRankFacts(box, ranks)).toMatchObject({ characterTotalRank: 5, vipRank: 1 });
    expect(() => answerPlayerField(box, ranks, "characterTotalRank", 5000)).toThrow("Illegal");
    expect(() => answerPlayerField(box, ranks, "vipRank", 0)).toThrow("Illegal");
    const expired = structuredClone(box); expired.player.characterRanks["9007199254740993"]!.history[0]!.catalog!.sha256 = "b".repeat(64);
    expect(exportPlayerRankFacts(expired, ranks).characterRanks).toEqual({ coverage: "partial", values: [{ id: "1", value: 4 }] });
    expect(exportPlayerRankFacts(box, { ...ranks, sha256: "b".repeat(64) })).toMatchObject({ characterTotalRank: null, vipRank: null });
    const text = serializePlayerBonusFacts(box, ranks);
    expect(text).toContain('"id":9007199254740993'); expect(text).not.toContain('"id":"'); expect(text).not.toContain('"bandItems":'); expect(text).not.toContain("sourceEvidence");
    const conflict = mergeBoxes(box, answerPlayerField(createBox("jp", "independent"), ranks, "characterRank.9007199254740993", 4, 50));
    expect(exportPlayerRankFacts(conflict, ranks).characterRanks.values).toEqual([{ id: "1", value: 4 }]);
  });

  test("rank serialization rejects nullable rows, unsafe IDs and invalid coverage at the Worker boundary", () => {
    expect(serializePlayerRankFacts({ characterRanks: { coverage: "partial", values: [{ id: "9223372036854775807", value: 1 }] }, characterTotalRank: null, vipRank: null })).toContain('"id":9223372036854775807');
    const invalid = { characterRanks: { coverage: "partial" as const, values: [{ id: "1", value: null as unknown as number }] }, characterTotalRank: null, vipRank: null };
    expect(() => serializePlayerRankFacts(invalid)).toThrow("rank value");
    expect(() => serializePlayerRankFacts({ ...invalid, characterRanks: { coverage: "wrong" as "partial", values: [] } })).toThrow("coverage");
    expect(() => serializePlayerRankFacts({ ...invalid, characterRanks: { coverage: "complete", values: [{ id: "9223372036854775808", value: 1 }] } })).toThrow("i64");
    expect(() => serializeBandItemFacts({ coverage: "partial", values: [{ id: 9007199254740993 as unknown as string, owned: null, level: null }] })).toThrow("i64");
  });
});

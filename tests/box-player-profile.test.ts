import { expect, test } from "bun:test";
import { createBox, mergeBoxes, parseBox } from "../src/lib/box/model";
import { answerFurnitureLevel, answerFurnitureOwnership, answerPlayerEvents, answerPlayerField, answerPlayerMemory, exportBandItemFacts, exportPlayerContexts, exportPlayerRankFacts, playerCatalogueIssues, serializePlayerBonusFacts } from "../src/lib/box/player-catalog";
import { deriveGameSaveBox, parseGameSave, type GameSaveTables } from "../src/lib/box/game-save";
import { playerProfileGroups } from "../src/lib/box/player-profile-data";
import { buildPlayerCatalogue, type PlayerMasterTables } from "../src/lib/masterdata/player-fields";

const texts = ["band", "a", "b", "item", "event"].map(id => ({ id, japanese: id, english: id, simplifiedChinese: id, traditionalChinese: id, korean: id }));
const tables: PlayerMasterTables = {
  characters: [1, 2].map(id => ({ id, bandID: 9, nameTextID: id === 1 ? "a" : "b", displayOrder: id, isNonPlayable: false })),
  bands: [{ id: 9, nameTextID: "band", mainColorCode: "FF8822" }],
  bandItems: [{ id: "9007199254740993", bandId: 9, nameTextId: "item", displayOrder: 1 }],
  bandItemLevels: [1, 2, 4].map(level => ({ bandItemId: "9007199254740993", level })),
  characterRanks: [1, 2, 3].map(rank => ({ rank })), vip: [{ vipRank: 1 }],
  playerRanks: [{ rank: 1 }, { rank: 2 }], bandRanks: [{ rank: 1 }, { rank: 2 }],
  bandTypeRanks: [{ rank: 1 }, { rank: 2 }], members: [{ cardType: 1 }], texts,
  memoryMusics: [], memoryMusicGroups: [], memoryMusicBonuses: [], memoryMemberLevels: [], memorySupportLevels: [],
  events: [{ id: "9223372036854775807", nameTextId: "event", eventType: 1, startAt: "2026-01-01", endAt: "2026-01-02" }], eventEffects: [],
};
const catalog = async () => (await buildPlayerCatalogue("tw", "synthetic/1", tables))!;

test("profile decoration and ratings keep the identity of unchanged power facts", async () => {
  const first = await catalog();
  const restyled = (await buildPlayerCatalogue("tw", "synthetic/1", { ...tables, bands: [{ ...tables.bands![0], mainColorCode: "AA1133" }], bandRanks: [{ rank: 1 }, { rank: 2 }, { rank: 3 }] }))!;
  expect(restyled.sha256).toBe(first.sha256);
  const box = answerPlayerField(createBox("tw", "profile"), first, "characterRank.1", 2, 1);
  expect(playerCatalogueIssues(box, restyled).some(issue => issue.key === "characterRank.1")).toBe(false);
  expect(restyled.profile?.fields.find(field => field.key === "profile.bandRank.9")?.levels).toEqual([1, 2, 3]);
});

test("profile-only levels persist without becoming required power terms", async () => {
  const source = await catalog();
  const box = answerPlayerField(createBox("tw", "profile"), source, "profile.bandRank.9", 2, 1);
  expect(parseBox(JSON.stringify(box)).player.catalogFields["profile.bandRank.9"]?.value).toBe(2);
  expect(playerCatalogueIssues(box, source).some(issue => issue.key.startsWith("profile."))).toBe(false);
  expect(serializePlayerBonusFacts(box, source)).not.toContain("bandRank");
  expect(() => answerPlayerField(box, source, "profile.bandRank.9", 3)).toThrow("Illegal");
});

test("holding an item, clearing ownership and explicit absence preserve distinct facts", async () => {
  const source = await catalog(), key = "bandItem.9007199254740993";
  const held = answerFurnitureOwnership(createBox("tw", "profile"), source, key, "owned", 1);
  expect(exportBandItemFacts(held, source).values).toEqual([{ id: "9007199254740993", owned: true, level: null }]);
  const level = answerFurnitureLevel(held, source, key, 4, 2);
  const unknown = answerFurnitureOwnership(level, source, key, null, 3);
  expect(unknown.player.bandItems["9007199254740993"]?.value).toBe(4);
  expect(exportBandItemFacts(unknown, source).values[0]).toEqual({ id: "9007199254740993", owned: null, level: null });
  const absent = answerFurnitureOwnership(unknown, source, key, "not-owned", 4);
  expect(exportBandItemFacts(absent, source).values[0]).toEqual({ id: "9007199254740993", owned: false, level: null });
  expect(absent.player.bandItems["9007199254740993"]?.history.some(item => item.value === 4)).toBe(true);
});

test("a complete rank sum displays without inventing a total-rank observation", async () => {
  const source = await catalog();
  let box = answerPlayerField(createBox("tw", "profile"), source, "characterRank.1", 2, 1);
  box = answerPlayerField(box, source, "characterRank.2", 3, 2);
  box.player.characterCoverage = "complete";
  const before = JSON.stringify(box);
  const total = playerProfileGroups(box, source, "en-US", url => url).find(group => group.section === "global")!.entities.find(entity => entity.id === "characterTotalRank")!.fields[0]!;
  expect(total.displayValue).toBe("5"); expect(total.value).toBeNull();
  expect(total.readOnly).toBe(true);
  expect(box.player.characterTotalRank.history).toEqual([]); expect(JSON.stringify(box)).toBe(before);
  const partial = { ...box, player: { ...box.player, characterCoverage: "partial" as const } };
  expect(playerProfileGroups(partial, source, "en-US", url => url).find(group => group.section === "global")!.entities.find(entity => entity.id === "characterTotalRank")!.fields[0]!.displayValue).not.toBe("5");
  const merged = mergeBoxes(answerPlayerField(box, source, "characterTotalRank", 4, 3), answerPlayerField(box, source, "characterTotalRank", 5, 4));
  const conflicted = playerProfileGroups(merged, source, "en-US", url => url).find(group => group.section === "global")!.entities.find(entity => entity.id === "characterTotalRank")!.fields[0]!;
  expect(merged.player.characterTotalRank.status).toBe("conflict");
  expect(conflicted.value).toBeNull(); expect(conflicted.needsReview).toBe(true);
  expect(conflicted.readOnly).not.toBe(true);
});

test("memory and events distinguish unknown from an explicit empty choice with versioned histories", async () => {
  const source = await catalog();
  let box = createBox("tw", "profile");
  expect(exportPlayerContexts(box, source)).toEqual({ memory: null, eventIds: null });
  box = answerPlayerMemory(box, source, { musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] }, 1);
  box = answerPlayerEvents(box, source, [], 2);
  expect(exportPlayerContexts(parseBox(JSON.stringify(box)), source)).toEqual({ memory: { musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] }, eventIds: [] });
  box = answerPlayerEvents(box, source, ["9223372036854775807"], 3);
  const serialized = serializePlayerBonusFacts(box, source);
  expect(serialized).toContain('"eventIds":[9223372036854775807]'); expect(serialized).not.toContain('"9223372036854775807"');
  expect(exportPlayerContexts(box, { ...source, masterVersion: "synthetic/2" })).toEqual({ memory: null, eventIds: null });
  expect(() => answerPlayerEvents(box, source, ["5"])).toThrow("outside matching");
  expect(() => answerPlayerMemory(box, source, { musicRanks: { "5": 1 }, unlockedMembers: [], unlockedSnaps: [] })).toThrow("Invalid memory");
});

test("a linked save shows character ranks, furniture and memory read-only while VIP stays editable", async () => {
  const source = await catalog();
  const saveTables: GameSaveTables = { server: "tw", members: {}, snaps: {}, memberLevels: {}, snapLevels: {}, characterRanks: [[1, 0], [2, 5], [3, 9]],
    characters: ["1", "2"], bandItems: { "9007199254740993": [1, 2, 4] }, memoryMusicGroups: [], memoryMusics: {} };
  const stored = answerPlayerField(createBox("tw", "profile"), source, "characterRank.1", 3, 1);
  const link = { server: "intl" as const, accountId: "20000000001", sha256: "a".repeat(64), uploadedAt: 10 };
  const save = parseGameSave(JSON.stringify({ _characters: [{ _masterId: 2, _exp: 6 }], _bandItems: [{ _masterId: "9007199254740993", _level: 4 }] }));
  const { box: view } = deriveGameSaveBox({ ...stored, save: link }, link, save, saveTables, source);
  const groups = playerProfileGroups(view, source, "en-US", url => url, { gameSave: true });
  const field = (key: string) => groups.flatMap(group => [...group.entities.flatMap(entity => entity.fields), ...group.summaryFields ?? []]).find(item => item.key === key)!;
  expect([field("characterRank.1").value, field("characterRank.2").value, field("bandItem.9007199254740993").value]).toEqual([1, 2, 4]);
  expect([field("characterRank.1").readOnly, field("bandItem.9007199254740993").readOnly, field("memory").readOnly]).toEqual([true, true, true]);
  expect(field("vipRank").readOnly).toBeUndefined();
  expect(exportPlayerRankFacts(view, source).characterRanks).toEqual({ coverage: "complete", values: [{ id: "1", value: 1 }, { id: "2", value: 2 }] });
  expect(exportBandItemFacts(view, source)).toEqual({ coverage: "complete", values: [{ id: "9007199254740993", owned: true, level: 4 }] });
  expect(stored.player.characterRanks["1"]?.value).toBe(3);
});

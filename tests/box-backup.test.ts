import "fake-indexeddb/auto";
import { expect, spyOn, test } from "bun:test";
import { gameSaveText, sha256Hex } from "../src/lib/account/game-saves";
import { exportBoxBackup, parseBoxBackup } from "../src/lib/box/backup";
import { gameSaveBoxView, parseGameSave, type GameSaveTables } from "../src/lib/box/game-save";
import { forgetLoadedGameSave, keepGameSave, openLinkedGameSave } from "../src/lib/box/game-save-source";
import { answerField, createBox, mergeBoxBackup, parseBox } from "../src/lib/box/model";
import { writeCachedGameSave } from "../src/lib/box/save-cache";

const tables: GameSaveTables = { server: "en", members: { "1": 1 }, snaps: { "2": 1 },
  memberLevels: { "1": [[1, 0], [60, 100]] }, snapLevels: { "1": [[1, 0], [62, 100]] },
  characters: ["1"], characterRanks: [[1, 0], [3, 10]], bandItems: { "1": [1, 2] },
  memoryMusicGroups: [], memoryMusics: {} };

async function fixture() {
  const text = JSON.stringify({ _memberCards: [{ _masterId: 1, _exp: 100, _awakeCount: 4, _rank: 5, _liveSkillLevel: 2, _performanceSkillLevel: 3 }],
    _supportCards: [{ _masterId: 2, _exp: 100, _rank: 5 }], _characters: [{ _masterId: 1, _exp: 10 }],
    _bandItems: [{ _masterId: 1, _level: 2 }], _memory: { _members: [{ _id: 1, _unlocked: true }] } });
  // Keep the BOM and exact bytes, rather than re-encoding the parsed save text.
  const bytes = new TextEncoder().encode("\uFEFF" + text);
  const box = createBox("en", "backup", 100);
  box.save = { server: "intl", accountId: "123", sha256: await sha256Hex(bytes), uploadedAt: 100 };
  box.player.vipRank = answerField(box.player.vipRank, { id: "vip", source: "manual", at: 100, value: 7 });
  box.baseline = { members: ["1", "3", "4", "5", "6"], snaps: ["2", null, null, null, null] };
  return { box, bytes };
}

test("portable backup restores the displayed save facts offline without storing derived observations", async () => {
  const { box, bytes } = await fixture();
  await writeCachedGameSave({ ...box.save!, bytes });
  const original = structuredClone(box);
  const backup = await exportBoxBackup(box);
  const restored = await parseBoxBackup(backup);
  expect(restored.save!.bytes).toEqual(bytes);
  expect(restored.box).toEqual(original);
  expect(box).toEqual(original);
  expect(restored.box.cards).toEqual([]);
  expect(() => parseBox(backup)).toThrow(); // This is a file bundle, not a cloud/storage Box.

  // Simulate moving the file to a browser without the original cached save.
  forgetLoadedGameSave(box.save!.server, box.save!.accountId, box.save!.sha256);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("moenotes-game-saves", 1);
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("saves", "readwrite"); tx.objectStore("saves").clear();
    tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error);
  });
  db.close();
  const network = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    await keepGameSave(restored.save!, restored.box.save!.uploadedAt);
    const incoming = mergeBoxBackup(createBox("en", "new-device", 200), restored.box);
    const loaded = await openLinkedGameSave(incoming.save!);
    expect(loaded.status).toBe("ready");
    if (loaded.status !== "ready") throw new Error("Missing restored save");
    const view = gameSaveBoxView(incoming, loaded.save.player, tables, null).box!;
    expect(view.cards.map(card => [card.kind, card.identity.value, card.fields.level.value, card.fields.rank.value, card.fields.awake.value]))
      .toEqual([["member", "1", 60, 5, 4], ["snap", "2", 62, 5, null]]);
    expect(view.player.characterRanks["1"]!.value).toBe(3);
    expect(view.player.bandItems["1"]!.value).toBe(2);
    expect(view.player.memory.value!.unlockedMembers).toEqual(["1"]);
    expect(view.player.vipRank.value).toBe(7);
    expect(incoming.baseline).toEqual(box.baseline);
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test("unlinked exports and legacy pointer-only backups remain compatible", async () => {
  const unlinked = createBox("en", "manual", 100);
  expect(parseBox(await exportBoxBackup(unlinked))).toEqual(unlinked);
  expect(await parseBoxBackup(JSON.stringify(unlinked))).toEqual({ box: unlinked, save: null });
  const { box } = await fixture();
  expect(await parseBoxBackup(JSON.stringify(box))).toEqual({ box, save: null });
});

test("corrupt, mismatched, invalid or missing embedded saves are rejected", async () => {
  const { box, bytes } = await fixture();
  await writeCachedGameSave({ ...box.save!, bytes });
  const backup = JSON.parse(await exportBoxBackup(box));
  await expect(parseBoxBackup(JSON.stringify({ ...backup, gameSave: btoa("{}") }))).rejects.toThrow("integrity");
  await expect(parseBoxBackup(JSON.stringify({ ...backup, gameSave: "!" }))).rejects.toThrow();
  await expect(parseBoxBackup(JSON.stringify({ ...backup, gameSave: undefined }))).rejects.toThrow();
  await expect(parseBoxBackup(JSON.stringify({ ...backup, box: { ...box, save: null } }))).rejects.toThrow();
  const invalid = new TextEncoder().encode("not json");
  await expect(parseBoxBackup(JSON.stringify({ ...backup, gameSave: btoa("not json"),
    box: { ...box, save: { ...box.save, sha256: await sha256Hex(invalid) } } }))).rejects.toThrow();
  expect(parseGameSave(gameSaveText(bytes)).memberCards).toHaveLength(1);
});

test("an unavailable linked save fails export instead of emitting a pointer-only backup", async () => {
  const { box } = await fixture();
  box.save = { ...box.save!, sha256: "f".repeat(64), accountId: "456" };
  const network = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try { await expect(exportBoxBackup(box)).rejects.toThrow("unavailable"); }
  finally { network.mockRestore(); }
});

import { expect, spyOn, test } from "bun:test";
import { exportBoxBackup, parseBoxBackup, BOX_BACKUP_MAX_BYTES } from "../src/lib/box/backup";
import { CloudBoxClient, parseCloudBoxEnvelope } from "../src/lib/box/cloud";
import { deriveGameSaveBox, gameSaveBoxView, parseGameSave, type GameSaveTables } from "../src/lib/box/game-save";
import { answerField, createBox, createCard, mergeBoxBackup, parseBox, unknownField, type BoxField, type CardBox, type BoxSaveLink } from "../src/lib/box/model";

const tables: GameSaveTables = { server: "en", members: { "1": 1 }, snaps: { "2": 1 },
  memberLevels: { "1": [[1, 0], [60, 100]] }, snapLevels: { "1": [[1, 0], [62, 100]] },
  characters: ["1"], characterRanks: [[1, 0], [3, 10]], bandItems: { "1": [1, 2] },
  memoryMusicGroups: [], memoryMusics: {} };
const link: BoxSaveLink = { server: "intl", accountId: "123", sha256: "a".repeat(64), uploadedAt: 100 };

function fixture() {
  const player = parseGameSave(JSON.stringify({ _memberCards: [{ _masterId: 1, _exp: 100, _awakeCount: 4, _rank: 5, _liveSkillLevel: 2, _performanceSkillLevel: 3 }],
    _supportCards: [{ _masterId: 2, _exp: 100, _rank: 5 }], _characters: [{ _masterId: 1, _exp: 10 }],
    _bandItems: [{ _masterId: 1, _level: 2 }], _memory: { _members: [{ _id: 1, _unlocked: true }] } }));
  const stored = createBox("en", "backup", 100);
  stored.save = link;
  stored.player.vipRank = answerField(stored.player.vipRank, { id: "vip", source: "manual", at: 100, value: 7 });
  stored.baseline = { members: ["1", "3", "4", "5", "6"], snaps: ["2", null, null, null, null] };
  return { stored, player, displayed: deriveGameSaveBox(stored, link, player, tables, null).box };
}

function allFields(box: CardBox): BoxField<unknown>[] {
  return [...box.cards.flatMap(card => [card.identity, ...Object.values(card.fields)]),
    ...Object.values(box.player.characterRanks), ...Object.values(box.player.bandItems), ...Object.values(box.player.bandItemStates),
    ...Object.values(box.player.catalogFields), box.player.characterTotalRank, box.player.vipRank, box.player.memory, box.player.eventIds];
}

test("snapshot restores the complete displayed facts offline, with no save or cache", async () => {
  const { displayed } = fixture();
  const original = structuredClone(displayed);
  const network = spyOn(globalThis, "fetch").mockRejectedValue(new Error("offline"));
  try {
    const backup = await exportBoxBackup(displayed);
    const restored = parseBoxBackup(backup);
    expect(displayed).toEqual(original);
    expect(restored.format).toBe("moenotes.card-box/1");
    expect(restored.save).toBeNull();
    expect(backup).not.toContain('"gameSave"');
    expect(parseBox(backup)).toEqual(restored);
    const incoming = mergeBoxBackup(createBox("en", "new-device", 200), restored, 300);
    // A refresh reads the persisted facts without requiring the original linked save or Master tables.
    const view = gameSaveBoxView(parseBox(JSON.stringify(incoming)), null, null, null).box!;
    expect(view.cards.map(card => [card.kind, card.identity.value, card.fields.level.value, card.fields.rank.value, card.fields.awake.value]))
      .toEqual([["member", "1", 60, 5, 4], ["snap", "2", 62, 5, null]]);
    expect(view.player.characterRanks["1"]!.value).toBe(3);
    expect(view.player.bandItems["1"]!.value).toBe(2);
    expect(view.player.bandItemStates["1"]!.value).toBe("owned");
    expect(view.player.memory.value!.unlockedMembers).toEqual(["1"]);
    expect(view.player.vipRank.value).toBe(7);
    expect(incoming.baseline).toEqual(displayed.baseline);
    expect(incoming.coverage).toEqual(displayed.coverage);
    expect(incoming.player.characterCoverage).toBe("complete");
    expect(incoming.player.bandItemsComplete).toBe(true);
    for (const field of allFields(restored)) for (const evidence of field.history) {
      if (evidence.source === "game-save") expect(evidence.id).toMatch(/:snapshot:[a-f0-9]{64}$/);
    }
    expect(network).not.toHaveBeenCalled();
  } finally { network.mockRestore(); }
});

test("unlinked exports and legacy pointer-only backups remain compatible", async () => {
  const unlinked = createBox("en", "manual", 100);
  unlinked.cards.push(createCard("member", "unknown-card"));
  unlinked.player.eventIds = answerField(unknownField(), { id: "events", source: "manual", at: 101, value: ["1"] });
  const screenshot = { id: "shot", source: "screenshot" as const, at: 101, value: 7, screenshot: { sourceId: "image", bbox: [0, 0, 1, 1] as [number, number, number, number] } };
  unlinked.player.vipRank = { status: "observed", value: 7, needsReview: false, history: [screenshot] };
  expect(parseBoxBackup(await exportBoxBackup(unlinked))).toEqual(unlinked);
  expect(parseBoxBackup(JSON.stringify(unlinked))).toEqual(unlinked);
  const { stored } = fixture();
  expect(parseBoxBackup(JSON.stringify(stored))).toEqual(stored);
  expect(mergeBoxBackup(createBox("en", "legacy-target", 200), parseBoxBackup(JSON.stringify(stored))).save).toEqual(link);
});

test("save evidence stays observed, is editable, and survives repeat import and export", async () => {
  const { displayed } = fixture();
  const text = await exportBoxBackup(displayed);
  const snapshot = parseBoxBackup(text);
  expect(await exportBoxBackup(displayed)).toBe(text);
  expect(await exportBoxBackup(snapshot)).toBe(text);
  const field = snapshot.cards[0]!.fields.level;
  expect(field).toMatchObject({ status: "observed", value: 60, history: [{ source: "game-save", value: 60 }] });
  const edited = structuredClone(snapshot);
  edited.cards[0]!.fields.level = answerField(field, { id: "level-answer", value: 61, source: "manual", at: 200 });
  const restored = parseBox(JSON.stringify(mergeBoxBackup(edited, snapshot, 300)));
  expect(restored.cards[0]!.fields.level).toMatchObject({ status: "manual", value: 61 });
  expect(restored.cards[0]!.fields.level.history.map(item => item.source)).toEqual(["game-save", "manual"]);
  const again = mergeBoxBackup(restored, snapshot, 400);
  expect(again.cards[0]!.fields.level).toEqual(restored.cards[0]!.fields.level);
  expect(again.cards).toHaveLength(2);
});

test("different Master derivations of the same save never reuse evidence IDs", async () => {
  const { stored, player, displayed } = fixture();
  const changed = deriveGameSaveBox(stored, link, player, { ...tables, memberLevels: { "1": [[1, 0], [61, 100]] } }, null).box;
  const original = parseBoxBackup(await exportBoxBackup(displayed));
  const updated = parseBoxBackup(await exportBoxBackup(changed));
  expect(original.cards[0]!.fields.level.history[0]!.id).not.toBe(updated.cards[0]!.fields.level.history[0]!.id);
  expect(original.cards[0]!.identity.history[0]!.id).toBe(updated.cards[0]!.identity.history[0]!.id);
  const merged = mergeBoxBackup(original, updated);
  expect(merged.cards[0]!.fields.level).toMatchObject({ status: "conflict", value: null, needsReview: true });
  expect(merged.cards[0]!.fields.level.history).toHaveLength(2);
  expect(parseBox(JSON.stringify(merged))).toEqual(merged);
});

test("export deduplicates equivalent normalized save evidence and rejects different-source collisions", async () => {
  const { displayed } = fixture();
  const field = displayed.cards[0]!.fields.level;
  const original = structuredClone(field.history[0]!);
  field.history.push({ ...original, id: `${original.id}:snapshot:${"b".repeat(64)}` },
    { ...original, id: `${original.id}:snapshot:${"c".repeat(64)}` });
  expect(parseBox(JSON.stringify(displayed))).toEqual(displayed);
  const text = await exportBoxBackup(displayed);
  const snapshot = parseBoxBackup(text);
  expect(snapshot.cards[0]!.fields.level.history).toHaveLength(1);
  expect(await exportBoxBackup(snapshot)).toBe(text);
  expect(field.history).toHaveLength(3);

  // A manual observation may already use the exact ID the save normalization will produce.
  const collision = fixture().displayed;
  collision.cards[0]!.fields.level.history.push({ ...original, source: "manual", id: snapshot.cards[0]!.fields.level.history[0]!.id });
  expect(parseBox(JSON.stringify(collision))).toEqual(collision);
  await expect(exportBoxBackup(collision)).rejects.toThrow("identity collision");
});

test("snapshot save observations pass client cloud preparation, response parsing and readback", async () => {
  const snapshot = parseBoxBackup(await exportBoxBackup(fixture().displayed));
  const original = structuredClone(snapshot);
  let cloud: unknown = { box: null, revision: null, association: null, updatedAt: null };
  const client = new CloudBoxClient({ userId: "snapshot-owner", server: "en", association: null }, {
    isCurrent: () => true,
    fetch: (async (_url, init) => {
      if (init?.method === "PUT") {
        const request = JSON.parse(String(init.body));
        expect(request.expectedRevision).toBeNull();
        expect(request.association).toBeNull();
        expect(request.box).toEqual(original);
        cloud = { box: request.box, revision: "1", association: request.association, updatedAt: 200 };
      }
      return new Response(JSON.stringify(cloud), { headers: { "content-type": "application/json" } });
    }) as typeof fetch,
  });
  const prepared = client.preparePut(snapshot, null);
  snapshot.cards[0]!.fields.level = answerField(snapshot.cards[0]!.fields.level, { id: "later-local-answer", source: "manual", value: 61, at: 201 });
  expect((await client.submit(prepared)).box).toEqual(original);
  expect((await client.read()).box).toEqual(original);
  const restored = parseCloudBoxEnvelope(cloud, "en").box!;
  expect(restored.save).toBeNull();
  expect(restored.cards[0]!.fields.level.status).toBe("observed");
  expect(restored.cards[0]!.fields.level.history[0]!.source).toBe("game-save");
  expect(restored.player.characterRanks["1"]!.history[0]!.source).toBe("game-save");
  expect(restored.player.memory.history[0]!.source).toBe("game-save");
});

test("stable save evidence IDs include catalogue identity, source evidence and structured values", async () => {
  const { displayed } = fixture();
  displayed.player.characterRanks["1"]!.history[0]!.catalog = { format: "moenotes.player-fields/1", server: "en", masterVersion: "1", sha256: "b".repeat(64), fieldKey: "characterRank.1", sourceEvidence: "table:1" };
  const original = parseBoxBackup(await exportBoxBackup(displayed));
  for (const change of ["masterVersion", "sourceEvidence"] as const) {
    const updated = structuredClone(displayed);
    updated.player.characterRanks["1"]!.history[0]!.catalog![change] = "changed";
    const exported = parseBoxBackup(await exportBoxBackup(updated));
    expect(exported.player.characterRanks["1"]!.history[0]!.id).not.toBe(original.player.characterRanks["1"]!.history[0]!.id);
    expect(mergeBoxBackup(original, exported).player.characterRanks["1"]!.history).toHaveLength(2);
  }
  const changedMemory = structuredClone(displayed);
  const value = { musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] };
  changedMemory.player.memory.value = value;
  changedMemory.player.memory.history[0]!.value = value;
  const updated = parseBoxBackup(await exportBoxBackup(changedMemory));
  expect(updated.player.memory.history[0]!.id).not.toBe(original.player.memory.history[0]!.id);
});

test("unknown derived fields and a legitimate empty save remain portable", async () => {
  const { stored, player } = fixture();
  const unknown = deriveGameSaveBox(stored, link, player, null, null).box;
  const restored = parseBoxBackup(await exportBoxBackup(unknown));
  expect(restored.cards[0]!.fields.level).toEqual(unknownField());
  expect(restored.cards[0]!.fields.awake.value).toBe(4);
  expect(restored.cards[1]!.fields.liveSkillLevel).toEqual(unknownField());
  const empty = deriveGameSaveBox(stored, link, parseGameSave("{}"), tables, null).box;
  const emptySnapshot = parseBoxBackup(await exportBoxBackup(empty));
  expect(emptySnapshot.cards).toEqual([]);
  expect(emptySnapshot.coverage.member.complete).toBe(true);
  expect(emptySnapshot.coverage.snap.complete).toBe(true);
  expect(emptySnapshot.player.memory.value).toEqual({ musicRanks: {}, unlockedMembers: [], unlockedSnaps: [] });
});

test("backup import rejects bundles, unknown payloads, unsupported provenance and invalid evidence", async () => {
  const { stored, displayed } = fixture();
  expect(() => parseBoxBackup(JSON.stringify({ format: "moenotes.card-box-backup/1", box: stored, gameSave: "e30=" }))).toThrow();
  expect(() => parseBoxBackup(JSON.stringify({ ...stored, gameSave: "e30=" }))).toThrow();
  for (const change of ["unsupported-source", "manual-save", "missing-evidence", "invalid-value"]) {
    const invalid = structuredClone(displayed);
    const field = invalid.cards[0]!.fields.level;
    if (change === "unsupported-source") (field.history[0]! as { source: string }).source = "imported";
    if (change === "manual-save") field.status = "manual";
    if (change === "missing-evidence") field.history = [];
    if (change === "invalid-value") { field.value = 0; field.history[0]!.value = 0; }
    expect(() => parseBoxBackup(JSON.stringify(invalid))).toThrow();
    await expect(exportBoxBackup(invalid)).rejects.toThrow();
  }
});

test("backup files enforce the 20 MB UTF-8 limit", async () => {
  expect(BOX_BACKUP_MAX_BYTES).toBe(20_000_000);
  expect(() => parseBoxBackup(" ".repeat(BOX_BACKUP_MAX_BYTES + 1))).toThrow("too large");
  const box = createBox("en", "界".repeat(Math.ceil(BOX_BACKUP_MAX_BYTES / 3)), 1);
  const text = JSON.stringify(box);
  expect(text.length).toBeLessThan(BOX_BACKUP_MAX_BYTES);
  expect(() => parseBoxBackup(text)).toThrow("too large");
  await expect(exportBoxBackup(box)).rejects.toThrow("too large");
});

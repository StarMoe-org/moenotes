import { describe, expect, test } from "bun:test";
import type { GameServer } from "../src/config/servers";
import { answerField, createBox, createCard, mergeBoxBackup, parseBox, unknownField, type CardBox } from "../src/lib/box/model";
import { CardBoxSession, type BoxBackend } from "../src/lib/box/session";
import { BoxStorageError, type BoxChange } from "../src/lib/box/store";

function backend() {
  const boxes = new Map<GameServer, CardBox>();
  let writes = 0;
  const api: BoxBackend = {
    async read(server) { return boxes.has(server) ? structuredClone(boxes.get(server)!) : null; },
    async save(box, revision) {
      const previous = boxes.get(box.server);
      if ((previous?.revision ?? null) !== revision) throw new BoxStorageError("conflict");
      const next = structuredClone({ ...box, revision: (revision ?? 0) + 1 });
      boxes.set(box.server, next); writes++; return next;
    },
    async remove(server, revision) {
      if (boxes.get(server)?.revision !== revision) throw new BoxStorageError("conflict");
      boxes.delete(server); writes++;
    },
    subscribe() { return () => {}; },
  };
  return { api, boxes, writes: () => writes };
}
describe("shared collection sessions", () => {
  test("a linked backup with no local cards retains its source and team after saving and reopening", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    const backup = createBox("jp", "backup", 100);
    backup.save = { server: "jp", accountId: "9007199254740993", sha256: "a".repeat(64), uploadedAt: 100 };
    backup.baseline = { members: ["1", "2", "3", "4", "5"], snaps: [null, null, null, null, null] };
    backup.player.vipRank = answerField(unknownField(), { id: "vip", value: 3, source: "manual", at: 100 });
    const imported = parseBox(JSON.stringify(backup));
    await session.load(); await session.start("local");
    const current = session.getSnapshot().box!;
    expect(await session.commit(mergeBoxBackup(current, imported))).toBe(true);
    const reopened = new CardBoxSession("jp", store.api);
    await reopened.load();
    const restored = reopened.getSnapshot().box!;
    expect(restored.save).toEqual(backup.save); expect(restored.baseline).toEqual(backup.baseline);
    expect(restored.player.vipRank).toEqual(backup.player.vipRank); expect(restored.cards).toEqual([]);
    expect(restored.id).toBe(current.id); expect(restored.revision).toBe(current.revision + 1);
  });

  test("a late automatic download keeps the save restored from a backup", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    await session.load(); await session.start("local");
    const automatic = { server: "jp" as const, accountId: "1", sha256: "a".repeat(64), uploadedAt: 100 };
    let downloaded!: () => void;
    const download = new Promise<void>(resolve => { downloaded = resolve; });
    const linking = download.then(() => session.linkSave(automatic, null));
    const backup = createBox("jp", "backup", 100);
    backup.save = { server: "jp", accountId: "2", sha256: "b".repeat(64), uploadedAt: 100 };
    expect(await session.commit(mergeBoxBackup(session.getSnapshot().box!, parseBox(JSON.stringify(backup))))).toBe(true);
    const writes = store.writes();
    downloaded();
    expect(await linking).toBe(false); expect(store.writes()).toBe(writes);
    expect(session.getSnapshot().box?.save).toEqual(backup.save);
    expect(await session.linkSave(automatic)).toBe(true);
    expect(session.getSnapshot().box?.save).toEqual(automatic);
  });

  test("a late save update respects unlinking and a backup's different player or version", async () => {
    for (const replacement of [null, { server: "jp" as const, accountId: "2", sha256: "b".repeat(64), uploadedAt: 200 },
      { server: "jp" as const, accountId: "1", sha256: "c".repeat(64), uploadedAt: 200 }]) {
      const store = backend(), session = new CardBoxSession("jp", store.api);
      await session.load(); await session.start("local");
      const original = { server: "jp" as const, accountId: "1", sha256: "a".repeat(64), uploadedAt: 100 };
      expect(await session.linkSave(original)).toBe(true);
      let downloaded!: () => void;
      const download = new Promise<void>(resolve => { downloaded = resolve; });
      const updating = download.then(() => session.linkSave({ ...original, sha256: "d".repeat(64), uploadedAt: 300 }, original));
      expect(await session.commit({ ...session.getSnapshot().box!, save: null })).toBe(true);
      const backup = { ...createBox("jp", "backup", 200), save: replacement };
      expect(await session.commit(mergeBoxBackup(session.getSnapshot().box!, parseBox(JSON.stringify(backup))))).toBe(true);
      const writes = store.writes();
      downloaded();
      expect(await updating).toBe(false); expect(store.writes()).toBe(writes);
      expect(session.getSnapshot().box?.save).toEqual(replacement);
    }
  });

  test("a source-matching update keeps newer local answers and accepts upload metadata differences", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    await session.load(); await session.start("local");
    const original = { server: "jp" as const, accountId: "1", sha256: "a".repeat(64), uploadedAt: 100 };
    expect(await session.linkSave(original, null)).toBe(true);
    const current = session.getSnapshot().box!;
    const vip = answerField(current.player.vipRank, { id: "vip", value: 3, source: "manual", at: 200 });
    expect(await session.commit({ ...current, player: { ...current.player, vipRank: vip } })).toBe(true);
    const updated = { ...original, sha256: "b".repeat(64), uploadedAt: 300 };
    expect(await session.linkSave(updated, { ...original, uploadedAt: 150 })).toBe(true);
    expect(session.getSnapshot().box?.save).toEqual(updated);
    expect(session.getSnapshot().box?.player.vipRank).toEqual(vip);
  });

  test("reviewed cloud import is persisted without losing local identity or overwriting newer drafts", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    const cloud = createBox("jp", "remote", 100); cloud.cards.push(createCard("member", "remote-card", "1", 100));
    await session.load(); expect(await session.adopt(cloud, null)).toBe(true);
    expect(store.boxes.get("jp")?.cards).toHaveLength(1);
    const expected = { id: session.getSnapshot().box!.id, revision: session.getSnapshot().box!.revision };
    const replacement = { ...cloud, id: "other-storage-id" };
    expect(await session.adopt(replacement, expected)).toBe(true);
    expect(session.getSnapshot().box!.id).toBe(expected.id);
    expect(await session.adopt(createBox("jp", "stale"), expected)).toBe(false);
    expect(session.getSnapshot().box!.cards).toHaveLength(1);
  });
  test("temporary answers are shared by subscribers and never written to the local adapter", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    await session.load();
    const seen: (CardBox | null)[] = [];
    const stopA = session.subscribe(() => seen.push(session.getSnapshot().box));
    const stopB = session.subscribe(() => seen.push(session.getSnapshot().box));
    await session.start("temporary");
    const box = session.getSnapshot().box!;
    const card = createCard("member", "member", "1");
    card.fields.liveSkillLevel = answerField(unknownField(), { id: "answer", value: 2, source: "deck-answer", at: 10 });
    expect(await session.commit({ ...box, cards: [card] })).toBe(true);
    expect(seen.at(-1)?.cards[0]?.fields.liveSkillLevel.value).toBe(2);
    expect(store.writes()).toBe(0); expect(store.boxes.size).toBe(0);
    stopA(); stopB();
  });
  test("a stale editor or concurrent duplicate action cannot overwrite newer answers", async () => {
    const store = backend(), session = new CardBoxSession("jp", store.api);
    await session.load(); await session.start("local");
    const stale = structuredClone(session.getSnapshot().box!);
    const changed = { ...stale, cards: [createCard("member", "one", "1")] };
    const first = session.commit(changed);
    expect(await session.commit(changed)).toBe(false);
    expect(await first).toBe(true);
    expect(await session.commit(stale)).toBe(false);
    expect(session.getSnapshot().error).toBe("conflict");
    expect(store.boxes.get("jp")?.cards).toHaveLength(1);
  });
  test("switching destination preserves facts and imports independent manual conflicts", async () => {
    const store = backend(), local = createBox("jp", "local");
    local.revision = 1; local.cards.push(createCard("member", "one", "1"));
    local.cards[0]!.fields.liveSkillLevel = answerField(unknownField(), { id: "local-answer", source: "manual", value: 2, at: 10 });
    store.boxes.set("jp", local);
    const session = new CardBoxSession("jp", store.api);
    await session.load(); await session.start("temporary");
    expect(session.getSnapshot().box?.cards).toHaveLength(1);
    const temporary = structuredClone(session.getSnapshot().box!);
    temporary.cards[0]!.fields.liveSkillLevel = answerField(temporary.cards[0]!.fields.liveSkillLevel, { id: "visit-answer", source: "deck-answer", value: 4, at: 20 });
    await session.commit(temporary);
    const concurrent = structuredClone(local);
    concurrent.revision++;
    concurrent.cards[0]!.fields.liveSkillLevel = answerField(concurrent.cards[0]!.fields.liveSkillLevel, { id: "other-tab", source: "manual", value: 3, at: 30 });
    store.boxes.set("jp", concurrent);
    await session.start("local");
    expect(session.getSnapshot().box?.cards[0]?.fields.liveSkillLevel.status).toBe("conflict");
    expect(session.getSnapshot().mode).toBe("local");
  });
  test("late reads and commits remain bound to their server session", async () => {
    const store = backend();
    let finishJp!: (value: CardBox) => void;
    const jp = new CardBoxSession("jp", { ...store.api, read: () => new Promise(resolve => { finishJp = resolve; }) });
    const tw = new CardBoxSession("tw", store.api);
    const loading = jp.load();
    await tw.load(); await tw.start("temporary");
    const selected = tw.getSnapshot().box!;
    finishJp(createBox("jp", "late-jp")); await loading;
    expect(tw.getSnapshot().box?.id).toBe(selected.id);
    expect(tw.getSnapshot().box?.server).toBe("tw");
    expect(await tw.commit(createBox("jp", "wrong-server"))).toBe(false);
    expect(jp.getSnapshot().box?.id).toBe("late-jp");
  });
  test("browser-storage failure still permits memory-only use", async () => {
    const store = backend();
    const session = new CardBoxSession("jp", { ...store.api, async read() { throw new BoxStorageError("unavailable"); } });
    await session.load(); expect(session.getSnapshot().error).toBe("unavailable");
    expect(await session.start("temporary")).toBe(true);
    expect(session.getSnapshot().mode).toBe("temporary"); expect(store.writes()).toBe(0);
  });
  test("a post-write refresh does not briefly enable controls before its read finishes", async () => {
    const store = backend();
    let change!: (value: BoxChange) => void;
    let holdRead = false, finishRead!: (value: CardBox) => void, signalRead!: () => void;
    const readStarted = new Promise<void>(resolve => { signalRead = resolve; });
    const api: BoxBackend = { ...store.api,
      subscribe(listener) { change = listener; return () => {}; },
      read(server) { return holdRead ? new Promise(resolve => { finishRead = resolve; signalRead(); }) : store.api.read(server); },
      async save(box, revision) { const saved = await store.api.save(box, revision); change({ server: box.server, revision: saved.revision }); return saved; },
    };
    const session = new CardBoxSession("jp", api), busyStates: boolean[] = [];
    session.subscribe(() => busyStates.push(session.getSnapshot().busy));
    await session.load(); await session.start("local"); busyStates.length = 0; holdRead = true;
    const saved = session.commit({ ...session.getSnapshot().box!, cards: [createCard("member", "one", "1")] });
    await readStarted;
    expect(session.getSnapshot().busy).toBe(true); expect(busyStates.every(Boolean)).toBe(true);
    finishRead(structuredClone(store.boxes.get("jp")!));
    expect(await saved).toBe(true); expect(session.getSnapshot().busy).toBe(false);
    expect(busyStates.filter(value => !value)).toHaveLength(1);
  });
});

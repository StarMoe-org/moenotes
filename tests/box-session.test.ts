import { describe, expect, test } from "bun:test";
import type { GameServer } from "../src/config/servers";
import { answerField, createBox, createCard, unknownField, type CardBox } from "../src/lib/box/model";
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

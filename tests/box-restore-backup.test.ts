import { expect, test } from "bun:test";
import { answerField, createBox, createCard, parseBox, type CardBox } from "../src/lib/box/model";
import { restoreBoxBackup } from "../src/lib/box/restore-backup";
import { CardBoxSession, type BoxBackend } from "../src/lib/box/session";
import { BoxStorageError } from "../src/lib/box/store";

function fixture(ownFacts = false) {
  let stored: CardBox | null = null;
  let rejectWrites = false;
  const preferences: boolean[] = [];
  const backend: BoxBackend = {
    async read() { return stored && structuredClone(stored); },
    async save(box, revision) {
      if (rejectWrites) throw new BoxStorageError("unavailable");
      if ((stored?.revision ?? null) !== revision) throw new BoxStorageError("conflict");
      stored = parseBox(JSON.stringify({ ...box, revision: (revision ?? 0) + 1 }));
      return structuredClone(stored);
    },
    async remove() { stored = null; },
    subscribe() { return () => {}; },
  };
  const preference = { get: () => ownFacts, set: (value: boolean) => { ownFacts = value; preferences.push(value); } };
  const incoming = createBox("en", "backup", 100);
  incoming.cards = [createCard("member", "member-1", "1")];
  incoming.cards[0]!.fields.level = answerField(incoming.cards[0]!.fields.level, { id: "level", source: "manual", value: 60, at: 100 });
  return { session: new CardBoxSession("en", backend), backend, preference, preferences, incoming, failWrites: () => { rejectWrites = true; } };
}

test("restoring an independent backup opts out before the first write and survives reopening", async () => {
  const state = fixture();
  await state.session.load();
  const unsubscribe = state.session.subscribe(() => {
    if (state.session.getSnapshot().box) expect(state.preference.get()).toBe(true);
  });
  try {
    expect(await restoreBoxBackup(state.session, state.incoming, "local", state.preference)).toBe(true);
    const reopened = new CardBoxSession("en", state.backend);
    await reopened.load();
    expect(reopened.getSnapshot().box?.cards).toEqual(state.incoming.cards);
    expect(reopened.getSnapshot().box?.save).toBeNull();
    expect(state.preferences).toEqual([true]);
  } finally { unsubscribe(); }
});

test("existing collection import uses the same restore flow and keeps manual answers and team", async () => {
  const state = fixture();
  await state.session.load(); await state.session.start("temporary");
  const current = state.session.getSnapshot().box!;
  current.cards = structuredClone(state.incoming.cards);
  current.cards[0]!.fields.level = answerField(current.cards[0]!.fields.level, { id: "newer", value: 65, source: "manual", at: 200 });
  current.baseline = { members: ["1", "2", "3", "4", "5"], snaps: [null, null, null, null, null] };
  expect(await state.session.commit(current)).toBe(true);
  expect(await restoreBoxBackup(state.session, state.incoming, "temporary", state.preference, current.id)).toBe(true);
  const restored = state.session.getSnapshot().box!;
  expect(restored.cards[0]!.fields.level.value).toBe(65);
  expect(restored.baseline).toEqual(current.baseline);
  expect(state.preference.get()).toBe(true);
});

test("failed initial and existing writes restore the previous source preference", async () => {
  for (const previous of [false, true]) {
    for (const existing of [false, true]) {
      const state = fixture(previous);
      await state.session.load();
      if (existing) await state.session.start("local");
      state.failWrites();
      expect(await restoreBoxBackup(state.session, state.incoming, "local", state.preference)).toBe(false);
      expect(state.preference.get()).toBe(previous);
      expect(state.preferences).toEqual([true, previous]);
    }
  }
});

test("invalid server, stale identity and linked destination do not alter preferences or facts", async () => {
  const state = fixture();
  await state.session.load(); await state.session.start("temporary");
  const before = structuredClone(state.session.getSnapshot().box!);
  await expect(restoreBoxBackup(state.session, { ...state.incoming, server: "jp" }, "temporary", state.preference)).rejects.toThrow("server");
  await expect(restoreBoxBackup(state.session, state.incoming, "temporary", state.preference, "deleted-box")).rejects.toThrow("changed");
  expect(state.session.getSnapshot().box).toEqual(before);
  const linked = { ...before, save: { server: "intl" as const, accountId: "1", sha256: "a".repeat(64), uploadedAt: 100 } };
  expect(await state.session.commit(linked)).toBe(true);
  await expect(restoreBoxBackup(state.session, state.incoming, "temporary", state.preference)).rejects.toThrow("Unlink");
  expect(state.preferences).toEqual([]);
  expect(state.session.getSnapshot().box?.save).toEqual(linked.save);
});

test("legacy pointer backups keep their source without changing the independent preference", async () => {
  const state = fixture();
  await state.session.load();
  state.incoming.save = { server: "intl", accountId: "1", sha256: "a".repeat(64), uploadedAt: 100 };
  expect(await restoreBoxBackup(state.session, state.incoming, "temporary", state.preference)).toBe(true);
  expect(state.session.getSnapshot().box?.save).toEqual(state.incoming.save);
  expect(state.preferences).toEqual([]);
});

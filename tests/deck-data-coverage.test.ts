import { describe, expect, test } from "bun:test";
import { deckDataGap } from "../src/lib/deck/data-coverage";
import { defaultDeckGoalInput, type DeckEvent, type DeckGoalInput } from "../src/lib/deck/goals";
import type { DeckDataCatalog } from "../src/lib/deck/worker-protocol";

const event: DeckEvent = { id: 2, name: "Event", startAt: "2030/01/01 00:00:00+08:00", endAt: "2030/01/10 00:00:00+08:00",
  itemId: 90, challengeMusics: [{ id: 4, musicId: 100111 }] };
const catalog: DeckDataCatalog = {
  eventIds: [1], musics: [{ id: 100001, difficulties: ["easy", "expert"] }],
  challengeMusics: [{ id: 1, eventId: 1, musicId: 100001 }], arenaMusics: [],
};
const updated: DeckDataCatalog = { ...catalog, eventIds: [1, 2],
  musics: [...catalog.musics, { id: 100111, difficulties: ["easy", "normal", "hard", "expert"] }],
  challengeMusics: [...catalog.challengeMusics, { id: 4, eventId: 2, musicId: 100111 }],
  arenaMusics: [{ id: 7, musicId: 100001 }],
};
const gap = (patch: Partial<DeckGoalInput>, available: DeckDataCatalog | null = catalog, held: DeckEvent | null = event) =>
  deckDataGap({ ...defaultDeckGoalInput(), musicId: 100001, ...patch }, held, available, [{ id: 7, musicId: 100001 }]);

describe("deck data coverage", () => {
  test("a held event absent from the runtime blocks each event objective", () => {
    for (const goal of ["challenge", "challengeSkip", "challengePoints", "eventPoints", "eventItems"] as const) {
      expect(gap({ goal, challengeMusicId: 4 })).toBe("event");
    }
    expect(gap({ goal: "power", eventParameter: true })).toBe("event");
  });

  test("ordinary goals run independently of a new event", () => {
    for (const goal of ["battle", "mission", "free", "skip"] as const) expect(gap({ goal })).toBeNull();
    expect(gap({ goal: "power", eventParameter: false })).toBeNull();
    expect(gap({ goal: "power", eventParameter: true }, catalog, null)).toBeNull();
    expect(gap({ goal: "arena", arenaMusicId: 7 }, { ...updated, eventIds: [] })).toBeNull();
  });

  test("a complete publication enables the same challenge selection without rewriting it", () => {
    const input = { ...defaultDeckGoalInput("challenge"), challengeMusicId: 4, greatPercent: 5 };
    const original = structuredClone(input);
    expect(deckDataGap(input, event, catalog)).toBe("event");
    expect(deckDataGap(input, event, updated)).toBeNull();
    expect(input).toEqual(original);
  });

  test("challenge IDs must name the selected event and song", () => {
    for (const challengeMusics of [[], [{ id: 4, eventId: 1, musicId: 100111 }], [{ id: 4, eventId: 2, musicId: 100001 }]]) {
      expect(gap({ goal: "challenge", challengeMusicId: 4 }, { ...updated, challengeMusics })).toBe("song");
    }
  });

  test("ordinary and challenge songs require the selected difficulty's chart, including skips", () => {
    const missingChart = { ...updated, musics: updated.musics.map(row => ({ ...row, difficulties: ["easy"] })) };
    for (const goal of ["free", "battle", "mission", "skip", "challenge", "challengeSkip"] as const) {
      expect(gap({ goal, challengeMusicId: 4 }, missingChart)).toBe("song");
      expect(gap({ goal, challengeMusicId: 4, difficulty: "easy" }, missingChart)).toBeNull();
    }
    expect(gap({ goal: "free", musicId: 100111 })).toBe("song");
    expect(gap({ goal: "challenge", challengeMusicId: 4 }, { ...updated, musics: catalog.musics })).toBe("song");
  });

  test("power checks a selected song without requiring a chart or reading an unused song", () => {
    expect(gap({ goal: "power", powerSong: true, eventParameter: false }, { ...catalog, musics: [{ id: 100001, difficulties: [] }] })).toBeNull();
    expect(gap({ goal: "power", musicId: 100111, powerSong: true, eventParameter: false })).toBe("song");
    expect(gap({ goal: "power", musicId: 100111, powerSong: false, eventParameter: false })).toBeNull();
  });

  test("arena songs use their scene ID, mapping and selected chart", () => {
    expect(gap({ goal: "arena", arenaMusicId: 7 })).toBe("song");
    expect(gap({ goal: "arena", arenaMusicId: 7 }, { ...updated, arenaMusics: [{ id: 7, musicId: 100111 }] })).toBe("song");
    expect(gap({ goal: "arena", arenaMusicId: 7, difficulty: "normal" }, updated)).toBe("song");
    expect(gap({ goal: "arena", arenaMusicId: 7 }, updated)).toBeNull();
  });

  test("unselected inputs keep their selection prompt and a legacy worker requires refreshed coverage", () => {
    expect(gap({ goal: "free", musicId: null })).toBeNull();
    expect(gap({ goal: "challenge", challengeMusicId: null }, updated)).toBeNull();
    expect(gap({ goal: "arena", arenaMusicId: null }, updated)).toBeNull();
    expect(gap({ goal: "free" }, null)).toBe("catalog");
  });
});

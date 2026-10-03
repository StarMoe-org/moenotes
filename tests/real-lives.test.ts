import { describe, expect, test } from "bun:test";
import { normalizeRealLives, realLiveStatus } from "../src/lib/real-lives/data";

const rows = [
  { id: 3, bandIds: [2], readyAt: "2026/10/24 15:00:00", startAt: "2026/10/25 0:00:00", endAt: "2026/10/25 17:30:00" },
  { id: 1, bandIds: [3], readyAt: "2026/10/10 15:00:00", startAt: "2026/10/11 0:00:00", endAt: "2026/10/11 18:00:00" },
  { id: 2, bandIds: [2, 9], readyAt: "", startAt: "2026/10/24 0:00:00", endAt: "null" },
  { id: 4, bandIds: [], readyAt: "", startAt: "2026/10/01 0:00:00", endAt: "" },
];
const names: Record<number, string> = { 2: "MyGO!!!!!", 3: "Ave Mujica" };

describe("real lives", () => {
  test("sort by start, name their bands, drop band-less rows", () => {
    const lives = normalizeRealLives(rows, (id) => names[id]);
    expect(lives.map((live) => live.id)).toEqual([1, 2, 3]);
    expect(lives[1]!.bands).toEqual([{ id: 2, name: "MyGO!!!!!" }, { id: 9, name: "" }]);
    expect(lives[1]!.endAt).toBe("");
    expect(lives[0]!.searchText).toContain("ave mujica");
  });

  test("are ready between the lobby opening and the start", () => {
    const [live] = normalizeRealLives(rows, (id) => names[id]);
    expect(realLiveStatus(live!, Date.parse("2026-10-10T12:00:00+08:00"))).toBe("upcoming");
    expect(realLiveStatus(live!, Date.parse("2026-10-10T16:00:00+08:00"))).toBe("ready");
    expect(realLiveStatus(live!, Date.parse("2026-10-11T12:00:00+08:00"))).toBe("ongoing");
    expect(realLiveStatus(live!, Date.parse("2026-10-12T00:00:00+08:00"))).toBe("ended");
  });
});

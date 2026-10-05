import { describe, expect, test } from "bun:test";
import type { GameSaveMeta } from "../src/lib/account/game-saves";
import { defaultGameSave } from "../src/lib/box/game-save-source";

const meta = (accountId: string, sha: string, uploadedAt: number): GameSaveMeta =>
  ({ server: "intl", accountId, sha256: sha.repeat(64), size: 100, uploadedAt, checkedAt: uploadedAt, client: null });

describe("defaultGameSave", () => {
  test("reads the only uploading player's newest save", () => {
    const saves = [meta("20000000001", "b", 2), meta("20000000001", "a", 1)];
    expect(defaultGameSave(saves, [])).toBe(saves[0]!);
  });

  test("prefers the verified game account of the Box's server", () => {
    const saves = [meta("30000000002", "c", 3), meta("20000000001", "a", 1)];
    expect(defaultGameSave(saves, ["20000000001"])).toBe(saves[1]!);
  });

  test("leaves several unverified players to the user", () => {
    expect(defaultGameSave([meta("30000000002", "c", 3), meta("20000000001", "a", 1)], [])).toBeNull();
    expect(defaultGameSave([meta("30000000002", "c", 3), meta("20000000001", "a", 1)], ["40000000004"])).toBeNull();
  });

  test("has no default without uploads", () => {
    expect(defaultGameSave([], ["20000000001"])).toBeNull();
  });
});

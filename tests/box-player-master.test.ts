import { expect, test } from "bun:test";
import { buildPlayerCatalogue, type PlayerMasterTables } from "../src/lib/masterdata/player-fields";
import type { MasterTextRow } from "../src/lib/masterdata/localize-text";
const text = (id: string, japanese: string): MasterTextRow => ({ id, japanese, english: "", simplifiedChinese: "", traditionalChinese: "", korean: "" });
const tables: PlayerMasterTables = {
  bandItems: [{ id: "9007199254740993", nameTextId: "item_b", bandId: 1, displayOrder: 2 }, { id: 404, nameTextId: "item_a", bandId: 1, displayOrder: 1 }],
  bandItemLevels: [{ bandItemId: "9007199254740993", level: 1 }, { bandItemId: "9007199254740993", level: 4 }, { bandItemId: 404, level: 2 }],
  characters: [{ id: 1, nameTextID: "character", bandID: 1, displayOrder: 1, isNonPlayable: false }],
  characterRanks: [{ rank: 1 }, { rank: 3 }], vip: [{ vipRank: 1 }, { vipRank: 2 }],
  texts: [text("item_a", "Actual master label A"), text("item_b", "Actual master label B"), text("character", "Actual character")],
};
test("player catalogue uses matching master name keys, ordering and actual level rows", async () => {
  const result = await buildPlayerCatalogue("jp", "synthetic/1", tables);
  expect(result?.fields[0]!.id).toBe("404"); expect(result?.fields[0]!.label.japanese).toBe("Actual master label A");
  expect(result?.fields[0]!.levels).toEqual([2]); expect(result?.fields[1]!.id).toBe("9007199254740993"); expect(result?.fields[1]!.levels).toEqual([1, 4]);
  expect(result?.fields.find(field => field.kind === "character-rank")?.levels).toEqual([1, 3]);
  expect(result?.fields.find(field => field.kind === "vip-rank")?.levels).toEqual([1, 2]);
  expect(result?.fields.find(field => field.kind === "character-total-rank")).toMatchObject({ min: 1, max: 3 });
  expect(result?.fields.some(field => field.kind === "band-item-state")).toBe(false);
  for (const server of ["tw", "kr", "en"] as const) {
    const own = await buildPlayerCatalogue(server, "synthetic/1", tables);
    expect(own?.server).toBe(server); expect(own?.fields.find(field => field.kind === "character-rank")?.levels).toEqual([1, 3]);
    expect(own?.sha256).not.toBe(result?.sha256);
  }
  expect(await buildPlayerCatalogue("jp", "synthetic/1", { ...tables, characters: [{ ...tables.characters[0]!, isNonPlayable: true }] })).toBeNull();
  const newer = await buildPlayerCatalogue("jp", "synthetic/2", tables);
  expect(newer?.sha256).not.toBe(result?.sha256);
});

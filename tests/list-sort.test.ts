import { describe, expect, test } from "bun:test";
import { sortEntries } from "../src/lib/filter/list-sort";
import { buildDirectoryEntries } from "../src/lib/assets/explorer";
import type { AssetArchive } from "../src/types/asset-browser";

describe("list sorting", () => {
  test("default preserves source order and sorting never mutates it", () => {
    const source = Object.freeze([{ id: 10 }, { id: 2 }, { id: 1 }]);
    expect(sortEntries(source, "default", "en-US").map(x => x.id)).toEqual([10, 2, 1]);
    expect(sortEntries(source, "idAsc", "en-US").map(x => x.id)).toEqual([1, 2, 10]);
    expect(source.map(x => x.id)).toEqual([10, 2, 1]);
  });
  test("uses numeric collation for localized names and string identifiers", () => {
    const items = [{ id: "chapter-10", name: "Track 10" }, { id: "chapter-2", name: "Track 2" }];
    expect(sortEntries(items, "nameAsc", "en-US")[0]?.id).toBe("chapter-2");
    expect(sortEntries(items, "idDesc", "en-US")[0]?.id).toBe("chapter-10");
  });
  test("invalid or missing dates stay last in both directions", () => {
    const items = [{ id: 1, startAt: "invalid" }, { id: 2, startAt: "2026-09-01" }, { id: 3, startAt: "2025-01-01" }, { id: 4 }];
    expect(sortEntries(items, "dateAsc", "en-US").map(x => x.id)).toEqual([3, 2, 1, 4]);
    expect(sortEntries(items, "dateDesc", "en-US").map(x => x.id)).toEqual([2, 3, 1, 4]);
  });
  test("rarity ties have deterministic ID ordering", () => {
    const items = [{ id: 8, rarity: 4 }, { id: 2, rarity: 4 }, { id: 3, rarity: 2 }];
    expect(sortEntries(items, "rarityDesc", "zh-CN").map(x => x.id)).toEqual([2, 8, 3]);
    expect(sortEntries(items.filter(x => x.id !== 8), "rarityAsc", "zh-CN").map(x => x.id)).toEqual([3, 2]);
  });
});

test("asset size sorting toggles between largest and smallest while keeping folders first", () => {
  const archives = [
    { id: "small", key: "Beta", bundle_name: "Beta", bytes: 10 },
    { id: "large", key: "Alpha", bundle_name: "Alpha", bytes: 100 },
    { id: "nested", key: "Folder/Item", bundle_name: "Item", bytes: 1 },
  ] as AssetArchive[];
  expect(buildDirectoryEntries(archives, "", "", "default").map(entry => entry.name)).toEqual(["Folder", "Alpha", "Beta"]);
  expect(buildDirectoryEntries(archives, "", "", "size").map(entry => entry.name)).toEqual(["Folder", "Alpha", "Beta"]);
  expect(buildDirectoryEntries(archives, "", "", "sizeAscending").map(entry => entry.name)).toEqual(["Folder", "Beta", "Alpha"]);
});

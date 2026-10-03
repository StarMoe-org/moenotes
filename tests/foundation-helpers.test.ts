import { describe, expect, test } from "bun:test";
import { detailNeighbors } from "../src/lib/route/detail-neighbors";
import { safeReturnPath } from "../src/lib/route/url-state";
import { cumulativeUpgradeSteps } from "../src/components/shared/UpgradeCostTable";
import { levelIndex } from "../src/components/shared/LevelSwitch";
import { nextTableSort, sortTableRows, type DataTableColumn } from "../src/components/shared/DataTable";
import { zoomAround } from "../src/components/shared/Lightbox";

describe("detailNeighbors", () => {
  const list = [{ id: 3, name: "C" }, { id: 1, name: "A" }, { id: 3, name: "dup" }, { id: 2, name: "B" }];
  const map = detailNeighbors(list, (x) => x.id, (x) => x.name, (x) => `/items/${x.id}`);
  test("follows the list's order, skipping repeated ids", () => {
    expect(map.get(3)).toEqual({ next: { href: "/items/1", title: "A" } });
    expect(map.get(1)).toEqual({ previous: { href: "/items/3", title: "C" }, next: { href: "/items/2", title: "B" } });
    expect(map.get(2)).toEqual({ previous: { href: "/items/1", title: "A" } });
    expect(map.size).toBe(3);
  });
});

describe("safeReturnPath", () => {
  test("accepts same-site paths only", () => {
    expect(safeReturnPath("/cards?rarity=4#top")).toBe("/cards?rarity=4#top");
    expect(safeReturnPath("/ja/events")).toBe("/ja/events");
    for (const bad of ["//evil.example", "/\\evil.example", "https://evil.example/", "javascript:alert(1)", "cards", "", null, "/a\nb"]) {
      expect(safeReturnPath(bad)).toBeNull();
    }
  });
});

describe("cumulativeUpgradeSteps", () => {
  test("sums costs by material across steps", () => {
    const steps = [
      { from: 0, to: 1, costs: [{ id: 1, name: "Coin", imageUrl: "", count: 100 }] },
      { from: 1, to: 2, costs: [{ id: 2, name: "Gem", imageUrl: "", count: 2 }, { id: 1, name: "Coin", imageUrl: "", count: 50 }] },
    ];
    const total = cumulativeUpgradeSteps(steps);
    expect(total[1]!.costs.map((c) => [c.name, c.count])).toEqual([["Coin", 150], ["Gem", 2]]);
    expect(steps[0]!.costs[0]!.count).toBe(100);
  });
});

describe("levelIndex", () => {
  test("exact or closest option", () => {
    expect(levelIndex([1, 10, 20, 50], 20)).toBe(2);
    expect(levelIndex([1, 10, 20, 50], 40)).toBe(3);
    expect(levelIndex([], 3)).toBe(0);
  });
});

describe("DataTable sorting", () => {
  type Row = { name: string; power?: number };
  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "Name", sortValue: (r) => r.name },
    { key: "power", header: "Power", numeric: true, sortValue: (r) => r.power },
  ];
  const rows: Row[] = [{ name: "b", power: 5 }, { name: "a" }, { name: "c", power: 9 }];
  test("orders rows with missing values last", () => {
    expect(sortTableRows(rows, columns, { key: "power", direction: "desc" }).map((r) => r.name)).toEqual(["c", "b", "a"]);
    expect(sortTableRows(rows, columns, { key: "power", direction: "asc" }).map((r) => r.name)).toEqual(["b", "c", "a"]);
    expect(sortTableRows(rows, columns, null).map((r) => r.name)).toEqual(["b", "a", "c"]);
  });
  test("header clicks cycle first direction, reverse, source order", () => {
    const power = columns[1]!;
    expect(nextTableSort(power, null)).toEqual({ key: "power", direction: "desc" });
    expect(nextTableSort(power, { key: "power", direction: "desc" })).toEqual({ key: "power", direction: "asc" });
    expect(nextTableSort(power, { key: "power", direction: "asc" })).toBeNull();
    expect(nextTableSort(columns[0]!, { key: "power", direction: "asc" })).toEqual({ key: "name", direction: "asc" });
  });
});

describe("Lightbox zoomAround", () => {
  test("keeps the point under the cursor fixed and resets at 1x", () => {
    const zoomed = zoomAround({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
    expect(zoomed).toEqual({ scale: 2, x: -100, y: -50 });
    expect(zoomAround(zoomed, 0.5, { x: 0, y: 0 })).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomAround(zoomed, 100, { x: 0, y: 0 }).scale).toBe(8);
  });
});

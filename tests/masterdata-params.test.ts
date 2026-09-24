import { expect, test } from "bun:test";
import { detailParamsFromRows } from "../src/lib/route/masterdata-params";
import { getAllRoutes, isDynamicRoute } from "../src/lib/route/registry";
import { validateMasterTable } from "../src/lib/cards/data";

test("all dynamic routes derive their params instead of using fixed inventories", () => {
  const routes = getAllRoutes().filter(isDynamicRoute);
  expect(routes).toHaveLength(5);
  for (const route of routes) expect(typeof route.staticParams).toBe("function");
});

test("release tables include new cards and exclude unsupported rarities", () => {
  const rows = validateMasterTable<{ id: number; rarity: number; cardType: number }>({ _allData: [
    { _id: 59, _rarity: 4, _cardType: 3 },
    { _id: 70, _rarity: 10, _cardType: 1 },
  ] })._allData;
  expect(detailParamsFromRows("cards", rows).map((row) => row.params.id)).toEqual(["59"]);
  expect(detailParamsFromRows("support-cards", rows).map((row) => row.params.id)).toEqual(["59"]);
});

test("new character/music IDs are deduplicated and invalid IDs omitted", () => {
  for (const kind of ["characters", "music"] as const) {
    expect(detailParamsFromRows(kind, [{ id: 25 }, { id: 11 }, { id: 25 }, { id: NaN }, { id: -1 }])
      .map((row) => row.params.id)).toEqual(["11", "25"]);
  }
});

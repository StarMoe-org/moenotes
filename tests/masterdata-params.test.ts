import { expect, test } from "bun:test";
import { detailParamsFromRows } from "../src/lib/route/masterdata-params";
import { getAllRoutes, isDynamicRoute } from "../src/lib/route/registry";
import { normalizeCards, validateMasterTable } from "../src/lib/cards/data";

test("all dynamic routes derive their params instead of using fixed inventories", () => {
  const routes = getAllRoutes().filter(isDynamicRoute);
  // 9 existing detail routes + item-detail, shop-detail and help-detail (haneoka feature parity).
  expect(routes).toHaveLength(12);
  for (const route of routes) expect(typeof route.staticParams).toBe("function");
});

test("release tables include supported cards and rarity 10 support cards", () => {
  const rows = validateMasterTable<{ id: number; rarity: number; cardType: number }>({ _allData: [
    { _id: 59, _rarity: 4, _cardType: 3 },
    { _id: 70, _rarity: 10, _cardType: 1 },
  ] })._allData;
  expect(detailParamsFromRows("cards", rows).map((row) => row.params.id)).toEqual(["59"]);
  expect(detailParamsFromRows("support-cards", rows).map((row) => row.params.id)).toEqual(["59", "70"]);
});

test("release tables include birthday member cards", () => {
  const rows = validateMasterTable<{ id: number; rarity: number; cardType: number }>({ _allData: [
    { _id: 64, _rarity: 20, _cardType: 5 },
  ] })._allData;
  expect(detailParamsFromRows("cards", rows).map((row) => row.params.id)).toEqual(["64"]);
});

test("card normalizer keeps birthday members and skips unknown rarities", () => {
  const cards = normalizeCards([
    { id: 64, assetID: 64, characterID: 22, rarity: 20, cardType: 5, nameTextID: "name", subtitleTextID: "title", gachaVoiceTextId: "", startAt: "", liveSkillID: 0, leaderSkillID: 0, gekisouSkillID: 0, performancePowerMax: 1, technicPowerMax: 2, visualPowerMax: 3, memberCardLevelGroup: 1, memberCardAwakeGroup: 1, memberCardRankGroup: 1 },
    { id: 65, assetID: 65, characterID: 22, rarity: 21, cardType: 5, nameTextID: "name", subtitleTextID: "title", gachaVoiceTextId: "", startAt: "", liveSkillID: 0, leaderSkillID: 0, gekisouSkillID: 0, performancePowerMax: 1, technicPowerMax: 2, visualPowerMax: 3, memberCardLevelGroup: 1, memberCardAwakeGroup: 1, memberCardRankGroup: 1 },
  ], [{ id: 22, bandID: 1, displayOrder: 1, nameTextID: "name", enDisplayNameTextId: "name", mainColorCode: "#fff" }],
  [{ id: 1, nameTextID: "band", mainColorCode: "#000" }],
  [{ id: "name", japanese: "ミク", english: "Miku", simplifiedChinese: "初音未来", traditionalChinese: "初音未來", korean: "미쿠" }, { id: "title", japanese: "Birthday", english: "Birthday", simplifiedChinese: "生日", traditionalChinese: "生日", korean: "생일" }, { id: "band", japanese: "Band", english: "Band", simplifiedChinese: "乐队", traditionalChinese: "樂隊", korean: "밴드" }],
  "en-US",
  );
  expect(cards).toHaveLength(1);
  expect(cards[0]?.rarity).toBe(20);
});

test("new character/music IDs are deduplicated and invalid IDs omitted", () => {
  for (const kind of ["characters", "music"] as const) {
    expect(detailParamsFromRows(kind, [{ id: 25 }, { id: 11 }, { id: 25 }, { id: NaN }, { id: -1 }])
      .map((row) => row.params.id)).toEqual(["11", "25"]);
  }
});

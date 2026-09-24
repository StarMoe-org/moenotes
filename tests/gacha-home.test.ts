import { describe, expect, test } from "bun:test";
import type { CardViewModel } from "../src/lib/cards/data";
import { normalizeGachas, toGachaSummary, type RawGacha } from "../src/lib/gacha/data";
import { buildHomeData, type HomeMasterData } from "../src/lib/home/data";
import { compareByStartDesc, parseMasterDate, scheduleStatus } from "../src/lib/schedule";

const card = (id: number, rarity: 2 | 3 | 4, characterId: number, bandId: number) => ({
  id, assetId: id, characterId, bandId, rarity, cardType: 1, title: `Card ${id}`, characterName: `Chara ${characterId}`,
  bandName: `Band ${bandId}`, characterColor: "", performancePower: 0, technicPower: 0, visualPower: 0, totalPower: 0,
  startAt: "2026-01-01 0:00:00", gachaVoice: "", liveSkillId: 0, leaderSkillId: 0, gekisouSkillId: 0, searchText: "",
}) as CardViewModel;

const gacha = (id: number, overrides: Partial<RawGacha> = {}): RawGacha => ({
  id, nameTextId: `Gacha_Name_${id}`, descriptionTextId: "", lotGroupId: id, startAt: "", endAt: "", priority: 0,
  isLimited: false, bannerAssetName: `Gacha/Banner/gacha_banner_${id}`, logoAssetName: "", ...overrides,
});

describe("schedule", () => {
  test("parses both MasterData date formats as UTC+8 and treats blanks and 'null' as open", () => {
    expect(parseMasterDate("2026/09/28 12:59:59")).toBe(Date.parse("2026-09-28T04:59:59Z"));
    expect(parseMasterDate("2026-09-01 0:00:00")).toBe(Date.parse("2026-08-31T16:00:00Z"));
    expect(parseMasterDate("")).toBeNull();
    expect(parseMasterDate("null")).toBeNull();
  });

  test("derives status from the open or closed ends of a schedule", () => {
    const now = Date.parse("2026-09-24T12:00:00+08:00");
    expect(scheduleStatus("", "2026/09/28 12:59:59", now)).toBe("ongoing");
    expect(scheduleStatus("2026/09/27 15:00:00", "", now)).toBe("upcoming");
    expect(scheduleStatus("2026/01/01 0:00:00", "2026/03/14 14:00:00", now)).toBe("ended");
    expect(scheduleStatus("", "", now)).toBe("permanent");
  });

  test("newest start first, undated entries last", () => {
    const rows = [{ id: 1, startAt: "" }, { id: 2, startAt: "2026/09/29 15:00:00" }, { id: 3, startAt: "2026-01-01 0:00:00" }];
    expect([...rows].sort(compareByStartDesc).map((row) => row.id)).toEqual([2, 3, 1]);
  });
});

describe("gacha normalization", () => {
  const cards = [card(51, 4, 1, 1), card(52, 4, 2, 1), card(26, 3, 6, 2)];
  const [pickup, permanent] = normalizeGachas(
    [gacha(1, { priority: 10 }), gacha(2)],
    [
      { lotGroupId: 1, rarityConstraint: 4, resourceTypeConstraint: 2, prizeGroupId: 7, weight: 300 },
      { lotGroupId: 1, rarityConstraint: 3, resourceTypeConstraint: 2, prizeGroupId: 2, weight: 9700 },
      // Stale constraint: the prize rows are items, so this must count as an item pool.
      { lotGroupId: 2, rarityConstraint: 4, resourceTypeConstraint: 2, prizeGroupId: 12, weight: 1 },
    ],
    [
      { groupId: 7, resourceType: 2, resourceId: 51, amount: 1, pickUpType: 2 },
      { groupId: 7, resourceType: 2, resourceId: 52, amount: 1, pickUpType: 1 },
      { groupId: 2, resourceType: 2, resourceId: 26, amount: 1, pickUpType: 1 },
      { groupId: 12, resourceType: 1, resourceId: 5, amount: 5000, pickUpType: 1 },
    ],
    [],
    cards,
    [],
    [{ id: 5, type: 0, group: 0, name: "Coin", desc: "", imagePath: "Item/common/coin", orderNum: 0, searchText: "" }],
    [{ id: "Gacha_Name_1", japanese: "", english: "Pickup", traditionalChinese: "", simplifiedChinese: "", korean: "" }],
    "en-US",
  );

  test("orders by priority and converts lot weights to per-draw rates", () => {
    expect(pickup?.id).toBe(1);
    expect(pickup?.pools.map((pool) => [pool.kind, pool.rarity, pool.rate])).toEqual([["member", 4, 3], ["member", 3, 97]]);
    expect(permanent?.pools).toEqual([{ kind: "item", rarity: 0, rate: 100, count: 1, pickupCount: 0 }]);
    expect(permanent?.items).toEqual([{ id: 5, name: "Coin", imagePath: "Item/common/coin", amount: 5000 }]);
  });

  test("only rate-up prizes count as pickups and drive the band filter", () => {
    expect(pickup?.pickupMemberIds).toEqual([51]);
    expect(pickup?.memberCards.map((item) => item.id)).toEqual([51, 52, 26]);
    expect(pickup && toGachaSummary(pickup)).toMatchObject({ bandIds: [1], pickupCharacters: [{ id: 1, name: "Chara 1" }], memberCount: 3 });
  });
});

describe("home data", () => {
  const master: HomeMasterData = {
    banners: [
      { id: 1, imageAsset: "Gacha/Banner/gacha_banner_00001", displayType: 2, contentId: 1, displayOrder: 110, startAt: "2026-09-01 0:00:00", endAt: "2026-09-28 12:59:59" },
      { id: 4, imageAsset: "SeasonPass/Banner/banner_seasonpass_00001", displayType: 25, contentId: 1, displayOrder: 120, startAt: "2026-09-01 0:00:00", endAt: "2026-10-28 14:59:59" },
      { id: 5, imageAsset: "Image/Banner/home_banner_1100000001", displayType: 4, contentId: 9, displayOrder: 105, startAt: "2026-09-24 0:00:00", endAt: "2026-10-28 11:59:59" },
      { id: 6, imageAsset: "Image/Banner/banner_sample", displayType: 3, contentId: 10, displayOrder: 1, startAt: "2026-03-05 14:00:00", endAt: "2026-03-14 14:00:00" },
    ],
    events: [],
    missions: [
      { id: 1, nameTextID: "Beginner", bannerAsset: "limited_mission/limited_mission_banner_0001", startAt: "null", endAt: "null" },
      { id: 2, nameTextID: "Limited", bannerAsset: "limited_mission/limited_mission_banner_1000000001", startAt: "2026/09/24 0:00:00", endAt: "2026/10/28 12:00:00" },
    ],
    loginBonuses: [{ id: 1, nameTextID: "Daily", startAt: "2026/01/01 0:00:00", endAt: "" }],
    seasonPasses: [{ id: 1, nameTextId: "Pass", bannerAsset: "banner_seasonpass_00001", startAt: "2026/01/01 0:00:00", endAt: "2026/10/28 14:59:59" }],
    texts: [{ id: "Pass", japanese: "", english: "Season Pass", traditionalChinese: "", simplifiedChinese: "", korean: "" }],
  };
  const gachas = [{ id: 1, name: "MyGO Pickup" }] as Parameters<typeof buildHomeData>[1];
  const data = buildHomeData(master, gachas, [], [], [], "en-US", Date.parse("2026-09-24T12:00:00+08:00"));

  test("carousel keeps live banners, drops shop packs and ended ones, and links gacha banners", () => {
    expect(data.slides.map((slide) => [slide.id, slide.kind, slide.title])).toEqual([[4, "seasonPass", "Season Pass"], [1, "gacha", "MyGO Pickup"]]);
    expect(data.slides[1]?.link).toEqual({ routeId: "gacha", detailId: 1 });
  });

  test("activities are the time-limited entries, newest first", () => {
    expect(data.activities.map((activity) => [activity.id, activity.imagePath])).toEqual([
      ["mission-2", "Image/Banner/limited_mission/limited_mission_banner_1000000001"],
      ["seasonPass-1", "SeasonPass/Banner/banner_seasonpass_00001"],
    ]);
  });
});

import { describe, expect, test } from "bun:test";
import {
  homeBannerPassSlug,
  monthlyPassBannerUrl,
  normalizeRewardEntries,
  passRewardSlug,
  rewardEntrySlug,
  toRewardEntrySummary,
  type MonthlyPassDetail,
  type RewardsMasterData,
} from "../src/lib/rewards/data";
import type { RewardResolver } from "../src/lib/rewards/resources";

const resolve: RewardResolver = (resource) => ({ kind: resource.resourceType === 17 ? "degree" : "item", id: resource.resourceId, count: resource.resourceCount, name: `r${resource.resourceType}/${resource.resourceId}`, imageUrl: "x" });

function data(over: Partial<RewardsMasterData> = {}): RewardsMasterData {
  return {
    seasonPasses: [], seasonPassLevels: [], seasonPassLevelRewards: [], seasonPassRewards: [], seasonPassMissions: [],
    missionGroups: [], missions: [], missionRewards: [], loginBonuses: [], loginBonusSlots: [],
    exchanges: [], chapters: [], episodes: [], advs: [], bands: [], characters: [], music: [],
    monthlyPasses: [
      { id: 2, nameTextId: "Monthly_Pass_Name_2", group: 1, descriptionTextId: "Monthly_Pass_Description_2", expireDays: 30, addLiveSkip: 2, addConsumeAllUsageCount: 2, canSkipAd: true },
      { id: 1, nameTextId: "Monthly_Pass_Name_1", group: 1, descriptionTextId: "", expireDays: 30, addLiveSkip: 0, addConsumeAllUsageCount: 0, canSkipAd: false },
    ],
    monthlyPassDailyRewards: [
      { monthlyPassId: 2, dayCount: 2, resourceType: 1, resourceId: 1, resourceCount: 30 },
      { monthlyPassId: 2, dayCount: 1, resourceType: 1, resourceId: 1, resourceCount: 30 },
      { monthlyPassId: 1, dayCount: 1, resourceType: 1, resourceId: 1, resourceCount: 10 },
    ],
    monthlyPassFirstTimeRewards: [{ monthlyPassGroup: 1, resourceType: 17, resourceId: 176, resourceCount: 1 }],
    monthlyPassContinuationRewards: [
      { monthlyPassGroup: 1, purchaseCount: 3, resourceType: 17, resourceId: 178, resourceCount: 1 },
      { monthlyPassGroup: 1, purchaseCount: 2, resourceType: 17, resourceId: 177, resourceCount: 1 },
    ],
    texts: [
      { id: "Monthly_Pass_Name_1", japanese: "", english: "Our Notes Pass ~Lite~", simplifiedChinese: "", traditionalChinese: "", korean: "" },
      { id: "Monthly_Pass_Name_2", japanese: "", english: "Our Notes Pass ~Standard~", simplifiedChinese: "", traditionalChinese: "", korean: "" },
      { id: "Monthly_Pass_Description_2", japanese: "", english: "30 stars a day", simplifiedChinese: "", traditionalChinese: "", korean: "" },
    ],
    ...over,
  };
}

describe("monthly passes", () => {
  test("become reward entries with the monthly-pass slug and the Shop/Pass banner", () => {
    const passes = normalizeRewardEntries(data(), resolve, "en-US").filter((entry): entry is MonthlyPassDetail => entry.kind === "monthlyPass");
    expect(passes.map((pass) => pass.slug)).toEqual(["monthly-pass-1", "monthly-pass-2"]);
    expect(rewardEntrySlug("monthlyPass", 3)).toBe("monthly-pass-3");
    expect(passes[1]!.bannerUrl).toContain("Shop/Pass/Banner/00002/00002.webp");
    expect(monthlyPassBannerUrl(3, "en-US")).toContain("Shop/Pass/Banner/00003/00003.webp");
    expect(passes[1]!.title).toBe("Our Notes Pass ~Standard~");
    expect(passes[1]!.startAt).toBe("");
  });

  test("carry their perks and rewards: daily by day, first-time and continuation by group", () => {
    const pass = normalizeRewardEntries(data(), resolve, "en-US").find((entry) => entry.slug === "monthly-pass-2") as MonthlyPassDetail;
    expect(pass).toMatchObject({ expireDays: 30, addLiveSkip: 2, addConsumeAllUsageCount: 2, canSkipAd: true, description: "30 stars a day", group: 1 });
    expect(pass.dailyRewards.map((day) => [day.day, day.rewards[0]!.count])).toEqual([[1, 30], [2, 30]]);
    expect(pass.firstTimeRewards.map((reward) => reward.id)).toEqual([176]);
    expect(pass.continuationRewards.map((step) => [step.purchaseCount, step.rewards[0]!.id])).toEqual([[2, 177], [3, 178]]);
    expect(toRewardEntrySummary(pass)).not.toHaveProperty("dailyRewards");
  });

  test("tables a server lacks normalize to no passes", () => {
    const entries = normalizeRewardEntries(data({ monthlyPasses: undefined, monthlyPassDailyRewards: undefined }), resolve, "en-US");
    expect(entries.some((entry) => entry.kind === "monthlyPass")).toBe(false);
  });
});

describe("pass slugs for home banners", () => {
  test("resource types 6 and 10 name monthly and season passes", () => {
    expect(passRewardSlug(6, 3)).toBe("monthly-pass-3");
    expect(passRewardSlug(10, 1)).toBe("season-pass-1");
    expect(passRewardSlug(1, 1)).toBeNull();
    expect(passRewardSlug(6, 0)).toBeNull();
  });

  test("a season-pass banner names the pass; a shop banner names it through the pack's products", () => {
    const products = [
      { shopId: 1000000114, resourceType: 1, resourceId: 1, resourceCount: 300 },
      { shopId: 1000000114, resourceType: 6, resourceId: 1, resourceCount: 1 },
    ];
    expect(homeBannerPassSlug({ displayType: 25, contentId: 1 })).toBe("season-pass-1");
    expect(homeBannerPassSlug({ displayType: 4, contentId: 1000000114 }, products)).toBe("monthly-pass-1");
    expect(homeBannerPassSlug({ displayType: 4, contentId: 1000000118 }, products)).toBeNull();
    expect(homeBannerPassSlug({ displayType: 2, contentId: 1 }, products)).toBeNull();
    expect(homeBannerPassSlug({ displayType: 25, contentId: 9 }, [], new Set(["season-pass-1"]))).toBeNull();
  });
});

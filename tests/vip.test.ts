import { describe, expect, test } from "bun:test";
import { formatTgwBonusValue, normalizeTgwCard, parseTgwRankParam, tgwBonusFormat, tgwCardColor, tgwCardImageUrl, type TgwCardSources } from "../src/lib/vip/data";
import type { RewardResolver } from "../src/lib/rewards/resources";

const resolve: RewardResolver = (resource) => ({ kind: "item", id: resource.resourceId, count: resource.resourceCount, name: "", imageUrl: "" });
const units = { hours: "h", minutes: "m", percentUp: (value: string) => `+${value}%`, percentDown: (value: string) => `-${value}%` };

describe("T.G.W CARD colours", () => {
  test("ranks 1–5 normal, 6–10 gold, 11–15 platinum, 16–21 black", () => {
    expect([1, 5, 6, 10, 11, 15, 16, 21].map(tgwCardColor)).toEqual(["normal", "normal", "gold", "gold", "platinum", "platinum", "black", "black"]);
  });

  test("card faces live at Image/Tgw/tgwcard_{color}_{rank}", () => {
    expect(tgwCardImageUrl(6, "en-US")).toContain("Image/Tgw/tgwcard_gold_6/tgwcard_gold_6.webp");
    expect(tgwCardImageUrl(21, "en-US")).toContain("tgwcard_black_21");
    expect(tgwCardImageUrl(0, "en-US")).toBe("");
  });
});

describe("T.G.W CARD benefits", () => {
  test("formats each benefit type like the game", () => {
    expect(tgwBonusFormat(7)).toBe("ratio");
    expect(tgwBonusFormat(2)).toBe("ratioDown");
    expect(tgwBonusFormat(6)).toBe("seconds");
    expect(tgwBonusFormat(4)).toBe("unlock");
    expect(tgwBonusFormat(1)).toBe("count");
    expect(formatTgwBonusValue({ format: "ratio", value: 2000 }, "en-US", units)).toBe("+20%");
    expect(formatTgwBonusValue({ format: "ratioDown", value: 3333 }, "en-US", units)).toBe("-33.33%");
    expect(formatTgwBonusValue({ format: "seconds", value: 14400 }, "en-US", units)).toBe("+4h");
    expect(formatTgwBonusValue({ format: "seconds", value: 5400 }, "en-US", units)).toBe("+1h 30m");
    expect(formatTgwBonusValue({ format: "count", value: 5 }, "en-US", units)).toBe("+5");
    expect(formatTgwBonusValue({ format: "unlock", value: 1 }, "en-US", units)).toBe("");
    expect(formatTgwBonusValue({ format: "count", value: 0 }, "en-US", units)).toBe("");
  });
});

describe("T.G.W CARD ladder", () => {
  const sources: TgwCardSources = {
    vips: [{ vipRank: 2, point: 2000, productsPrice: 100 }, { vipRank: 1, point: 0, productsPrice: 0 }],
    dailyRewards: [{ vipRank: 2, day: 1, resourceType: 1, resourceId: 34, resourceCount: 2 }],
    rankUpRewards: [{ vipRank: 2, resourceType: 1, resourceId: 1, resourceCount: 200 }],
    bonuses: [{ vipRank: 2, vipBonusType: 7, value: 100 }, { vipRank: 2, vipBonusType: 1, value: 5 }, { vipRank: 2, vipBonusType: 9, value: 0 }],
    dailyPoints: [{ consecutiveCount: 2, point: 120 }, { consecutiveCount: 1, point: 100 }],
    texts: [
      { id: "ui_vip_bonus_type_7", japanese: "", english: "All Parameters UP", simplifiedChinese: "", traditionalChinese: "", korean: "" },
      { id: "ui_title_vip_top", japanese: "", english: "T.G.W CARD", simplifiedChinese: "", traditionalChinese: "", korean: "" },
    ],
  };

  test("orders ranks, resolves rewards and lists every benefit by type", () => {
    const card = normalizeTgwCard(sources, resolve, "en-US");
    expect(card.title).toBe("T.G.W CARD");
    expect(card.ranks.map((rank) => [rank.rank, rank.point, rank.color])).toEqual([[1, 0, "normal"], [2, 2000, "normal"]]);
    const two = card.ranks[1]!;
    expect(two.dailyRewards.map((reward) => reward.id)).toEqual([34]);
    expect(two.rankUpRewards.map((reward) => reward.count)).toEqual([200]);
    expect(two.bonuses.map((bonus) => [bonus.type, bonus.name, bonus.value])).toEqual([[1, "", 5], [7, "All Parameters UP", 100], [9, "", 0]]);
    expect(card.dailyPoints).toEqual([{ consecutiveDays: 1, point: 100 }, { consecutiveDays: 2, point: 120 }]);
  });

  test("?rank= names a rank", () => {
    expect(parseTgwRankParam("?rank=10")).toBe(10);
    expect(parseTgwRankParam("?rank=x")).toBeNull();
    expect(parseTgwRankParam("")).toBeNull();
  });
});

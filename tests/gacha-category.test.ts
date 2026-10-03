import { describe, expect, test } from "bun:test";
import type { ItemViewModel } from "../src/lib/items/data";
import { drawOptionCost, drawOptionPlan, gachaCategory, normalizeGachas, toGachaSummary, type RawGacha, type RawGachaProduct } from "../src/lib/gacha/data";

const item = (id: number, type: number, name: string): ItemViewModel => ({ id, type, group: 0, name, desc: "", imagePath: `Item/${id}`, orderNum: id, searchText: "" });
const items = [item(1, 12, "Star"), item(2, 13, "Star (Paid)"), item(37, 15, "Ad"), item(2000002, 2, "Pickup Ticket")];

const product = (id: number, over: Partial<RawGachaProduct>): RawGachaProduct => ({
  id, drawCount: 1, ensuredCount: 0, ensuredRarity: 0, itemType: 12, price: 200, firstTimePrice: 0, isEnsuredNew: false, resetType: 1,
  limitConsumeCount: 0, gachaPoint: 1, monthlyPassIds: [], ratesLabelTextId: "", ...over,
});
const products = [
  product(1, { itemType: 12, price: 200 }),
  product(3, { drawCount: 10, itemType: 12, price: 2000, ensuredCount: 1, ensuredRarity: 3, gachaPoint: 10, ratesLabelTextId: "gacha_rates_label_draw_ten" }),
  product(4, { itemType: 13, price: 50, resetType: 2, limitConsumeCount: 1, monthlyPassIds: [1, 2, 3] }),
  product(6, { itemType: 2, price: 1 }),
  product(14, { itemType: 15, price: 0, resetType: 2, limitConsumeCount: 3 }),
  product(13, { itemType: 23, price: 0, monthlyPassIds: [1] }),
  product(21, { itemType: 12, price: 200, firstTimePrice: -1 }),
  product(22, { itemType: 12, price: 2000, drawCount: 10, firstTimePrice: 1000 }),
];

const gacha = (id: number, over: Partial<RawGacha>): RawGacha => ({
  id, nameTextId: "", descriptionTextId: "", lotGroupId: id, startAt: "", endAt: "", priority: 0, isLimited: false, bannerAssetName: "", logoAssetName: "", ...over,
});

const normalize = (gachas: RawGacha[]) => normalizeGachas(gachas, [], [], [], products, [], [], items, [
  { id: "gacha_rates_label_draw_ten", japanese: "", english: "\"Pull 10 Times\"", simplifiedChinese: "", traditionalChinese: "", korean: "" },
], "en-US");

describe("gacha categories", () => {
  test("follow the draw options' currencies: tickets, ads, bonus draws, stars, then pass draws", () => {
    expect(gachaCategory([13, 13, 12, 12], false)).toBe("stars");
    expect(gachaCategory([2, 2], false)).toBe("ticket");
    expect(gachaCategory([], true)).toBe("ticket");
    expect(gachaCategory([15], false)).toBe("ad");
    expect(gachaCategory([24, 12], false)).toBe("bonus");
    expect(gachaCategory([23], false)).toBe("pass");
    expect(gachaCategory([99], false, true)).toBe("pass");
    expect(gachaCategory([99], false)).toBe("other");
  });

  test("a star gacha that names a ticket stays a star gacha", () => {
    const [stars, tickets, ad, pass] = normalize([
      gacha(1, { priority: 4, productId1: 4, productId2: 1, productId3: 3, gachaTicketItemId: 2000002 }),
      gacha(3, { priority: 3, productId1: 6 }),
      gacha(9, { priority: 2, productId1: 14 }),
      gacha(8, { priority: 1, productId1: 13 }),
    ]);
    expect([stars, tickets, ad, pass].map((entry) => entry!.category)).toEqual(["stars", "ticket", "ad", "pass"]);
    expect(toGachaSummary(stars!).category).toBe("stars");
  });
});

describe("gacha draw options", () => {
  test("carry price, currency, guarantee, limits and points in slot order", () => {
    const [entry] = normalize([gacha(1, { productId1: 4, productId2: 1, productId3: 3, productId4: 6, gachaTicketItemId: 2000002 })]);
    const options = entry!.drawOptions;
    expect(options.map((option) => [option.slot, option.price, option.currency?.name])).toEqual([[1, 50, "Star (Paid)"], [2, 200, "Star"], [3, 2000, "Star"], [4, 1, "Pickup Ticket"]]);
    expect(options[0]).toMatchObject({ limitCount: 1, limitReset: "daily", monthlyPassIds: [1, 2, 3], ensuredCount: 0 });
    expect(options[2]).toMatchObject({ label: "Pull 10 Times", drawCount: 10, ensuredCount: 1, ensuredRarity: 3, gachaPoint: 10, limitReset: "" });
  });

  test("first-time prices: -1 is a free first purchase, 0 no discount", () => {
    const [entry] = normalize([gacha(1, { productId1: 21, productId2: 22, productId3: 1 })]);
    expect(entry!.drawOptions.map((option) => option.firstTimePrice)).toEqual([0, 1000, null]);
    const [free, discounted, plain] = entry!.drawOptions;
    expect([drawOptionCost(free!, 1), drawOptionCost(free!, 2)]).toEqual([0, 200]);
    expect([drawOptionCost(discounted!, 1), drawOptionCost(discounted!, 2)]).toEqual([1000, 2000]);
    expect(drawOptionCost(plain!, 1)).toBe(200);
  });

  test("an option's draw plan guarantees its last draws", () => {
    expect(drawOptionPlan({ drawCount: 10, ensuredCount: 1, ensuredRarity: 3 })).toEqual({ count: 10, guaranteeCount: 1, guaranteeRarity: 3 });
    expect(drawOptionPlan({ drawCount: 1, ensuredCount: 0, ensuredRarity: 0 })).toEqual({ count: 1, guaranteeCount: 0, guaranteeRarity: 0 });
  });
});

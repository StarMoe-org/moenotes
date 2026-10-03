import { describe, expect, test } from "bun:test";
import {
  exchangeLimitReset,
  exchangeSearchText,
  normalizeExchanges,
  type ExchangeSources,
  type RawExchange,
  type RawExchangeProduct,
} from "../src/lib/exchange/data";
import type { RewardKind } from "../src/lib/rewards/resources";

const texts = [
  { id: "exchange_category_event", simplifiedChinese: "活动交换所", english: "Event Exchange" },
  { id: "exchange_category_gacha_point", simplifiedChinese: "招募pt交换所", english: "Gacha Exchange" },
  { id: "Exchange_Name_1", simplifiedChinese: "活动交换所 A", english: "Event Shop A" },
  { id: "Exchange_Name_10", simplifiedChinese: "Pick Up 招募交换所", english: "Pick Up Gacha Shop" },
  { id: "gacha_point", simplifiedChinese: "专用招募pt", english: "Exclusive Gacha Pts." },
] as ExchangeSources["texts"];

const exchange = (over: Partial<RawExchange>): RawExchange => ({
  id: 1, nameTextId: "Exchange_Name_1", exchangeCategoryId: 1, paymentResourceType: 1, paymentResourceId: 43,
  startAt: "", endAt: "", bannerAsset: "", ...over,
});
const product = (over: Partial<RawExchangeProduct>): RawExchangeProduct => ({
  id: 1, exchangeId: 1, resourceType: 1, resourceId: 3, resourceCount: 1, paymentResourceCount: 100, limitCount: 0,
  resetType: 1, paymentSteps: [], paymentStepResourceCounts: [], isRecommended: false, thumbnailAsset: "", startAt: "", endAt: "", ...over,
});

const kinds: Record<number, RewardKind> = { 1: "item", 2: "member", 3: "support", 8: "music" };

function sources(over: Partial<ExchangeSources> = {}): ExchangeSources {
  return {
    categories: [
      { id: 1, nameTextId: "exchange_category_event", displayTargetId: 0, displayOrder: 1, hasSubCategory: true, isMusicShop: false, isRankMatch: false, bannerAsset: "Event" },
      { id: 6, nameTextId: "exchange_category_gacha_point", displayTargetId: 0, displayOrder: 6, hasSubCategory: true, isMusicShop: false, isRankMatch: false, bannerAsset: "GachaPt" },
    ],
    exchanges: [exchange({}), exchange({ id: 10, nameTextId: "Exchange_Name_10", exchangeCategoryId: 6, paymentResourceType: 7, paymentResourceId: 1 })],
    products: [product({ id: 21 }), product({ id: 22, exchangeId: 10 })],
    items: [
      { id: 3, type: 1, group: 1, name: "Coin", desc: "", imagePath: "Item/common/item_icon_coin", orderNum: 1, searchText: "" },
      { id: 43, type: 11, group: 1, name: "Event Medal", desc: "", imagePath: "Item/exchange/item_icon_medal", orderNum: 2, searchText: "" },
    ],
    events: [{ id: 1, name: "Love Rush A to Z", eventItemId: 43 }],
    gachas: [{ id: 1, name: "MyGO!!!!! Pickup" }],
    texts,
    // The shared reward resolver, reduced to the kind and a name the tests can tell apart.
    resolve: (resource) => ({
      kind: kinds[resource.resourceType] ?? "other",
      id: resource.resourceId,
      count: resource.resourceCount,
      name: `${kinds[resource.resourceType] ?? "other"} ${resource.resourceId}`,
      imageUrl: "",
      ...(resource.resourceType === 2 ? { link: { routeId: "cards", detailId: resource.resourceId } } : {}),
    }),
    ...over,
  };
}

describe("exchange normalization", () => {
  test("exchanges join their category through exchangeCategoryId", () => {
    const { categories } = normalizeExchanges(sources(), "en-US");
    expect(categories.map((category) => [category.id, category.exchanges.map((entry) => entry.id)])).toEqual([[1, [1]], [6, [10]]]);
  });

  test("the list carries shop summaries only; products live on the detail", () => {
    const { categories, details } = normalizeExchanges(sources(), "en-US");
    const summary = categories[0]!.exchanges[0]!;
    expect(summary.productCount).toBe(1);
    expect("products" in summary).toBe(false);
    expect(details.find((detail) => detail.id === 1)!.products.map((entry) => entry.id)).toEqual([21]);
  });

  test("an item currency comes from the exchange row and links to the items page", () => {
    const shop = normalizeExchanges(sources(), "en-US").details[0]!;
    expect(shop.currency.name).toBe("Event Medal");
    expect(shop.currency.imageUrl).toEndWith("/Item/exchange/item_icon_medal/item_icon_medal.webp");
    expect(shop.currency.link).toEqual({ routeId: "items" });
  });

  test("gacha points (type 7) use the game's gacha_point text and icon", () => {
    const shop = normalizeExchanges(sources(), "en-US").details[1]!;
    expect(shop.currency.name).toBe("Exclusive Gacha Pts.");
    expect(shop.currency.imageUrl).toEndWith("/Gacha/Icon/GachaPoint/GachaPoint.webp");
    expect(shop.currency.link).toBeUndefined();
  });

  test("a shop belongs to the event whose item it takes, or the gacha whose points it takes", () => {
    const { details } = normalizeExchanges(sources(), "en-US");
    expect(details[0]!.relation).toEqual({ kind: "event", id: 1, name: "Love Rush A to Z" });
    expect(details[1]!.relation).toEqual({ kind: "gacha", id: 1, name: "MyGO!!!!! Pickup" });
    const orphan = normalizeExchanges(sources({ exchanges: [exchange({ paymentResourceId: 64 })], events: [] }), "en-US").details[0]!;
    expect(orphan.relation).toBeNull();
  });

  test("category tiles live under Exchange/Category, shop banners use their own asset", () => {
    const withBanner = sources({ exchanges: [exchange({ bannerAsset: "Exchange/Banner/Banner_5" })] });
    const { categories, details } = normalizeExchanges(withBanner, "en-US");
    expect(categories[0]!.iconUrl).toEndWith("/Exchange/Category/Event/Event.webp");
    expect(details[0]!.categoryIconUrl).toEndWith("/Exchange/Category/Event/Event.webp");
    expect(categories[0]!.exchanges[0]!.bannerUrl).toEndWith("/Exchange/Banner/Banner_5/Banner_5.webp");
  });

  test("products resolve through the shared reward resolver (with its detail links)", () => {
    const { details } = normalizeExchanges(sources({ products: [product({ id: 21, resourceType: 2, resourceId: 64, resourceCount: 1 })] }), "en-US");
    expect(details[0]!.products[0]!.reward).toMatchObject({ kind: "member", id: 64, name: "member 64", link: { routeId: "cards", detailId: 64 } });
  });

  test("limit reset follows the shared enum: 1 none, 2 daily, 3 weekly, 4 monthly", () => {
    expect([1, 2, 3, 4].map((resetType) => exchangeLimitReset(resetType, 5))).toEqual(["", "daily", "weekly", "monthly"]);
    expect(exchangeLimitReset(4, 0)).toBe("");
  });

  test("the limited total sums price × limit of limited products and notes resetting limits", () => {
    const products = [
      product({ id: 21, paymentResourceCount: 100, limitCount: 5 }),
      product({ id: 22, paymentResourceCount: 1, limitCount: 0 }),
      product({ id: 23, paymentResourceCount: 30, limitCount: 2 }),
    ];
    const once = normalizeExchanges(sources({ products }), "en-US").details[0]!;
    expect(once.limitedTotal).toBe(560);
    expect(once.limitedTotalResets).toBe(false);
    const monthly = normalizeExchanges(sources({ products: [product({ id: 21, paymentResourceCount: 6000, limitCount: 1, resetType: 4 })] }), "en-US").details[0]!;
    expect(monthly.limitedTotal).toBe(6000);
    expect(monthly.limitedTotalResets).toBe(true);
  });

  test("stepped prices apply from their exchange count; a malformed pair is ignored", () => {
    const stepped = product({ id: 21, paymentResourceCount: 10, limitCount: 4, paymentSteps: [3], paymentStepResourceCounts: [50] });
    const shop = normalizeExchanges(sources({ products: [stepped] }), "en-US").details[0]!;
    expect(shop.products[0]!.priceSteps).toEqual([{ from: 3, price: 50 }]);
    expect(shop.limitedTotal).toBe(10 + 10 + 50 + 50);
    const malformed = product({ id: 21, paymentSteps: [3, 5], paymentStepResourceCounts: [50] });
    expect(normalizeExchanges(sources({ products: [malformed] }), "en-US").details[0]!.products[0]!.priceSteps).toEqual([]);
  });

  test("empty shops, shops without a category and orphan products are dropped", () => {
    const { categories, details } = normalizeExchanges(sources({
      exchanges: [exchange({}), exchange({ id: 2, exchangeCategoryId: 99 }), exchange({ id: 3 })],
      products: [product({ id: 21 }), product({ id: 22, exchangeId: 2 }), product({ id: 99, exchangeId: 404 })],
    }), "en-US");
    expect(categories.map((category) => category.id)).toEqual([1]);
    expect(details.map((detail) => detail.id)).toEqual([1]);
    expect(details[0]!.products.map((entry) => entry.id)).toEqual([21]);
  });

  test("the search text covers the shop, its category, currency, relation and products", () => {
    const text = exchangeSearchText(normalizeExchanges(sources(), "en-US").details[0]!);
    for (const part of ["event shop a", "event exchange", "event medal", "love rush a to z", "item 3"]) expect(text).toContain(part);
  });
});

import { describe, expect, test } from "bun:test";
import { normalizeExchanges, type ExchangeSources, type RawExchange, type RawExchangeProduct } from "../src/lib/exchange/data";

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
    cards: [], supportCards: [], music: [], stamps: [], degrees: [],
    texts,
    resolve: (resource) => ({ kind: "other", id: resource.resourceId, count: resource.resourceCount, name: "", imageUrl: "" }),
    ...over,
  };
}

describe("exchange normalization", () => {
  test("exchanges join their category through exchangeCategoryId", () => {
    const categories = normalizeExchanges(sources(), "en-US");
    expect(categories.map((category) => [category.id, category.exchanges.map((entry) => entry.id)])).toEqual([[1, [1]], [6, [10]]]);
  });

  test("an item currency comes from the exchange row", () => {
    const shop = normalizeExchanges(sources(), "en-US")[0]!.exchanges[0]!;
    expect(shop.paymentResourceName).toBe("Event Medal");
    expect(shop.paymentResourceImageUrl).toEndWith("/Item/exchange/item_icon_medal/item_icon_medal.webp");
  });

  test("gacha points (type 7) use the game's gacha_point text and icon", () => {
    const shop = normalizeExchanges(sources(), "en-US")[1]!.exchanges[0]!;
    expect(shop.paymentResourceName).toBe("Exclusive Gacha Pts.");
    expect(shop.paymentResourceImageUrl).toEndWith("/Gacha/Icon/GachaPoint/GachaPoint.webp");
  });

  test("category tiles live under Exchange/Category, shop banners use their own asset", () => {
    const withBanner = sources({ exchanges: [exchange({ bannerAsset: "Exchange/Banner/Banner_5" })] });
    const category = normalizeExchanges(withBanner, "en-US")[0]!;
    expect(category.iconUrl).toEndWith("/Exchange/Category/Event/Event.webp");
    expect(category.exchanges[0]!.bannerUrl).toEndWith("/Exchange/Banner/Banner_5/Banner_5.webp");
  });

  test("limit reset follows the shared enum: 1 none, 2 daily, 3 weekly, 4 monthly", () => {
    const products = [1, 2, 3, 4].map((resetType, index) => product({ id: 30 + index, resetType, limitCount: 5 }));
    const labels = normalizeExchanges(sources({ products }), "en-US")[0]!.exchanges[0]!.products.map((entry) => entry.limitResetLabel);
    expect(labels).toEqual(["", "daily", "weekly", "monthly"]);
    const unlimited = normalizeExchanges(sources({ products: [product({ resetType: 4, limitCount: 0 })] }), "en-US")[0]!.exchanges[0]!.products[0]!;
    expect(unlimited.limitResetLabel).toBe("");
  });

  test("empty shops and categories are dropped; orphan products are ignored", () => {
    const categories = normalizeExchanges(sources({ products: [product({ id: 21 }), product({ id: 99, exchangeId: 404 })] }), "en-US");
    expect(categories.map((category) => category.id)).toEqual([1]);
    expect(categories[0]!.exchanges[0]!.products.map((entry) => entry.id)).toEqual([21]);
  });
});

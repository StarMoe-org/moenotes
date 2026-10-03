import { describe, expect, test } from "bun:test";
import {
  biliPayPrices,
  formatShopPrice,
  normalizeShops,
  orderShopPrices,
  shopLimitKind,
  shopPaymentKind,
  toShopSummary,
  type RawShop,
  type ShopSources,
} from "../src/lib/shop/data";

const shop = (over: Partial<RawShop>): RawShop => ({
  id: 1, nameTextId: "Shop_Name_1", type: 1, descriptionTextId: "Shop_Description_1", paymentType: 16, price: 3000, resetType: 1,
  limitConsumeCount: 0, priority: 1, startAt: "2026/9/1 0:00", endAt: "", vipRank: 0, playerRank: 0, isRecommendBadge: false,
  thumbnailAsset: "shop_thumb_00002", ...over,
});

function sources(over: Partial<ShopSources> = {}): ShopSources {
  return {
    shops: [
      shop({ id: 1000000101, nameTextId: "Shop_Name_1000000101", priority: 5 }),
      shop({ id: 60000002, nameTextId: "Shop_Name_60000002", paymentType: 12, price: 100, resetType: 3, limitConsumeCount: 1, priority: 2, vipRank: 2, thumbnailAsset: "vip_thumb_60000002" }),
      shop({ id: 70000001, nameTextId: "Shop_Name_70000001", paymentType: 13, price: 400, limitConsumeCount: 1, priority: 3, thumbnailAsset: "" }),
      shop({ id: 30, nameTextId: "", descriptionTextId: "Shop_Description_30", paymentType: 15, price: 0, resetType: 2, limitConsumeCount: 3, priority: 4 }),
    ],
    products: [
      { id: 1, shopId: 1000000101, resourceType: 1, resourceId: 2, resourceCount: 120, isBonus: false },
      { id: 2, shopId: 70000001, resourceType: 1, resourceId: 39, resourceCount: 1, isBonus: true },
      { id: 3, shopId: 70000001, resourceType: 1, resourceId: 1, resourceCount: 400, isBonus: false },
    ],
    biliPay: [{ id: 1000000101, twd: 3000, hkd: 800, usd: 99, krw: 140000 }],
    items: [
      { id: 1, type: 12, group: 0, name: "Star", desc: "", imagePath: "Item/common/item_icon_star", orderNum: 1, searchText: "" },
      { id: 2, type: 13, group: 0, name: "Star (Paid)", desc: "", imagePath: "Item/common/item_icon_star_purchase", orderNum: 2, searchText: "" },
    ],
    texts: [
      { id: "Shop_Name_1000000101", english: "Star ×120" },
      { id: "Shop_Name_60000002", english: "Song Ticket ×10" },
      { id: "Shop_Name_70000001", english: "[Rank 1] T.G.W CARD Pack" },
      { id: "Shop_Description_30", english: "Watch an ad" },
    ] as ShopSources["texts"],
    resolve: (resource) => ({ kind: "item", id: resource.resourceId, count: resource.resourceCount, name: `item ${resource.resourceId}`, imageUrl: "" }),
    ...over,
  };
}

describe("shop payment and limits", () => {
  test("payment types map to stars, paid stars, ads and real money", () => {
    expect(shopPaymentKind(12)).toBe("star");
    expect(shopPaymentKind(13)).toBe("paidStar");
    expect(shopPaymentKind(15)).toBe("ad");
    expect(shopPaymentKind(16)).toBe("money");
    expect(shopPaymentKind(99)).toBe("other");
  });

  test("limit kinds follow the shared reset enum; an unreset limit is once and for all", () => {
    expect(shopLimitKind(1, 0)).toBe("unlimited");
    expect(shopLimitKind(1, 1)).toBe("once");
    expect(shopLimitKind(2, 3)).toBe("daily");
    expect(shopLimitKind(3, 1)).toBe("weekly");
    expect(shopLimitKind(4, 1)).toBe("monthly");
  });
});

describe("shop prices", () => {
  test("MasterShopBiliPay columns are minor units", () => {
    expect(biliPayPrices({ id: 1, twd: 3000, hkd: 800, usd: 99, krw: 140000 })).toEqual([
      { currency: "usd", amount: 0.99 },
      { currency: "twd", amount: 30 },
      { currency: "hkd", amount: 8 },
      { currency: "krw", amount: 1400 },
    ]);
  });

  test("each locale reads its own storefront first", () => {
    const prices = biliPayPrices({ id: 1, twd: 3000, hkd: 800, usd: 99, krw: 140000 });
    expect(orderShopPrices(prices, "zh-TW").map((price) => price.currency)).toEqual(["twd", "hkd", "usd", "krw"]);
    expect(orderShopPrices(prices, "ko-KR").map((price) => price.currency)).toEqual(["krw", "usd", "twd", "hkd"]);
    expect(orderShopPrices(prices, "zh-CN").map((price) => price.currency)).toEqual(["usd", "twd", "hkd", "krw"]);
    expect(orderShopPrices(prices, "en-US")[0]!.currency).toBe("usd");
  });

  test("formats with fixed storefront symbols and drops whole cents", () => {
    expect(formatShopPrice({ currency: "usd", amount: 0.99 }, "en-US")).toBe("US$0.99");
    expect(formatShopPrice({ currency: "twd", amount: 30 }, "zh-TW")).toBe("NT$30");
    expect(formatShopPrice({ currency: "krw", amount: 1400 }, "ko-KR")).toBe("\u20a91,400");
    expect(formatShopPrice({ currency: "jpy", amount: 10000 }, "ja-JP")).toBe("\u00a510,000");
  });
});

describe("shop normalization", () => {
  test("orders packs by priority and prices each by its payment", () => {
    const shops = normalizeShops(sources(), "en-US");
    expect(shops.map((entry) => entry.id)).toEqual([60000002, 70000001, 30, 1000000101]);
    const [ticket, vipPack, ad, stars] = shops;
    expect(ticket!.payment).toMatchObject({ kind: "star", amount: 100, currency: { id: 1, name: "Star" }, prices: [] });
    expect(ticket!.limitKind).toBe("weekly");
    expect(ticket!.vipRank).toBe(2);
    expect(vipPack!.payment).toMatchObject({ kind: "paidStar", amount: 400, currency: { id: 2 } });
    expect(ad!.payment).toMatchObject({ kind: "ad", amount: 0, currency: null });
    expect(stars!.payment.kind).toBe("money");
    expect(stars!.payment.prices).toHaveLength(4);
    expect(stars!.sortPrice).toBe(0.99);
  });

  test("thumbnails come from Shop/ItemThumbnail, else the first product; a nameless pack takes its description", () => {
    const shops = normalizeShops(sources(), "en-US");
    expect(shops.find((entry) => entry.id === 1000000101)!.thumbnailUrl).toContain("Shop/ItemThumbnail/shop_thumb_00002/shop_thumb_00002.webp");
    expect(shops.find((entry) => entry.id === 30)!.name).toBe("Watch an ad");
    expect(shops.find((entry) => entry.id === 30)!.description).toBe("");
  });

  test("products list the regular grants before the bonus ones", () => {
    const pack = normalizeShops(sources(), "en-US").find((entry) => entry.id === 70000001)!;
    expect(pack.products.map((product) => [product.reward.id, product.isBonus])).toEqual([[1, false], [39, true]]);
  });

  test("a server without MasterShopBiliPay prices real money in its own currency", () => {
    const shops = normalizeShops(sources({ biliPay: [], nativeCurrency: "jpy" }), "ja-JP");
    expect(shops.find((entry) => entry.id === 1000000101)!.payment.prices).toEqual([{ currency: "jpy", amount: 3000 }]);
    const none = normalizeShops(sources({ biliPay: [] }), "ja-JP");
    expect(none.find((entry) => entry.id === 1000000101)!.payment.prices).toEqual([]);
  });

  test("a pack selling a pass links to the pass's rewards page", () => {
    const shops = normalizeShops(sources({
      products: [{ id: 9, shopId: 1000000101, resourceType: 6, resourceId: 3, resourceCount: 1, isBonus: false }],
      passes: new Map([["monthly-pass-3", { title: "Premium Pass", bannerUrl: "banner" }]]),
    }), "en-US");
    const reward = shops.find((entry) => entry.id === 1000000101)!.products[0]!.reward;
    expect(reward).toMatchObject({ name: "Premium Pass", imageUrl: "banner", link: { routeId: "rewards", detailId: "monthly-pass-3" } });
  });

  test("summaries drop the description and products", () => {
    const summary = toShopSummary(normalizeShops(sources(), "en-US")[0]!);
    expect("products" in summary).toBe(false);
    expect("description" in summary).toBe(false);
  });
});

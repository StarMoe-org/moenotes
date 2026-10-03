import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { exchangeLimitReset } from "@/lib/exchange/data";
import { getItemIconUrl } from "@/lib/items/assets";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { passRewardSlug } from "@/lib/rewards/data";
import type { RawResource, RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

/**
 * The cash shop: MasterShop (one row per pack, its price and limits), MasterShopProduct (what a pack hands out) and
 * MasterShopBiliPay (the international servers' storefront prices of the real-money packs, joined on the pack id).
 * MasterShopTrigger is empty on every server and left out.
 */
export interface RawShop {
  id: number;
  nameTextId: string;
  type: number;
  descriptionTextId: string;
  /** What the pack is paid in: a MasterItem `_type` (12 stars, 13 paid stars, 15 an ad) or 16, real money. */
  paymentType: number;
  /** In the currency of `paymentType`; for real money the server's own minor units (JP: yen). */
  price: number;
  resetType: number;
  /** 0 = unlimited. */
  limitConsumeCount: number;
  priority: number;
  startAt: string;
  endAt: string;
  /** T.G.W CARD rank the pack needs (0 = none). */
  vipRank: number;
  playerRank: number;
  isRecommendBadge: boolean;
  /** Bare sprite name under `Shop/ItemThumbnail/`. */
  thumbnailAsset: string;
}

export interface RawShopProduct {
  id: number;
  shopId: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
  isBonus: boolean;
}

/** Storefront prices in minor units (cents); JP has no such table. */
export interface RawShopBiliPay {
  id: number;
  twd: number;
  hkd: number;
  usd: number;
  krw: number;
}

export type ShopPaymentKind = "money" | "star" | "paidStar" | "ad" | "other";
/** How often a pack's purchase limit refills; "once" is a limit that never resets. */
export type ShopLimitKind = "unlimited" | "once" | "daily" | "weekly" | "monthly";
/** Lowercase ISO 4217 codes of the storefront prices the tables carry. */
export type ShopCurrencyCode = "usd" | "twd" | "hkd" | "krw" | "jpy";

export interface ShopPrice {
  currency: ShopCurrencyCode;
  /** In major units (30 = NT$30, 0.99 = US$0.99). */
  amount: number;
}

export interface ShopPayment {
  kind: ShopPaymentKind;
  /** Stars (or any in-game currency) a purchase costs; 0 for real money and ads. */
  amount: number;
  /** The in-game currency's item (name and icon); null for real money. */
  currency: { id: number; name: string; imageUrl: string } | null;
  /** Real-money prices per storefront, in no particular order (see orderShopPrices). Empty for other kinds. */
  prices: ShopPrice[];
}

export interface ShopProductViewModel {
  id: number;
  reward: RewardViewModel;
  isBonus: boolean;
}

export interface ShopSummaryViewModel {
  id: number;
  /** MasterShop `_type`: 1 star packs, 2 packs, 3 monthly passes, 4 mission passes, 6 T.G.W CARD catalog. */
  type: number;
  name: string;
  thumbnailUrl: string;
  payment: ShopPayment;
  limitCount: number;
  limitKind: ShopLimitKind;
  vipRank: number;
  playerRank: number;
  startAt: string;
  endAt: string;
  recommended: boolean;
  /** One number to order packs by price: stars for in-game currencies, US dollars (or yen) for real money. */
  sortPrice: number;
  /** The first few things the pack hands out, for list previews. */
  highlights: RewardViewModel[];
  searchText: string;
}

export interface ShopDetailViewModel extends ShopSummaryViewModel {
  description: string;
  products: ShopProductViewModel[];
}

export interface ShopSources {
  shops: RawShop[];
  products: RawShopProduct[];
  biliPay: RawShopBiliPay[];
  items: ItemViewModel[];
  texts: RawText[];
  resolve: RewardResolver;
  /** The server's season and monthly passes by reward slug, so packs selling one (resourceType 10 / 6) link to it. */
  passes?: ReadonlyMap<string, { title: string; bannerUrl: string }>;
  /**
   * The storefront currency of `MasterShop._price` on a server without MasterShopBiliPay (JP: yen, whole units).
   * Null when the server's real-money prices come only from MasterShopBiliPay.
   */
  nativeCurrency?: ShopCurrencyCode | null;
}

// MasterShop._paymentType: MasterItem `_type` of the currency, or real money (16).
const PAYMENT_KIND_BY_TYPE: Record<number, ShopPaymentKind> = { 12: "star", 13: "paidStar", 15: "ad", 16: "money" };
const HIGHLIGHT_LIMIT = 4;

export function shopPaymentKind(paymentType: number): ShopPaymentKind {
  return PAYMENT_KIND_BY_TYPE[paymentType] ?? "other";
}

export function shopLimitKind(resetType: number, limitCount: number): ShopLimitKind {
  if (limitCount <= 0) return "unlimited";
  return exchangeLimitReset(resetType, limitCount) || "once";
}

/** MasterShopBiliPay columns are minor units (×100), the won column included. */
export function biliPayPrices(row: RawShopBiliPay): ShopPrice[] {
  const prices: ShopPrice[] = [
    { currency: "usd", amount: row.usd / 100 },
    { currency: "twd", amount: row.twd / 100 },
    { currency: "hkd", amount: row.hkd / 100 },
    { currency: "krw", amount: row.krw / 100 },
  ];
  return prices.filter((price) => Number.isFinite(price.amount) && price.amount > 0);
}

// The storefront currencies a locale's readers pay in, shown first; every other currency follows in this base order.
const BASE_CURRENCY_ORDER: readonly ShopCurrencyCode[] = ["usd", "jpy", "twd", "hkd", "krw"];
const LEADING_CURRENCIES: Partial<Record<string, readonly ShopCurrencyCode[]>> = {
  "zh-TW": ["twd", "hkd"],
  "ko-KR": ["krw"],
  "ja-JP": ["jpy"],
};

/** Prices in the order a locale reads them: its own storefront first (zh-TW: TWD, HKD; ko-KR: KRW), then USD and the rest. */
export function orderShopPrices(prices: readonly ShopPrice[], locale: AppLocale): ShopPrice[] {
  const leading = LEADING_CURRENCIES[locale] ?? [];
  const rank = (code: ShopCurrencyCode) => {
    const lead = leading.indexOf(code);
    return lead >= 0 ? lead : leading.length + BASE_CURRENCY_ORDER.indexOf(code);
  };
  return [...prices].sort((a, b) => rank(a.currency) - rank(b.currency));
}

/**
 * Fixed storefront symbols rather than the locale's own: zh-TW writes TWD as a bare "$" and en-US writes USD the same
 * way, which inside one line of several prices cannot be told apart. Digits follow the locale.
 */
const CURRENCY_SYMBOLS: Record<ShopCurrencyCode, string> = { usd: "US$", twd: "NT$", hkd: "HK$", krw: "₩", jpy: "¥" };

/** A storefront price with the locale's digits; whole amounts drop their cents (NT$30, US$0.99, ₩1,400). */
export function formatShopPrice(price: ShopPrice, locale: AppLocale): string {
  const digits = Number.isInteger(price.amount) ? 0 : 2;
  const figure = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(price.amount);
  return `${CURRENCY_SYMBOLS[price.currency] ?? `${price.currency.toUpperCase()} `}${figure}`;
}

function groupBy<T, K>(rows: readonly T[], key: (row: T) => K): Map<K, T[]> {
  const groups = new Map<K, T[]>();
  for (const row of rows) {
    const value = key(row);
    const group = groups.get(value);
    if (group) group.push(row);
    else groups.set(value, [row]);
  }
  return groups;
}

function sortPriceOf(payment: ShopPayment): number {
  if (payment.kind !== "money") return payment.amount;
  const reference = payment.prices.find((price) => price.currency === "usd") ?? payment.prices[0];
  return reference?.amount ?? 0;
}

/** Every pack of a server, in the game's own order (priority, then id). */
export function normalizeShops(sources: ShopSources, locale: AppLocale): ShopDetailViewModel[] {
  // A pass the shared resolver does not know: named and linked from the server's reward entries.
  const resolve = (resource: RawResource): RewardViewModel => {
    const slug = passRewardSlug(resource.resourceType, resource.resourceId);
    const pass = slug ? sources.passes?.get(slug) : undefined;
    if (!slug || !pass) return sources.resolve(resource);
    return { kind: "other", id: resource.resourceId, count: resource.resourceCount, name: pass.title, imageUrl: pass.bannerUrl, link: { routeId: "rewards", detailId: slug } };
  };
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));
  const text = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");
  const productsByShop = groupBy(sources.products, (product) => product.shopId);
  const biliPay = new Map(sources.biliPay.map((row) => [row.id, row]));
  const currencyByType = new Map<number, ItemViewModel>();
  for (const item of [...sources.items].sort((a, b) => a.id - b.id)) if (!currencyByType.has(item.type)) currencyByType.set(item.type, item);

  return [...sources.shops]
    .filter((shop) => Number.isSafeInteger(shop.id) && shop.id > 0)
    .sort((a, b) => a.priority - b.priority || a.id - b.id)
    .map((shop): ShopDetailViewModel => {
      const kind = shopPaymentKind(shop.paymentType);
      const currencyItem = kind === "money" ? undefined : currencyByType.get(shop.paymentType);
      const storefront = biliPay.get(shop.id);
      const prices = kind !== "money"
        ? []
        : storefront
          ? biliPayPrices(storefront)
          : sources.nativeCurrency && shop.price > 0 ? [{ currency: sources.nativeCurrency, amount: shop.price }] : [];
      const payment: ShopPayment = {
        kind,
        amount: kind === "money" || kind === "ad" ? 0 : Math.max(0, shop.price),
        currency: currencyItem ? { id: currencyItem.id, name: currencyItem.name, imageUrl: getItemIconUrl(currencyItem.imagePath, locale) } : null,
        prices,
      };
      const products = (productsByShop.get(shop.id) ?? [])
        .sort((a, b) => Number(a.isBonus) - Number(b.isBonus) || a.id - b.id)
        .map((product) => ({ id: product.id, reward: resolve(product), isBonus: Boolean(product.isBonus) }));
      const name = text(shop.nameTextId) || text(shop.descriptionTextId) || `#${shop.id}`;
      const description = text(shop.descriptionTextId);
      const thumbnailUrl = shop.thumbnailAsset && shop.thumbnailAsset !== "null"
        ? getImageAssetUrl(`Shop/ItemThumbnail/${shop.thumbnailAsset}`, locale)
        : products[0]?.reward.imageUrl ?? "";
      return {
        id: shop.id,
        type: shop.type,
        name,
        description: description === name ? "" : description,
        thumbnailUrl,
        payment,
        limitCount: Math.max(0, shop.limitConsumeCount),
        limitKind: shopLimitKind(shop.resetType, shop.limitConsumeCount),
        vipRank: Math.max(0, shop.vipRank),
        playerRank: Math.max(0, shop.playerRank),
        startAt: shop.startAt === "null" ? "" : shop.startAt,
        endAt: shop.endAt === "null" ? "" : shop.endAt,
        recommended: Boolean(shop.isRecommendBadge),
        sortPrice: sortPriceOf(payment),
        highlights: products.slice(0, HIGHLIGHT_LIMIT).map((product) => product.reward),
        searchText: [name, description, ...products.map((product) => product.reward.name), shop.id].join(" ").toLocaleLowerCase(),
        products,
      };
    });
}

export function toShopSummary(shop: ShopDetailViewModel): ShopSummaryViewModel {
  const { id, type, name, thumbnailUrl, payment, limitCount, limitKind, vipRank, playerRank, startAt, endAt, recommended, sortPrice, highlights, searchText } = shop;
  return { id, type, name, thumbnailUrl, payment, limitCount, limitKind, vipRank, playerRank, startAt, endAt, recommended, sortPrice, highlights, searchText };
}

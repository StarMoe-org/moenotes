import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawText } from "@/lib/cards/data";
import { getItemIconUrl } from "@/lib/items/assets";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RewardResolver, RewardViewModel } from "@/lib/rewards/resources";

/**
 * One shop of a category. The currency is the shop's: every product of it is paid in `paymentResourceType`/`Id`
 * (an item, type 1; or a gacha's own points, type 7, whose id is the gacha's).
 *
 * `targetDisplay`/`targetDisplayId` (the screen the shop is reached from) are left alone: their ids do not reliably
 * name an entity (exchange 19 shows 2/64 while no gacha 64 exists), so the event and gacha a shop belongs to are
 * read from its currency instead (see ExchangeSources.events/gachas).
 */
export interface RawExchange {
  id: number;
  nameTextId: string;
  exchangeCategoryId: number;
  paymentResourceType: number;
  paymentResourceId: number;
  startAt: string;
  endAt: string;
  bannerAsset: string;
}

export interface RawExchangeCategory {
  id: number;
  nameTextId: string;
  displayTargetId: number;
  displayOrder: number;
  hasSubCategory: boolean;
  isMusicShop: boolean;
  isRankMatch: boolean;
  bannerAsset: string;
}

export interface RawExchangeProduct {
  id: number;
  exchangeId: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
  /** The cost, in the currency of the product's exchange. */
  paymentResourceCount: number;
  limitCount: number;
  resetType: number;
  paymentSteps: number[];
  paymentStepResourceCounts: number[];
  isRecommended: boolean;
  thumbnailAsset: string;
  startAt: string;
  endAt: string;
}

/** The limit's reset period ("" when the limit never resets, or there is no limit). */
export type ExchangeLimitReset = "" | "daily" | "weekly" | "monthly";

export interface ExchangeProductViewModel {
  id: number;
  /** What the product hands out (name, icon, count and the page that shows it), as every reward list shows it. */
  reward: RewardViewModel;
  /** The price, in the currency of the product's exchange (ExchangeDetailViewModel.currency). */
  price: number;
  /**
   * Prices of successive exchanges when they rise with the count (MasterData `paymentSteps`): from the exchange
   * count `steps[i].from` on, one costs `steps[i].price`. Empty when every exchange costs `price`.
   */
  priceSteps: Array<{ from: number; price: number }>;
  /** 0 = unlimited. */
  limitCount: number;
  limitReset: ExchangeLimitReset;
  isRecommended: boolean;
  startAt: string;
  endAt: string;
}

/** What a shop's products are paid in. */
export interface ExchangeCurrency {
  /** Empty when the resource is unknown. */
  name: string;
  imageUrl: string;
  /** The item's page on this site (an item currency); gacha points have none of their own. */
  link?: { routeId: string };
}

/** The event or gacha a shop belongs to: its points (type 7) or the event's own item. */
export interface ExchangeRelation {
  kind: "event" | "gacha";
  id: number;
  name: string;
}

export interface ExchangeSummaryViewModel {
  id: number;
  categoryId: number;
  name: string;
  /** The shop's own banner (an event chapter, a gacha, `Exchange/Banner/…`, all 420×180); empty when it has none. */
  bannerUrl: string;
  currency: ExchangeCurrency;
  /** Opening window; empty on the side the shop leaves open. */
  startAt: string;
  endAt: string;
  productCount: number;
}

export interface ExchangeDetailViewModel extends Omit<ExchangeSummaryViewModel, "productCount"> {
  categoryName: string;
  /** The category's tile (`Exchange/Category/<name>`): a portrait 356×446 card. */
  categoryIconUrl: string;
  relation: ExchangeRelation | null;
  products: ExchangeProductViewModel[];
  /** What clearing every limited product once costs (products without a limit are left out: they never run out). */
  limitedTotal: number;
  /** Whether some limit resets, so limitedTotal is per reset period rather than once and for all. */
  limitedTotalResets: boolean;
}

export interface ExchangeCategoryViewModel {
  id: number;
  name: string;
  /** The category's tile (`Exchange/Category/<name>`): a portrait 356×446 card, not a banner. */
  iconUrl: string;
  displayOrder: number;
  exchanges: ExchangeSummaryViewModel[];
}

export interface ExchangeSources {
  exchanges: RawExchange[];
  categories: RawExchangeCategory[];
  products: RawExchangeProduct[];
  /** Currencies of type 1. */
  items: ItemViewModel[];
  /** Events, to name the one whose event item a shop takes. */
  events: Array<{ id: number; name: string; eventItemId: number }>;
  /** Gachas, to name the one whose points a shop takes. */
  gachas: Array<{ id: number; name: string }>;
  texts: RawText[];
  /** Resolves the products: the reward lists' resolver (items, cards, support cards, songs, stamps, titles, …). */
  resolve: RewardResolver;
}

export interface NormalizedExchanges {
  categories: ExchangeCategoryViewModel[];
  details: ExchangeDetailViewModel[];
}

/**
 * The limit's reset period. MasterExchangeProduct and MasterShop share the enum: 1 never resets; 2/3/4 are the
 * daily/weekly/monthly limits the game words as `Shop_Warning_Get{Daily,Weekly,Monthly}` (daily drinks are 2, the
 * star-seal shop's monthly tickets are 4).
 */
export function exchangeLimitReset(resetType: number, limitCount: number): ExchangeLimitReset {
  if (limitCount === 0) return "";
  switch (resetType) {
    case 2: return "daily";
    case 3: return "weekly";
    case 4: return "monthly";
    default: return "";
  }
}

/**
 * Stepped prices: `paymentSteps` are the exchange counts from which `paymentStepResourceCounts` apply. Every table
 * so far leaves both empty; a malformed pair (lengths differ) is ignored rather than guessed.
 */
function priceSteps(product: RawExchangeProduct): Array<{ from: number; price: number }> {
  const counts = product.paymentSteps ?? [];
  const prices = product.paymentStepResourceCounts ?? [];
  if (!counts.length || counts.length !== prices.length) return [];
  return counts.map((from, index) => ({ from, price: prices[index]! })).sort((a, b) => a.from - b.from);
}

/** What `limit` exchanges of a product cost, its stepped prices included. */
function limitCost(product: ExchangeProductViewModel): number {
  if (!product.priceSteps.length) return product.price * product.limitCount;
  let total = 0;
  for (let count = 1; count <= product.limitCount; count += 1) {
    const step = [...product.priceSteps].reverse().find((entry) => count >= entry.from);
    total += step ? step.price : product.price;
  }
  return total;
}

/** A gacha's points (payment resource type 7) are named by the game's `gacha_point` text and share one icon. */
const ITEM_RESOURCE_TYPE = 1;
const GACHA_POINT_RESOURCE_TYPE = 7;
const GACHA_POINT_TEXT_ID = "gacha_point";
const GACHA_POINT_ICON = "Gacha/Icon/GachaPoint";

export function normalizeExchanges(sources: ExchangeSources, locale: AppLocale): NormalizedExchanges {
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));
  const text = (id: string) => localizeMasterText(textMap.get(id), locale);
  const items = new Map(sources.items.map((item) => [item.id, item]));
  const gachas = new Map(sources.gachas.map((gacha) => [gacha.id, gacha]));
  // An event's own item pays for its exchange; the newest event names an item a re-run reuses.
  const eventByItem = new Map<number, { id: number; name: string }>();
  for (const event of [...sources.events].sort((a, b) => a.id - b.id)) {
    if (event.eventItemId > 0) eventByItem.set(event.eventItemId, { id: event.id, name: event.name });
  }

  // A shop's currency: an item (type 1), or a gacha's own points (type 7). Other types have no known source.
  const currencyOf = (exchange: RawExchange): ExchangeCurrency => {
    if (exchange.paymentResourceType === GACHA_POINT_RESOURCE_TYPE) {
      return { name: text(GACHA_POINT_TEXT_ID), imageUrl: getImageAssetUrl(GACHA_POINT_ICON, locale) };
    }
    if (exchange.paymentResourceType === ITEM_RESOURCE_TYPE) {
      const item = items.get(exchange.paymentResourceId);
      return item ? { name: item.name, imageUrl: getItemIconUrl(item.imagePath, locale), link: { routeId: "items" } } : { name: "", imageUrl: "" };
    }
    return { name: "", imageUrl: "" };
  };

  const relationOf = (exchange: RawExchange): ExchangeRelation | null => {
    if (exchange.paymentResourceType === GACHA_POINT_RESOURCE_TYPE) {
      const gacha = gachas.get(exchange.paymentResourceId);
      return gacha ? { kind: "gacha", id: gacha.id, name: gacha.name } : null;
    }
    if (exchange.paymentResourceType === ITEM_RESOURCE_TYPE) {
      const event = eventByItem.get(exchange.paymentResourceId);
      return event ? { kind: "event", ...event } : null;
    }
    return null;
  };

  const productsByExchange = new Map<number, RawExchangeProduct[]>();
  for (const product of sources.products) {
    const list = productsByExchange.get(product.exchangeId);
    if (list) list.push(product);
    else productsByExchange.set(product.exchangeId, [product]);
  }
  const categoriesById = new Map(sources.categories.map((category) => [category.id, category]));
  const categoryIcon = (category: RawExchangeCategory) =>
    category.bannerAsset ? getImageAssetUrl(`Exchange/Category/${category.bannerAsset}`, locale) : "";
  const categoryName = (category: RawExchangeCategory) => text(category.nameTextId) || `#${category.id}`;

  const details: ExchangeDetailViewModel[] = [];
  const summariesByCategory = new Map<number, ExchangeSummaryViewModel[]>();
  for (const exchange of [...sources.exchanges].sort((a, b) => a.id - b.id)) {
    const category = categoriesById.get(exchange.exchangeCategoryId);
    const rawProducts = productsByExchange.get(exchange.id) ?? [];
    // A shop without a category or products is not shown in the game either.
    if (!category || rawProducts.length === 0) continue;

    const products = [...rawProducts].sort((a, b) => a.id - b.id).map((product): ExchangeProductViewModel => {
      const reward = sources.resolve({ resourceType: product.resourceType, resourceId: product.resourceId, resourceCount: product.resourceCount });
      return {
        id: product.id,
        reward: product.thumbnailAsset ? { ...reward, imageUrl: getImageAssetUrl(product.thumbnailAsset, locale) } : reward,
        price: product.paymentResourceCount,
        priceSteps: priceSteps(product),
        limitCount: product.limitCount,
        limitReset: exchangeLimitReset(product.resetType, product.limitCount),
        isRecommended: product.isRecommended,
        startAt: product.startAt,
        endAt: product.endAt,
      };
    });
    const limited = products.filter((product) => product.limitCount > 0);
    const name = text(exchange.nameTextId) || `#${exchange.id}`;
    const shared = {
      id: exchange.id,
      categoryId: category.id,
      name,
      bannerUrl: exchange.bannerAsset ? getImageAssetUrl(exchange.bannerAsset, locale) : "",
      currency: currencyOf(exchange),
      startAt: exchange.startAt,
      endAt: exchange.endAt,
    };
    details.push({
      ...shared,
      categoryName: categoryName(category),
      categoryIconUrl: categoryIcon(category),
      relation: relationOf(exchange),
      products,
      limitedTotal: limited.reduce((sum, product) => sum + limitCost(product), 0),
      limitedTotalResets: limited.some((product) => product.limitReset !== ""),
    });
    const summary: ExchangeSummaryViewModel = { ...shared, productCount: products.length };
    const list = summariesByCategory.get(category.id);
    if (list) list.push(summary);
    else summariesByCategory.set(category.id, [summary]);
  }

  const categories = [...sources.categories]
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    .flatMap((category): ExchangeCategoryViewModel[] => {
      const exchanges = summariesByCategory.get(category.id) ?? [];
      return exchanges.length ? [{ id: category.id, name: categoryName(category), iconUrl: categoryIcon(category), displayOrder: category.displayOrder, exchanges }] : [];
    });
  return { categories, details };
}

/**
 * The site search's blob of a shop: its, its category's, its currency's and its products' names, so a card or song
 * finds the shops it is sold in. Built for the search index only; the pages do not carry it.
 */
export function exchangeSearchText(exchange: ExchangeDetailViewModel): string {
  return [exchange.name, exchange.categoryName, exchange.currency.name, exchange.relation?.name, ...exchange.products.map((product) => product.reward.name), exchange.id]
    .filter(Boolean).join(" ").toLocaleLowerCase();
}

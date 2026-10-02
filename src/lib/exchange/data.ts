import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import { getCardThumbnailUrl } from "@/lib/cards/assets";
import type { CardViewModel, RawText } from "@/lib/cards/data";
import type { DegreeViewModel } from "@/lib/degrees/data";
import { getItemIconUrl } from "@/lib/items/assets";
import type { ItemViewModel } from "@/lib/items/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MusicViewModel } from "@/lib/music/data";
import type { RewardResolver } from "@/lib/rewards/resources";
import type { StampViewModel } from "@/lib/stamps/data";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

export interface RawExchange {
  id: number;
  nameTextId: string;
  categoryId: number;
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
  /** The cost in the exchange's currency; the currency itself is an item row where the table names it. */
  paymentResourceType?: number;
  paymentResourceId?: number;
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

export interface ExchangeProductViewModel {
  id: number;
  exchangeId: number;
  /** Localized name of the item the product hands out; empty when the resource is unknown. */
  resourceName: string;
  resourceImageUrl: string;
  resourceCount: number;
  paymentResourceCount: number;
  /** Localized name of the currency the product costs. */
  paymentResourceName: string;
  paymentResourceImageUrl: string;
  /** 0 = unlimited. */
  limitCount: number;
  limitResetLabel: string;
  isRecommended: boolean;
  startAt: string;
  endAt: string;
}

export interface ExchangeViewModel {
  id: number;
  name: string;
  products: ExchangeProductViewModel[];
}

export interface ExchangeCategoryViewModel {
  id: number;
  name: string;
  bannerUrl: string;
  displayOrder: number;
  isMusicShop: boolean;
  isRankMatch: boolean;
  exchanges: ExchangeViewModel[];
}

export interface ExchangeSources {
  exchanges: RawExchange[];
  categories: RawExchangeCategory[];
  products: RawExchangeProduct[];
  items: ItemViewModel[];
  cards: CardViewModel[];
  supportCards: SupportCardViewModel[];
  music: MusicViewModel[];
  stamps: StampViewModel[];
  degrees: DegreeViewModel[];
  texts: RawText[];
  resolve: RewardResolver;
}

function normalizeLimitResetLabel(resetType: number, limitCount: number): string {
  if (limitCount === 0) return "";
  switch (resetType) {
    case 2: return "daily";
    case 3: return "weekly";
    case 4: return "monthly";
    default: return "";
  }
}

export function normalizeExchanges(sources: ExchangeSources, locale: AppLocale): ExchangeCategoryViewModel[] {
  const textMap = new Map(sources.texts.map((row) => [row.id, row]));
  const text = (id: string) => localizeMasterText(textMap.get(id), locale);
  const items = new Map(sources.items.map((item) => [item.id, item]));
  const cards = new Map(sources.cards.map((card) => [card.id, card]));
  const supportCards = new Map(sources.supportCards.map((card) => [card.id, card]));
  const music = new Map(sources.music.map((song) => [song.id, song]));
  const stamps = new Map(sources.stamps.map((stamp) => [stamp.id, stamp]));
  const degrees = new Map(sources.degrees.map((degree) => [degree.id, degree]));

  const resolveResource = (resourceType: number, resourceId: number): { name: string; imageUrl: string } => {
    switch (resourceType) {
      case 1: {
        const item = items.get(resourceId);
        return item ? { name: item.name, imageUrl: getItemIconUrl(item.imagePath, locale) } : { name: "", imageUrl: "" };
      }
      case 2: {
        const card = cards.get(resourceId);
        return card ? { name: `${card.characterName} · ${card.title}`, imageUrl: getCardThumbnailUrl(card.assetId) } : { name: "", imageUrl: "" };
      }
      case 3: {
        const card = supportCards.get(resourceId);
        return card ? { name: `${card.name} · ${card.title}`, imageUrl: getSupportCardThumbnailUrl(card.assetId) } : { name: "", imageUrl: "" };
      }
      case 8: {
        const song = music.get(resourceId);
        return song ? { name: song.title, imageUrl: song.jacketUrl } : { name: "", imageUrl: "" };
      }
      case 9: {
        const stamp = stamps.get(resourceId);
        return stamp ? { name: stamp.name, imageUrl: stamp.imageUrl } : { name: "", imageUrl: "" };
      }
      case 17: {
        const degree = degrees.get(resourceId);
        return degree ? { name: degree.name, imageUrl: degree.imageUrl } : { name: "", imageUrl: "" };
      }
      default: {
        // Fall back to the reward resolver for unknown/other resource types (spots, etc.).
        const reward = sources.resolve({ resourceType, resourceId, resourceCount: 1 });
        return { name: reward.name, imageUrl: reward.imageUrl };
      }
    }
  };

  // Index products by their exchange, exchanges by their category.
  const productsByExchange = new Map<number, RawExchangeProduct[]>();
  for (const product of sources.products) {
    const list = productsByExchange.get(product.exchangeId);
    if (list) list.push(product);
    else productsByExchange.set(product.exchangeId, [product]);
  }
  const exchangesByCategory = new Map<number, RawExchange[]>();
  for (const exchange of sources.exchanges) {
    const list = exchangesByCategory.get(exchange.categoryId);
    if (list) list.push(exchange);
    else exchangesByCategory.set(exchange.categoryId, [exchange]);
  }

  return sources.categories
    .slice()
    .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id)
    .map((category) => {
      const exchanges = (exchangesByCategory.get(category.id) ?? [])
        .slice()
        .sort((a, b) => a.id - b.id)
        .map((exchange): ExchangeViewModel => {
          const products = (productsByExchange.get(exchange.id) ?? [])
            .slice()
            .sort((a, b) => a.id - b.id)
            .map((product): ExchangeProductViewModel => {
              const resource = resolveResource(product.resourceType, product.resourceId);
              // The payment currency resolves through the item table when the row names it as an
              // item (resourceType 1; same rule the reward resolver uses).
              const paymentResourceType = product.paymentResourceType ?? 0;
              const paymentItem = paymentResourceType === 1 && product.paymentResourceId ? items.get(product.paymentResourceId) : undefined;
              const limitResetLabel = normalizeLimitResetLabel(product.resetType, product.limitCount);
              return {
                id: product.id,
                exchangeId: product.exchangeId,
                resourceName: resource.name,
                resourceImageUrl: product.thumbnailAsset
                  ? getImageAssetUrl(product.thumbnailAsset, locale)
                  : resource.imageUrl,
                resourceCount: product.resourceCount,
                paymentResourceCount: product.paymentResourceCount,
                paymentResourceName: paymentItem?.name ?? "",
                paymentResourceImageUrl: paymentItem ? getItemIconUrl(paymentItem.imagePath, locale) : "",
                limitCount: product.limitCount,
                limitResetLabel,
                isRecommended: product.isRecommended,
                startAt: product.startAt,
                endAt: product.endAt,
              };
            });
          return {
            id: exchange.id,
            name: text(exchange.nameTextId) || `#${exchange.id}`,
            products,
          };
        })
        .filter((exchange) => exchange.products.length > 0);
      return {
        id: category.id,
        name: text(category.nameTextId) || `#${category.id}`,
        bannerUrl: category.bannerAsset ? getImageAssetUrl(`Image/Banner/${category.bannerAsset}`, locale) : "",
        displayOrder: category.displayOrder,
        isMusicShop: category.isMusicShop,
        isRankMatch: category.isRankMatch,
        exchanges,
      } satisfies ExchangeCategoryViewModel;
    })
    .filter((category) => category.exchanges.length > 0);
}

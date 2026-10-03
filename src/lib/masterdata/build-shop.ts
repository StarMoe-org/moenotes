import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import { itemsOn, rewardEntriesOn, rewardResolverOn } from "@/lib/masterdata/build-data";
import { detailNeighbors, type DetailNeighbors } from "@/lib/route/detail-neighbors";
import type { ServerFaceted, ServerFacetedValue } from "@/lib/servers/facets";
import { shopPath } from "@/lib/shop/links";
import {
  normalizeShops,
  toShopSummary,
  type RawShop,
  type RawShopBiliPay,
  type RawShopProduct,
  type ShopCurrencyCode,
  type ShopDetailViewModel,
  type ShopSummaryViewModel,
} from "@/lib/shop/data";

/*
 * The cash shop (MasterShop / MasterShopProduct / MasterShopBiliPay), computed per server and merged by pack id. JP has
 * no MasterShopBiliPay: its real-money packs are priced in yen by MasterShop._price itself.
 */

// The storefront currency of MasterShop._price on a server without MasterShopBiliPay.
const NATIVE_CURRENCY: Partial<Record<GameServer, ShopCurrencyCode>> = { jp: "jpy" };

const empty = <T>() => ({ _allData: [] as T[] });

export function shopsOn(server: GameServer, locale: AppLocale): Promise<ShopDetailViewModel[]> {
  return memo(`shops:${server}:${locale}`, async () => {
    const [shops, products, biliPay, items, textTable, resolve, rewards] = await Promise.all([
      table<RawShop>("MasterShop.json", server).catch(() => empty<RawShop>()),
      table<RawShopProduct>("MasterShopProduct.json", server).catch(() => empty<RawShopProduct>()),
      table<RawShopBiliPay>("MasterShopBiliPay.json", server).catch(() => empty<RawShopBiliPay>()),
      itemsOn(server, locale),
      texts(server),
      rewardResolverOn(server, locale),
      rewardEntriesOn(server, locale),
    ]);
    return normalizeShops({
      shops: shops._allData,
      products: products._allData,
      biliPay: biliPay._allData,
      items,
      texts: textTable._allData,
      resolve,
      passes: new Map(rewards.filter((entry) => entry.kind === "seasonPass" || entry.kind === "monthlyPass").map((entry) => [entry.slug, { title: entry.title, bannerUrl: entry.bannerUrl }])),
      nativeCurrency: biliPay._allData.length ? null : NATIVE_CURRENCY[server] ?? null,
    }, locale);
  });
}

/** Every pack of every server, as the list shows them (products only on the detail pages). */
export function getBuildShops(locale: AppLocale): Promise<ServerFaceted<ShopSummaryViewModel>[]> {
  return mergedList(`shops:${locale}`, async (server) => (await shopsOn(server, locale)).map(toShopSummary), (shop) => shop.id);
}

/** Previous/next pack of each pack page, in the list's default order. */
export function getBuildShopNeighbors(locale: AppLocale): Promise<Map<number, DetailNeighbors>> {
  return memo(`shop-neighbors:${locale}`, async () => detailNeighbors(await getBuildShops(locale), (shop) => shop.id, (shop) => shop.name, (shop) => shopPath(shop.id)));
}

export function getBuildShopDetail(locale: AppLocale, shopId: number): Promise<ServerFacetedValue<ShopDetailViewModel> | null> {
  return mergedValue(`shop-detail:${locale}:${shopId}`, async (server) => (await shopsOn(server, locale)).find((shop) => shop.id === shopId) ?? null);
}

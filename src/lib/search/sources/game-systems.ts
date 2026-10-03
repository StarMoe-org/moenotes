import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { eachServer, perLocaleSearchTexts, primaryTextRows, table, titleRow, toSearchTextRecord } from "@/lib/masterdata/build-core";
import { getBuildRegularMissions } from "@/lib/masterdata/build-missions";
import { getBuildShops } from "@/lib/masterdata/build-shop";
import type { LocalizableMasterText, MasterTextField } from "@/lib/masterdata/localize-text";
import { entityLinkPath } from "@/lib/route/entity-link";
import type { ContentSearchEntry } from "@/lib/search/content-entry";
import type { RawShop } from "@/lib/shop/data";
import { shopPath } from "@/lib/shop/links";

// The MasterText column each core locale's filled-in mission sentence stands in for.
const TITLE_FIELDS: ReadonlyArray<readonly [AppLocale, MasterTextField]> = [
  ["zh-CN", "simplifiedChinese"],
  ["zh-TW", "traditionalChinese"],
  ["ja-JP", "japanese"],
  ["en-US", "english"],
  ["ko-KR", "korean"],
];

/**
 * Shop packs (`/shop/:id`) and regular missions (`/missions?mode=regular&id=`). Monthly passes are reward entries and
 * come with the built-in reward search. A pack's title is its MasterText name row (the first server's that has the
 * pack); a mission's is its description with the placeholders filled, one sentence per core language.
 */
export async function gameSystemSearchEntries(): Promise<ContentSearchEntry[]> {
  const rows = await primaryTextRows();
  const entries: ContentSearchEntry[] = [];

  const [shopTables, shops, shopSearchTexts] = await Promise.all([
    eachServer((server) => table<RawShop>("MasterShop.json", server).catch(() => ({ _allData: [] as RawShop[] }))),
    getBuildShops(DEFAULT_LOCALE),
    perLocaleSearchTexts(getBuildShops, (shop) => shop.id),
  ]);
  const shopNameIds = new Map<number, string>();
  for (const [, rawShops] of shopTables) {
    for (const shop of rawShops._allData) if (!shopNameIds.has(shop.id)) shopNameIds.set(shop.id, shop.nameTextId || shop.descriptionTextId);
  }
  for (const shop of shops) {
    entries.push({
      key: `shop:${shop.id}`,
      kind: "shop",
      href: shopPath(shop.id),
      title: titleRow(rows, shopNameIds.get(shop.id)),
      searchText: toSearchTextRecord(shopSearchTexts.get(String(shop.id))),
    });
  }

  const titles = new Map<number, LocalizableMasterText>();
  const searchTexts = new Map<number, Partial<Record<AppLocale, string>>>();
  await Promise.all(TITLE_FIELDS.map(async ([locale, field]) => {
    for (const category of await getBuildRegularMissions(locale)) {
      for (const mission of category.missions) {
        const title = titles.get(mission.id) ?? { id: `mission:${mission.id}` };
        title[field] ??= mission.description;
        titles.set(mission.id, title);
        const texts = searchTexts.get(mission.id) ?? {};
        texts[locale] ??= `${mission.description} ${mission.id}`.toLocaleLowerCase();
        searchTexts.set(mission.id, texts);
      }
    }
  }));
  for (const [id, title] of [...titles].sort(([a], [b]) => a - b)) {
    entries.push({
      key: `mission:${id}`,
      kind: "mission",
      href: entityLinkPath({ routeId: "missions", query: { mode: "regular", id: String(id) } }),
      title,
      searchText: searchTexts.get(id) ?? {},
    });
  }
  return entries;
}

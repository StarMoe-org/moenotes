import { DEFAULT_LOCALE } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { perLocaleSearchTexts, primaryTextRows, table, titleRow, toSearchTextRecord } from "@/lib/masterdata/build-core";
import { getBuildItemSummaries } from "@/lib/masterdata/build-item-sources";
import type { RawItem } from "@/lib/items/data";
import { entityLinkPath } from "@/lib/route/entity-link";
import type { ContentSearchEntry } from "@/lib/search/content-entry";

/** Items (`/items/:id`): title is the item's name, matching also covers its description. */
export async function itemSearchEntries(): Promise<ContentSearchEntry[]> {
  const [rows, rawItems, items, searchTexts] = await Promise.all([
    primaryTextRows(),
    table<RawItem>("MasterItem.json", PRIMARY_SERVER).catch(() => ({ _allData: [] as RawItem[] })),
    getBuildItemSummaries(DEFAULT_LOCALE),
    perLocaleSearchTexts(getBuildItemSummaries, (item) => item.id),
  ]);
  const nameIds = new Map(rawItems._allData.map((item) => [item.id, item.nameTextId]));
  return items.map((item) => ({
    key: `item:${item.id}`,
    kind: "item",
    href: entityLinkPath({ routeId: "items", detailId: item.id }),
    title: nameIds.has(item.id) ? titleRow(rows, nameIds.get(item.id)) : { english: item.name },
    searchText: toSearchTextRecord(searchTexts.get(String(item.id))),
  }));
}

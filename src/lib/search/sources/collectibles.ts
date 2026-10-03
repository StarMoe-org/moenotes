import { DEFAULT_LOCALE, type AppLocale } from "@/config/locales";
import { PRIMARY_SERVER, type GameServer } from "@/config/servers";
import { getBuildBackgrounds, getBuildComics, getBuildDegrees, getBuildStamps } from "@/lib/masterdata/build-data";
import { getBuildHelpTopics } from "@/lib/masterdata/build-help";
import { eachServer, perLocaleSearchTexts, primaryTextRows, table, titleRow, toSearchTextRecord } from "@/lib/masterdata/build-core";
import type { ContentSearchEntry, ContentSearchKind } from "@/lib/search/content-entry";
import { helpTopicPath } from "@/lib/help/paths";
import { entityLinkPath } from "@/lib/route/entity-link";
import type { LocalizableMasterText } from "@/lib/masterdata/localize-text";
import type { ServerFaceted } from "@/lib/servers/facets";
import { stripInventoryTag } from "@/lib/degrees/data";

/*
 * Site search entries of the collectibles (titles, stickers, comics, backgrounds) and the manual topics. The
 * collectibles have no pages of their own: their hrefs open the list's detail overlay (`/stamps?id=3`).
 */

interface NamedRow { id: number; nameTextId?: string; titleTextId?: string }

/** MasterText name ids by entity id, every server's table (the first server's id where they differ). */
async function nameIds(file: string, field: "nameTextId" | "titleTextId"): Promise<Map<number, string>> {
  const tables = await eachServer((server: GameServer) => table<NamedRow>(file, server).catch(() => ({ _allData: [] as NamedRow[] })));
  const ids = new Map<number, string>();
  for (const [, rows] of tables) for (const row of rows._allData) if (!ids.has(row.id) && row[field]) ids.set(row.id, row[field]!);
  return ids;
}

/** A title without a MasterText row (comics): the default locale's name, which is all the list shows either. */
const plainTitle = (text: string): LocalizableMasterText => ({ simplifiedChinese: text, english: text });

async function collectibleEntries<VM extends { id: number; name: string; searchText: string }>(
  kind: ContentSearchKind,
  routeId: string,
  load: (locale: AppLocale) => Promise<Array<ServerFaceted<VM>>>,
  title: (item: VM) => LocalizableMasterText,
): Promise<ContentSearchEntry[]> {
  const [items, searchTexts] = await Promise.all([load(DEFAULT_LOCALE), perLocaleSearchTexts(load, (item) => item.id)]);
  return items.map((item) => ({
    key: `${kind}:${item.id}`,
    kind,
    href: entityLinkPath({ routeId, query: { id: String(item.id) } }),
    title: title(item),
    searchText: toSearchTextRecord(searchTexts.get(String(item.id))),
  }));
}

export async function loadCollectibleSearchEntries(): Promise<ContentSearchEntry[]> {
  const rows = await primaryTextRows();
  const [degreeNames, stampNames, backgroundNames] = await Promise.all([
    nameIds("MasterDegree.json", "nameTextId"),
    nameIds("MasterStamp.json", "nameTextId"),
    nameIds("MasterBackground.json", "nameTextId"),
  ]);
  // Titles and backgrounds carry an inventory tag in MasterText ("[Sticker] …") that their lists strip; so does the
  // search, in every language cell.
  const rowOrName = (textId: string | undefined, name: string): LocalizableMasterText => {
    const row = titleRow(rows, textId);
    if (!row.id) return plainTitle(name);
    return Object.fromEntries(Object.entries(row).map(([field, value]) => [field, field !== "id" && typeof value === "string" ? stripInventoryTag(value) : value]));
  };
  const [titles, stamps, comics, backgrounds, help] = await Promise.all([
    collectibleEntries("title", "titles", getBuildDegrees, (item) => rowOrName(degreeNames.get(item.id), item.name)),
    collectibleEntries("stamp", "stamps", getBuildStamps, (item) => rowOrName(stampNames.get(item.id), item.name)),
    collectibleEntries("comic", "comics", getBuildComics, (item) => plainTitle(item.name)),
    collectibleEntries("background", "backgrounds", getBuildBackgrounds, (item) => rowOrName(backgroundNames.get(item.id), item.name)),
    helpEntries(rows),
  ]);
  return [...titles, ...stamps, ...comics, ...backgrounds, ...help];
}

async function helpEntries(rows: Awaited<ReturnType<typeof primaryTextRows>>): Promise<ContentSearchEntry[]> {
  const [topics, searchTexts, subCategories] = await Promise.all([
    getBuildHelpTopics(DEFAULT_LOCALE),
    perLocaleSearchTexts(getBuildHelpTopics, (topic) => topic.id),
    table<NamedRow>("MasterHelpSubCategory.json", PRIMARY_SERVER).catch(() => ({ _allData: [] as NamedRow[] })),
  ]);
  const titleIds = new Map(subCategories._allData.map((row) => [row.id, row.titleTextId]));
  return topics.map((topic) => {
    const row = titleRow(rows, titleIds.get(topic.id));
    return {
      key: `help:${topic.id}`,
      kind: "help" as const,
      href: helpTopicPath(topic.id),
      title: row.id ? row : plainTitle(topic.title),
      searchText: toSearchTextRecord(searchTexts.get(String(topic.id))),
    };
  });
}

import { getBuildMasterData } from "@/lib/masterdata/build-snapshot";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { validateMasterTable } from "@/lib/cards/data";
import type { RouteStaticParamConfig } from "@/types/route";
import { DEFAULT_LOCALE } from "@/config/locales";

type TableDetailKind = "cards" | "support-cards" | "characters" | "music" | "gacha" | "events";
/** Detail kinds whose ids come from a list the build computes rather than one table. */
type DetailKind = TableDetailKind | "exchange" | "items" | "shop";
interface DetailRow { id: number; rarity?: number; cardType?: number }
const tables: Record<TableDetailKind, string> = {
  cards: "MasterMemberCard.json",
  "support-cards": "MasterSupportCard.json",
  characters: "MasterCharacter.json",
  music: "MasterLiveMusic.json",
  gacha: "MasterGacha.json",
  events: "MasterEvent.json",
};

export function detailParamsFromRows(kind: DetailKind, rows: DetailRow[]): RouteStaticParamConfig[] {
  return [...new Set(rows.filter((row) => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) return false;
    // Match the supported cards shown by the list/detail normalizers.
    if (kind !== "cards" && kind !== "support-cards") return true;
    const rarities = kind === "support-cards" ? [2, 3, 4, 10] : [2, 3, 4, 20];
    return rarities.includes(row.rarity ?? 0) && [1, 2, 3, 4, 5].includes(row.cardType ?? 0);
  }).map((row) => row.id))].sort((a, b) => a - b).map((id) => ({
    params: { id: String(id) }, breadcrumbDetail: { label: `#${id}` },
  }));
}

/**
 * Rows of a table on every server of the build: a detail page exists for an entity any server has. `optional` tables
 * (newer ones some server lacks or serves broken) count as empty on that server instead of failing the build.
 */
async function rowsOfEveryServer<T>(file: string, optional = false): Promise<T[]> {
  const servers = await getBuildServers();
  const tablesByServer = await Promise.all(servers.map((server) => {
    const loaded = getBuildMasterData(file, validateMasterTable<T>, server);
    return optional ? loaded.catch(() => ({ _allData: [] as T[] })) : loaded;
  }));
  return tablesByServer.flatMap((table) => table._allData);
}

export async function getMasterdataDetailParams(kind: TableDetailKind): Promise<RouteStaticParamConfig[]> {
  return detailParamsFromRows(kind, await rowsOfEveryServer<DetailRow>(tables[kind]));
}

export async function getMasterdataStoryParams(): Promise<RouteStaticParamConfig[]> {
  const { getBuildStories } = await import("@/lib/masterdata/build-data");
  const stories = await getBuildStories(DEFAULT_LOCALE);
  return [...new Set(stories.map((story) => story.advId))]
    .filter((id) => Number.isSafeInteger(id) && id > 0)
    .sort((a, b) => a - b)
    .map((id) => ({ params: { id: String(id) }, breadcrumbDetail: { label: `ADV ${id}` } }));
}

/**
 * Exchange shops any server lists: the normalizer's shops rather than MasterExchange's rows, since a shop without a
 * category or products (the arena's before its first season) is not shown and has no page.
 */
export async function getMasterdataExchangeParams(): Promise<RouteStaticParamConfig[]> {
  const { getBuildExchangeSummaries } = await import("@/lib/masterdata/build-data");
  const exchanges = await getBuildExchangeSummaries(DEFAULT_LOCALE);
  return detailParamsFromRows("exchange", exchanges.map((exchange) => ({ id: exchange.id })));
}

/** Cash shop packs any server sells (MasterShop of every server), for `/shop/:id`. */
export async function getMasterdataShopParams(): Promise<RouteStaticParamConfig[]> {
  return detailParamsFromRows("shop", await rowsOfEveryServer<{ id: number }>("MasterShop.json", true));
}

/** Season passes, monthly passes, limited mission groups and login bonuses share the rewards detail route. */
export async function getMasterdataRewardParams(): Promise<RouteStaticParamConfig[]> {
  const { rewardEntrySlug } = await import("@/lib/rewards/data");
  const sources = [
    ["seasonPass", "MasterSeasonPass.json"],
    ["monthlyPass", "MasterMonthlyPass.json"],
    ["mission", "MasterLimitedMissionGroup.json"],
    ["loginBonus", "MasterLoginBonus.json"],
  ] as const;
  const params: RouteStaticParamConfig[] = [];
  for (const [kind, file] of sources) {
    // Monthly passes are a newer table: a server without it (or with a broken copy) adds no pages.
    const rows = await rowsOfEveryServer<{ id: number }>(file, kind === "monthlyPass");
    for (const id of [...new Set(rows.map((row) => row.id))].filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b)) {
      const slug = rewardEntrySlug(kind, id);
      params.push({ params: { id: slug }, breadcrumbDetail: { label: slug } });
    }
  }
  return params;
}

/** Items any server's MasterItem has (`/items/:id`). */
export async function getMasterdataItemParams(): Promise<RouteStaticParamConfig[]> {
  return detailParamsFromRows("items", await rowsOfEveryServer<DetailRow>("MasterItem.json"));
}

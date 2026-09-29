import { getBuildMasterData } from "@/lib/masterdata/build-snapshot";
import { getBuildServers } from "@/lib/masterdata/build-servers";
import { validateMasterTable } from "@/lib/cards/data";
import type { RouteStaticParamConfig } from "@/types/route";
import { DEFAULT_LOCALE } from "@/config/locales";

type DetailKind = "cards" | "support-cards" | "characters" | "music" | "gacha";
interface DetailRow { id: number; rarity?: number; cardType?: number }
const tables: Record<DetailKind, string> = {
  cards: "MasterMemberCard.json",
  "support-cards": "MasterSupportCard.json",
  characters: "MasterCharacter.json",
  music: "MasterLiveMusic.json",
  gacha: "MasterGacha.json",
};

export function detailParamsFromRows(kind: DetailKind, rows: DetailRow[]): RouteStaticParamConfig[] {
  return [...new Set(rows.filter((row) => {
    if (!Number.isSafeInteger(row.id) || row.id <= 0) return false;
    // Match the supported cards shown by the list/detail normalizers.
    if (kind !== "cards" && kind !== "support-cards") return true;
    const rarities = kind === "support-cards" ? [2, 3, 4, 10] : [2, 3, 4];
    return rarities.includes(row.rarity ?? 0) && [1, 2, 3, 4, 5].includes(row.cardType ?? 0);
  }).map((row) => row.id))].sort((a, b) => a - b).map((id) => ({
    params: { id: String(id) }, breadcrumbDetail: { label: `#${id}` },
  }));
}

/** Rows of a table on every server of the build: a detail page exists for an entity any server has. */
async function rowsOfEveryServer<T>(file: string): Promise<T[]> {
  const servers = await getBuildServers();
  const tablesByServer = await Promise.all(servers.map((server) => getBuildMasterData(file, validateMasterTable<T>, server)));
  return tablesByServer.flatMap((table) => table._allData);
}

export async function getMasterdataDetailParams(kind: DetailKind): Promise<RouteStaticParamConfig[]> {
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

/** Season passes, limited mission groups and login bonuses share the rewards detail route. */
export async function getMasterdataRewardParams(): Promise<RouteStaticParamConfig[]> {
  const { rewardEntrySlug } = await import("@/lib/rewards/data");
  const sources = [
    ["seasonPass", "MasterSeasonPass.json"],
    ["mission", "MasterLimitedMissionGroup.json"],
    ["loginBonus", "MasterLoginBonus.json"],
  ] as const;
  const params: RouteStaticParamConfig[] = [];
  for (const [kind, file] of sources) {
    const rows = await rowsOfEveryServer<{ id: number }>(file);
    for (const id of [...new Set(rows.map((row) => row.id))].filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b)) {
      const slug = rewardEntrySlug(kind, id);
      params.push({ params: { id: slug }, breadcrumbDetail: { label: slug } });
    }
  }
  return params;
}

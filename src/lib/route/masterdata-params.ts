import { getBuildMasterData } from "@/lib/masterdata/build-snapshot";
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

export async function getMasterdataDetailParams(kind: DetailKind): Promise<RouteStaticParamConfig[]> {
  const table = await getBuildMasterData(tables[kind], validateMasterTable<DetailRow>);
  return detailParamsFromRows(kind, table._allData);
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
    const table = await getBuildMasterData(file, validateMasterTable<{ id: number }>);
    for (const id of [...new Set(table._allData.map((row) => row.id))].filter((id) => Number.isSafeInteger(id) && id > 0).sort((a, b) => a - b)) {
      const slug = rewardEntrySlug(kind, id);
      params.push({ params: { id: slug }, breadcrumbDetail: { label: slug } });
    }
  }
  return params;
}

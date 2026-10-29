import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import {
  normalizeArenaCatalog,
  type ArenaCatalogViewModel,
  type RawArenaLeague,
  type RawArenaLeagueRegulation,
  type RawArenaRank,
  type RawArenaRewardRow,
  type RawArenaSeason,
} from "@/lib/arena/data";
import type { MasterTable, RawBand } from "@/lib/cards/data";
import { eachServer, memo, table, texts } from "@/lib/masterdata/build-core";
import { musicOn, rewardResolverOn } from "@/lib/masterdata/build-data";

function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  return table<T>(path, server).catch(() => ({ _allData: [] as T[] }));
}

export function arenaCatalogOn(server: GameServer, locale: AppLocale): Promise<ArenaCatalogViewModel> {
  return memo(`arena-catalog:${server}:${locale}`, async () => {
    const seasons = await optionalTable<RawArenaSeason>("MasterArenaSeason.json", server);
    if (seasons._allData.length === 0) {
      return { seasons: [] };
    }
    const [leagues, regulations, ranks, dailyRewards, seasonRewards, promotionRewards, bands, songs, textTable, resolveReward] =
      await Promise.all([
        optionalTable<RawArenaLeague>("MasterArenaLeague.json", server),
        optionalTable<RawArenaLeagueRegulation>("MasterArenaLeagueRegulation.json", server),
        optionalTable<RawArenaRank>("MasterArenaRank.json", server),
        optionalTable<RawArenaRewardRow>("MasterArenaDailyReward.json", server),
        optionalTable<RawArenaRewardRow>("MasterArenaSeasonReward.json", server),
        optionalTable<RawArenaRewardRow>("MasterArenaPromotionReward.json", server),
        optionalTable<RawBand>("MasterBand.json", server),
        musicOn(server, locale),
        texts(server),
        rewardResolverOn(server, locale),
      ]);
    return normalizeArenaCatalog({
      seasons: seasons._allData,
      leagues: leagues._allData,
      regulations: regulations._allData,
      ranks: ranks._allData,
      dailyRewards: dailyRewards._allData,
      seasonRewards: seasonRewards._allData,
      promotionRewards: promotionRewards._allData,
      bands: bands._allData,
      songs,
      texts: textTable._allData,
      resolveReward,
      locale,
    });
  });
}

export function getBuildArenaCatalogs(locale: AppLocale): Promise<Partial<Record<GameServer, ArenaCatalogViewModel>>> {
  return memo(`arena-catalogs:${locale}`, async () => {
    const entries = await eachServer((server) => arenaCatalogOn(server, locale));
    return Object.fromEntries(entries) as Partial<Record<GameServer, ArenaCatalogViewModel>>;
  });
}

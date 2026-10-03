import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import { rewardResolverOn } from "@/lib/masterdata/build-data";
import type { ServerFacetedValue } from "@/lib/servers/facets";
import {
  normalizeTgwCard,
  type RawVip,
  type RawVipDailyPoint,
  type RawVipDailyReward,
  type RawVipRankBonus,
  type RawVipRankUpReward,
  type TgwCardViewModel,
} from "@/lib/vip/data";

/* T.G.W CARD (MasterVip*), per server; a server without the tables has no ladder (null). */

const empty = <T>() => ({ _allData: [] as T[] });

export function tgwCardOn(server: GameServer, locale: AppLocale): Promise<TgwCardViewModel | null> {
  return memo(`tgw-card:${server}:${locale}`, async () => {
    const [vips, dailyRewards, rankUpRewards, bonuses, dailyPoints, textTable, resolve] = await Promise.all([
      table<RawVip>("MasterVip.json", server).catch(() => empty<RawVip>()),
      table<RawVipDailyReward>("MasterVipDailyReward.json", server).catch(() => empty<RawVipDailyReward>()),
      table<RawVipRankUpReward>("MasterVipRankUpReward.json", server).catch(() => empty<RawVipRankUpReward>()),
      table<RawVipRankBonus>("MasterVipRankBonus.json", server).catch(() => empty<RawVipRankBonus>()),
      table<RawVipDailyPoint>("MasterVipDailyPoint.json", server).catch(() => empty<RawVipDailyPoint>()),
      texts(server),
      rewardResolverOn(server, locale),
    ]);
    if (!vips._allData.length) return null;
    return normalizeTgwCard({
      vips: vips._allData,
      dailyRewards: dailyRewards._allData,
      rankUpRewards: rankUpRewards._allData,
      bonuses: bonuses._allData,
      dailyPoints: dailyPoints._allData,
      texts: textTable._allData,
    }, resolve, locale);
  });
}

export function getBuildTgwCard(locale: AppLocale): Promise<ServerFacetedValue<TgwCardViewModel> | null> {
  return mergedValue(`tgw-card:${locale}`, (server) => tgwCardOn(server, locale));
}

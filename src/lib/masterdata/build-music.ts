import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import { rewardResolverOn } from "@/lib/masterdata/build-data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MasterTable } from "@/lib/cards/data";
import type { RawLiveMusicCategory, RawMusic } from "@/lib/music/data";
import {
  buildComboTiers,
  buildExpRewards,
  type MusicComboTiersModel,
  type MusicExpRewardsModel,
  type RawLiveMusicComboReward,
  type RawLiveMusicExpReward,
} from "@/lib/music/live-rewards";
import type { ServerFaceted, ServerFacetedValue } from "@/lib/servers/facets";

/*
 * Music selectors added for the song pages (combo tiers, exp rewards, categories). Each is computed per server and
 * merged like the rest of the catalog; tables some server serves broken (kr's MasterLiveMusicComboReward) read as empty.
 */

async function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  try {
    return await table<T>(path, server);
  } catch {
    return { _allData: [] };
  }
}

/** Per song: the combo tier rewards of its reward group and the exp reward ladder every song shares. */
export interface MusicLiveExtras {
  comboTiers: MusicComboTiersModel[];
  expRewards: MusicExpRewardsModel;
}

export function musicLiveExtrasOn(server: GameServer, locale: AppLocale, songId: number): Promise<MusicLiveExtras | null> {
  return memo(`music-extras:${server}:${locale}:${songId}`, async () => {
    const [rawMusic, comboRows, expRows, resolve] = await Promise.all([
      table<RawMusic>("MasterLiveMusic.json", server),
      optionalTable<RawLiveMusicComboReward>("MasterLiveMusicComboReward.json", server),
      optionalTable<RawLiveMusicExpReward>("MasterLiveMusicExpReward.json", server),
      rewardResolverOn(server, locale),
    ]);
    const raw = rawMusic._allData.find((entry) => entry.id === songId);
    if (!raw) return null;
    return {
      comboTiers: buildComboTiers(comboRows._allData, raw.comboRewardGroup, resolve),
      expRewards: buildExpRewards(expRows._allData),
    };
  });
}

export function getBuildMusicLiveExtras(locale: AppLocale, songId: number): Promise<ServerFacetedValue<MusicLiveExtras> | null> {
  return mergedValue(`music-extras:${locale}:${songId}`, (server) => musicLiveExtrasOn(server, locale, songId));
}

/** A MasterLiveMusicCategory with its localized name. */
export interface MusicCategoryOption {
  id: number;
  name: string;
}

export function musicCategoriesOn(server: GameServer, locale: AppLocale): Promise<MusicCategoryOption[]> {
  return memo(`music-categories:${server}:${locale}`, async () => {
    const [categories, textTable] = await Promise.all([
      optionalTable<RawLiveMusicCategory>("MasterLiveMusicCategory.json", server),
      texts(server),
    ]);
    const textMap = new Map(textTable._allData.map((entry) => [entry.id, entry]));
    return categories._allData.map((category) => ({
      id: category.id,
      name: localizeMasterText(textMap.get(category.textKey), locale) || `#${category.id}`,
    }));
  });
}

export function getBuildMusicCategories(locale: AppLocale): Promise<ServerFaceted<MusicCategoryOption>[]> {
  return mergedList(`music-categories:${locale}`, (server) => musicCategoriesOn(server, locale), (category) => category.id);
}

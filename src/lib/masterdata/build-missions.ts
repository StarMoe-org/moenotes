import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { RawBand, RawCharacter } from "@/lib/cards/data";
import { memo, mergedList, table, texts } from "@/lib/masterdata/build-core";
import { musicOn, rewardEntriesOn, rewardResolverOn } from "@/lib/masterdata/build-data";
import { normalizeRegularMissions, type MissionCategoryViewModel, type RawMission } from "@/lib/missions/data";
import type { RawLimitedMission, RawRewardRow, RewardEntrySummary } from "@/lib/rewards/data";
import type { ServerFaceted } from "@/lib/servers/facets";

/*
 * The missions page: MasterMission by category, and the limited mission groups (whose own pages are the rewards
 * detail pages). Computed per server and merged by id.
 */

const empty = <T>() => ({ _allData: [] as T[] });

export function regularMissionsOn(server: GameServer, locale: AppLocale): Promise<MissionCategoryViewModel[]> {
  return memo(`regular-missions:${server}:${locale}`, async () => {
    const [missions, missionRewards, resolve, music, textTable, exchanges, chapters, episodes, advs, bands, characters] = await Promise.all([
      table<RawMission>("MasterMission.json", server).catch(() => empty<RawMission>()),
      table<RawRewardRow>("MasterMissionReward.json", server).catch(() => empty<RawRewardRow>()),
      rewardResolverOn(server, locale),
      musicOn(server, locale),
      texts(server),
      table<{ id: number; nameTextId: string }>("MasterExchange.json", server),
      table<{ id: number; nameTextId: string }>("MasterStoryChapter.json", server),
      table<{ id: number; episodeNumber: number; advId: number }>("MasterStoryEpisode.json", server),
      table<{ id: number; titleTextId: string }>("MasterAdv.json", server),
      table<RawBand>("MasterBand.json", server),
      table<RawCharacter>("MasterCharacter.json", server),
    ]);
    return normalizeRegularMissions({
      missions: missions._allData,
      missionRewards: missionRewards._allData,
      exchanges: exchanges._allData,
      chapters: chapters._allData,
      episodes: episodes._allData,
      advs: advs._allData,
      bands: bands._allData,
      characters: characters._allData,
      music: music.map((song) => ({ id: song.id, title: song.title })),
      texts: textTable._allData,
    }, resolve, locale);
  });
}

/** Every server's mission categories, merged by category id (each category's missions as that server has them). */
export function getBuildRegularMissions(locale: AppLocale): Promise<ServerFaceted<MissionCategoryViewModel>[]> {
  return mergedList(`regular-missions:${locale}`, (server) => regularMissionsOn(server, locale), (category) => category.id);
}

export interface LimitedMissionGroupSummary extends RewardEntrySummary {
  missionCount: number;
  /** MasterLimitedMission ids of the group, so `?mode=limited&id=<mission id>` finds its group. */
  missionIds: number[];
}

function limitedGroupsOn(server: GameServer, locale: AppLocale): Promise<LimitedMissionGroupSummary[]> {
  return memo(`limited-mission-groups:${server}:${locale}`, async () => {
    const [entries, missions] = await Promise.all([
      rewardEntriesOn(server, locale),
      table<RawLimitedMission>("MasterLimitedMission.json", server).catch(() => empty<RawLimitedMission>()),
    ]);
    const idsByGroup = new Map<number, number[]>();
    for (const mission of missions._allData) {
      const ids = idsByGroup.get(mission.limitedMissionGroupId) ?? [];
      ids.push(mission.id);
      idsByGroup.set(mission.limitedMissionGroupId, ids);
    }
    return entries
      .filter((entry) => entry.kind === "mission")
      .map((entry) => {
        const missionIds = (idsByGroup.get(entry.id) ?? []).sort((a, b) => a - b);
        return { ...entry, missionCount: missionIds.length, missionIds };
      });
  });
}

export function getBuildLimitedMissionGroups(locale: AppLocale): Promise<ServerFaceted<LimitedMissionGroupSummary>[]> {
  return mergedList(`limited-mission-groups:${locale}`, (server) => limitedGroupsOn(server, locale), (group) => group.id);
}

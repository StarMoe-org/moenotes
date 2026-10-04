import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawCharacter } from "@/lib/cards/data";
import {
  characterFriendshipStories,
  characterPartners,
  characterRelatedStories,
  groupCharacterMissions,
  EMPTY_CHARACTER_EXTRAS,
  type CharacterExtrasData,
  type RawCharacterMission,
} from "@/lib/characters/relations";
import { memo, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import { charactersOn, musicOn, rewardResolverOn, stampsOn, storiesOn, supportCardsOn } from "@/lib/masterdata/build-data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { RawRewardRow } from "@/lib/rewards/data";
import type { RewardViewModel } from "@/lib/rewards/resources";
import type { ServerFacetedValue } from "@/lib/servers/facets";
import type { RawCharacterFriendship } from "@/lib/story/data";

/*
 * The character page's bonds, missions and related sections, per server (src/lib/characters/relations.ts).
 */

const empty = <T>() => ({ _allData: [] as T[] });

/** Character missions and the rewards they hand out: shared by every character of a server. */
function characterMissionsOn(server: GameServer, locale: AppLocale) {
  return memo(`character-missions:${server}:${locale}`, async () => {
    const [missions, rewardRows, textTable, resolve] = await Promise.all([
      table<RawCharacterMission>("MasterCharacterMission.json", server).catch(() => empty<RawCharacterMission>()),
      table<RawRewardRow>("MasterMissionReward.json", server).catch(() => empty<RawRewardRow>()),
      texts(server),
      rewardResolverOn(server, locale),
    ]);
    const textMap = new Map(textTable._allData.map((row) => [row.id, row]));
    const groups = groupCharacterMissions(missions._allData, (id) => localizeMasterText(textMap.get(id), locale));
    const used = new Set(missions._allData.flatMap((mission) => mission.missionRewardIds ?? []));
    const rewards: Record<string, RewardViewModel> = {};
    for (const row of rewardRows._allData) if (used.has(row.id)) rewards[String(row.id)] = resolve(row);
    return { groups, rewards };
  });
}

export function characterExtrasOn(server: GameServer, locale: AppLocale, characterId: number): Promise<CharacterExtrasData | null> {
  return memo(`character-extras:${server}:${locale}:${characterId}`, async () => {
    const [{ characters }, rawCharacters, friendships, stories, supportCards, stamps, music, missions] = await Promise.all([
      charactersOn(server, locale),
      table<RawCharacter>("MasterCharacter.json", server),
      table<RawCharacterFriendship>("MasterCharacterFriendship.json", server).catch(() => empty<RawCharacterFriendship>()),
      storiesOn(server, locale),
      supportCardsOn(server, locale),
      stampsOn(server, locale),
      musicOn(server, locale),
      characterMissionsOn(server, locale),
    ]);
    const character = characters.find((entry) => entry.id === characterId);
    if (!character) return null;

    const pairs = characterPartners(friendships._allData, characterId);
    const bondStories = characterFriendshipStories(stories, pairs.map((pair) => pair.friendshipId));
    const pairBanner = (friendshipId: number): string => {
      const first = bondStories.find((story) => story.friendshipId === friendshipId && story.assets.banner);
      return first ? getImageAssetUrl(`Story/Banner/Episode/${first.assets.banner}`, locale) : "";
    };
    const displayOrder = new Map(rawCharacters._allData.map((entry) => [entry.id, entry.displayOrder]));

    return {
      characters: characters.map((entry) => ({ id: entry.id, name: entry.name, bandId: entry.bandId })),
      partners: pairs
        .map((pair) => ({ ...pair, bannerUrl: pairBanner(pair.friendshipId) }))
        .sort((a, b) => (displayOrder.get(a.partnerId) ?? a.partnerId) - (displayOrder.get(b.partnerId) ?? b.partnerId)),
      friendshipStories: bondStories.map((story) => ({
        advId: story.advId,
        friendshipId: story.friendshipId ?? 0,
        title: story.title,
        episodeNumber: story.episodeNumber,
        unlockLevel: story.unlock.friendshipLevel,
      })),
      supportCards: supportCards.filter((card) => card.characterIds.includes(characterId)),
      stamps: stamps.filter((stamp) => stamp.characterIds.includes(characterId)).map((stamp) => ({ id: stamp.id, name: stamp.name, imageUrl: stamp.imageUrl })),
      stories: characterRelatedStories(stories, characterId).map((story) => ({ advId: story.advId, category: story.category, title: story.title, groupTitle: story.groupTitle })),
      songs: music
        .filter((song) => song.bandId === character.bandId || song.bandIds?.includes(character.bandId))
        .map((song) => ({ id: song.id, title: song.title, jacketUrl: song.jacketUrl })),
      missions: missions.groups,
      missionRewards: missions.rewards,
    };
  });
}

/** The character's extras as every server has them. */
export async function getBuildCharacterExtras(locale: AppLocale, characterId: number): Promise<ServerFacetedValue<CharacterExtrasData>> {
  return await mergedValue(`character-extras:${locale}:${characterId}`, (server) => characterExtrasOn(server, locale, characterId))
    ?? { value: EMPTY_CHARACTER_EXTRAS, servers: [] };
}

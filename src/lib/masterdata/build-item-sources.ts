import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedList, mergedValue, table, texts } from "@/lib/masterdata/build-core";
import {
  bandItemsOn,
  cardsOn,
  eventDetailsOn,
  exchangesOn,
  gachaDetailsOn,
  itemsOn,
  musicOn,
  rewardEntryDetailsOn,
  storiesOn,
} from "@/lib/masterdata/build-data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import type { MasterTable, RawCharacter, RawText } from "@/lib/cards/data";
import type { RawItem, ItemViewModel } from "@/lib/items/data";
import {
  addCharacterMissionSources,
  addCharacterRankSources,
  addEventSources,
  addExchangeSources,
  addFriendshipRankSources,
  addGachaSources,
  addMissionSources,
  addMusicSources,
  addRewardEntrySources,
  addShopSources,
  addStorySources,
  collectItemUsages,
  createItemSourceCollector,
  type ItemSourceEntry,
  type ItemUsageEntry,
  type RawRewardRow,
  type UsageCard,
} from "@/lib/items/sources";
import type { RawResource } from "@/lib/rewards/resources";
import type { RawMusic } from "@/lib/music/data";
import type { ServerFaceted, ServerFacetedValue } from "@/lib/servers/facets";
import { detailNeighbors, type DetailNeighbors } from "@/lib/route/detail-neighbors";
import { entityLinkPath } from "@/lib/route/entity-link";

/*
 * Item detail pages (`/items/:id`): the item's own fields plus where the game hands it out and what it is spent on,
 * read backwards from the reward and upgrade tables (src/lib/items/sources.ts). Computed once per server and locale,
 * merged by id like every detail page (docs/servers.md).
 */

/** A table a server may lack (or serve broken): read as empty rather than failing the build. */
function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  return table<T>(path, server).catch(() => ({ _allData: [] as T[] }));
}

export interface ItemDetailViewModel {
  item: ItemViewModel;
  /** Most the inventory holds (MasterItem max); 0 when unset. */
  max: number;
  /** Phonetic reading of the name (Japanese kana), "" when none or equal to the name. */
  reading: string;
  startAt: string;
  endAt: string;
  sources: ItemSourceEntry[];
  usages: ItemUsageEntry[];
}

interface RawMemberCardUsage {
  id: number;
  characterID: number;
  rarity: number;
  memberCardAwakeResourceGroup: number;
  memberCardRankGroup: number;
  liveSkillLevelResourceGroup: number;
  gekisouSkillLevelResourceGroup: number;
  rankUpItemID: number;
}

interface RawBandRankUpItems {
  id: number;
  rankUpItemIdForRarityR?: number;
  rankUpItemIdForRaritySR?: number;
  rankUpItemIdForRaritySSR?: number;
  rankUpItemIdForRarityBD?: number;
}

/** The band's piece for a member-card rarity (2 R, 3 SR, 4 SSR, 20 birthday). */
export function bandRankUpItemId(band: RawBandRankUpItems | undefined, rarity: number): number {
  if (!band) return 0;
  if (rarity === 2) return band.rankUpItemIdForRarityR ?? 0;
  if (rarity === 3) return band.rankUpItemIdForRaritySR ?? 0;
  if (rarity === 4) return band.rankUpItemIdForRaritySSR ?? 0;
  if (rarity === 20) return band.rankUpItemIdForRarityBD ?? 0;
  return 0;
}

function itemSourcesOn(server: GameServer, locale: AppLocale): Promise<Map<number, ItemSourceEntry[]>> {
  return memo(`item-sources:${server}:${locale}`, async () => {
    const [
      events, exchanges, gachas, rewardEntries, stories, music, textTable,
      characters, friendships, rankRewards, friendshipRewards, characterMissions, missions, missionRewards,
      storyRewards, rewards, rawMusic, shops, shopProducts,
    ] = await Promise.all([
      eventDetailsOn(server, locale).catch(() => []),
      exchangesOn(server, locale).then((value) => value.details).catch(() => []),
      gachaDetailsOn(server, locale).catch(() => []),
      rewardEntryDetailsOn(server, locale).catch(() => []),
      storiesOn(server, locale).catch(() => []),
      musicOn(server, locale).catch(() => []),
      texts(server),
      optionalTable<RawCharacter>("MasterCharacter.json", server),
      optionalTable<{ id: number; masterCharacterIdA: number; masterCharacterIdB: number }>("MasterCharacterFriendship.json", server),
      optionalTable<RawResource & { characterId?: number; characterID?: number }>("MasterCharacterRankReward.json", server),
      optionalTable<RawResource & { characterFriendshipId: number }>("MasterCharacterFriendshipRankReward.json", server),
      optionalTable<{ missionRewardIds?: number[] }>("MasterCharacterMission.json", server),
      optionalTable<{ missionCategory: number; missionRewardIds?: number[] }>("MasterMission.json", server),
      optionalTable<RawRewardRow>("MasterMissionReward.json", server),
      optionalTable<RawResource & { group: number }>("MasterStoryReward.json", server),
      optionalTable<RawRewardRow>("MasterReward.json", server),
      optionalTable<RawMusic>("MasterLiveMusic.json", server),
      optionalTable<{ id: number; nameTextId: string }>("MasterShop.json", server),
      optionalTable<RawResource & { shopId: number }>("MasterShopProduct.json", server),
    ]);
    const textMap = new Map(textTable._allData.map((row: RawText) => [row.id, row]));
    const text = (id: string | undefined) => (id ? localizeMasterText(textMap.get(id), locale) : "");
    const characterNames = new Map(characters._allData.map((character) => [character.id, text(character.nameTextID)]));
    const characterName = (id: number) => characterNames.get(id) ?? "";
    const pairs = new Map(friendships._allData.map((pair) => [pair.id, pair]));
    const pairName = (id: number) => {
      const pair = pairs.get(id);
      return pair ? [characterName(pair.masterCharacterIdA), characterName(pair.masterCharacterIdB)].filter(Boolean).join(" × ") : "";
    };
    const shopNames = new Map(shops._allData.map((shop) => [shop.id, text(shop.nameTextId)]));
    const titles = new Map(music.map((song) => [song.id, song.title]));

    const collector = createItemSourceCollector();
    addEventSources(collector, events);
    addExchangeSources(collector, exchanges);
    addShopSources(collector, shopProducts._allData, (id) => shopNames.get(id) ?? "");
    addGachaSources(collector, gachas);
    addRewardEntrySources(collector, rewardEntries);
    addMissionSources(collector, missions._allData, missionRewards._allData);
    addCharacterMissionSources(collector, characterMissions._allData, missionRewards._allData);
    addCharacterRankSources(collector, rankRewards._allData, characterName);
    addFriendshipRankSources(collector, friendshipRewards._allData, pairName);
    addStorySources(collector, storyRewards._allData, stories);
    addMusicSources(collector, rawMusic._allData.filter((song) => titles.has(song.id)).map((song) => ({
      id: song.id,
      title: titles.get(song.id) ?? "",
      scoreRewardIds: [song.scoreCLiveMusicRewardID, song.scoreBLiveMusicRewardID, song.scoreALiveMusicRewardID, song.scoreSLiveMusicRewardID, song.scoreSSLiveMusicRewardID].filter((id) => id > 0),
      comboRewardIds: [song.comboEasyLiveMusicRewardID, song.comboNormalLiveMusicRewardID, song.comboHardLiveMusicRewardID, song.comboExpertLiveMusicRewardID].filter((id) => id > 0),
    })), rewards._allData);
    return collector.result();
  });
}

function itemUsagesOn(server: GameServer, locale: AppLocale): Promise<Map<number, ItemUsageEntry[]>> {
  return memo(`item-usages:${server}:${locale}`, async () => {
    const [cards, rawCards, characters, bands, awakeResources, skillResources, memberRanks, bandItems] = await Promise.all([
      cardsOn(server, locale),
      optionalTable<RawMemberCardUsage>("MasterMemberCard.json", server),
      optionalTable<{ id: number; bandID: number }>("MasterCharacter.json", server),
      optionalTable<RawBandRankUpItems>("MasterBand.json", server),
      optionalTable<{ group: number; awakeCount: number; itemId: number; count: number }>("MasterMemberCardAwakeResource.json", server),
      optionalTable<{ group: number; level: number; itemID: number; count: number }>("MasterSkillLevelResource.json", server),
      optionalTable<{ group: number; rank: number; requiredRankUpItemCount: number }>("MasterMemberCardRank.json", server),
      bandItemsOn(server, locale).catch(() => []),
    ]);
    const names = new Map(cards.map((card) => [card.id, `${card.characterName} · ${card.title}`]));
    const bandOf = new Map(characters._allData.map((character) => [character.id, character.bandID]));
    const bandById = new Map(bands._allData.map((band) => [band.id, band]));
    const usageCards: UsageCard[] = rawCards._allData.filter((card) => names.has(card.id)).map((card) => ({
      id: card.id,
      name: names.get(card.id) ?? "",
      awakeResourceGroup: card.memberCardAwakeResourceGroup ?? 0,
      rankGroup: card.memberCardRankGroup ?? 0,
      liveSkillResourceGroup: card.liveSkillLevelResourceGroup ?? 0,
      gekisouSkillResourceGroup: card.gekisouSkillLevelResourceGroup ?? 0,
      rankUpItemId: card.rankUpItemID ?? 0,
      bandRankUpItemId: bandRankUpItemId(bandById.get(bandOf.get(card.characterID) ?? 0), card.rarity),
    }));
    return collectItemUsages({
      cards: usageCards,
      awakeResources: awakeResources._allData,
      skillResources: skillResources._allData,
      memberRanks: memberRanks._allData,
      bandItems: bandItems.map((item) => ({ id: item.id, name: item.name, resourceGroupId: item.resourceGroupId })),
    });
  });
}

export function itemDetailsOn(server: GameServer, locale: AppLocale): Promise<ItemDetailViewModel[]> {
  return memo(`item-details:${server}:${locale}`, async () => {
    const [items, rawItems, textTable, sources, usages] = await Promise.all([
      itemsOn(server, locale),
      optionalTable<RawItem & { phoneticNameTextId?: string }>("MasterItem.json", server),
      texts(server),
      itemSourcesOn(server, locale),
      itemUsagesOn(server, locale),
    ]);
    const raw = new Map(rawItems._allData.map((item) => [item.id, item]));
    const textMap = new Map(textTable._allData.map((row: RawText) => [row.id, row]));
    return items.map((item) => {
      const row = raw.get(item.id);
      const reading = row?.phoneticNameTextId ? localizeMasterText(textMap.get(row.phoneticNameTextId), locale) : "";
      return {
        item,
        max: row?.max ?? 0,
        reading: reading && reading !== item.name ? reading : "",
        startAt: row?.startAt ?? "",
        endAt: row?.endAt ?? "",
        sources: sources.get(item.id) ?? [],
        usages: usages.get(item.id) ?? [],
      };
    });
  });
}

/** Every item any server has, in the list page's default order (for neighbors and the search index). */
export function getBuildItemSummaries(locale: AppLocale): Promise<ServerFaceted<ItemViewModel>[]> {
  return mergedList(`item-summaries:${locale}`, (server) => itemsOn(server, locale), (item) => item.id);
}

export function getBuildItemDetail(locale: AppLocale, itemId: number): Promise<ServerFacetedValue<ItemDetailViewModel> | null> {
  return mergedValue(`item-detail:${locale}:${itemId}`, async (server) => (await itemDetailsOn(server, locale)).find((entry) => entry.item.id === itemId) ?? null);
}

/** Previous / next item of every item page, in the list's default order. */
export function getBuildItemNeighbors(locale: AppLocale): Promise<Map<number, DetailNeighbors>> {
  return memo(`item-neighbors:${locale}`, async () => detailNeighbors(
    await getBuildItemSummaries(locale),
    (item) => item.id,
    (item) => item.name,
    (item) => entityLinkPath({ routeId: "items", detailId: item.id }),
  ));
}

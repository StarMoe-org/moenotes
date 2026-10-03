import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { memo, mergedValue, table } from "@/lib/masterdata/build-core";
import { itemsOn, supportCardsOn } from "@/lib/masterdata/build-data";
import { bandRankUpItemId } from "@/lib/masterdata/build-item-sources";
import { soundUrlResolverOn } from "@/lib/masterdata/build-sounds";
import type { MasterTable } from "@/lib/cards/data";
import { getItemIconUrl } from "@/lib/items/assets";
import { getSupportCardThumbnailUrl } from "@/lib/support-cards/assets";
import {
  buildMemberCardMaterials,
  buildSupportCardMaterials,
  type CardMaterialCost,
  type CardMaterials,
  type ItemCostResolver,
} from "@/lib/cards/materials";
import type { ServerFacetedValue } from "@/lib/servers/facets";

/*
 * Card pages' upgrade materials and gacha voice (src/lib/cards/materials.ts), per server and merged like the card
 * detail itself. Kept out of cardDetailOn so the material tables load only for the pages that show them.
 */

function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  return table<T>(path, server).catch(() => ({ _allData: [] as T[] }));
}

function itemCostResolverOn(server: GameServer, locale: AppLocale): Promise<ItemCostResolver> {
  return memo(`item-cost-resolver:${server}:${locale}`, async () => {
    const items = new Map((await itemsOn(server, locale)).map((item) => [item.id, item]));
    return (itemId: number, count: number): CardMaterialCost => {
      const item = items.get(itemId);
      return {
        id: String(itemId),
        name: item?.name || `#${itemId}`,
        imageUrl: item ? getItemIconUrl(item.imagePath, locale) : "",
        count,
        link: { routeId: "items", detailId: itemId },
      };
    };
  });
}

interface RawMemberCardMaterials {
  id: number;
  characterID: number;
  rarity: number;
  memberCardAwakeResourceGroup?: number;
  memberCardRankGroup?: number;
  liveSkillLevelResourceGroup?: number;
  gekisouSkillLevelResourceGroup?: number;
  rankUpItemID?: number;
  gachaVoiceSoundId?: number;
}

export function memberCardMaterialsOn(server: GameServer, locale: AppLocale, cardId: number): Promise<CardMaterials | null> {
  return memo(`card-materials:${server}:${locale}:${cardId}`, async () => {
    const [cards, characters, bands, awakeResources, ranks, skillResources, item, soundUrl] = await Promise.all([
      optionalTable<RawMemberCardMaterials>("MasterMemberCard.json", server),
      optionalTable<{ id: number; bandID: number }>("MasterCharacter.json", server),
      optionalTable<{ id: number; rankUpItemIdForRarityR?: number; rankUpItemIdForRaritySR?: number; rankUpItemIdForRaritySSR?: number; rankUpItemIdForRarityBD?: number }>("MasterBand.json", server),
      optionalTable<{ group: number; awakeCount: number; itemId: number; count: number }>("MasterMemberCardAwakeResource.json", server),
      optionalTable<{ group: number; rank: number; requiredRankUpItemCount: number }>("MasterMemberCardRank.json", server),
      optionalTable<{ group: number; level: number; itemID: number; count: number }>("MasterSkillLevelResource.json", server),
      itemCostResolverOn(server, locale),
      soundUrlResolverOn(server, locale),
    ]);
    const card = cards._allData.find((row) => row.id === cardId);
    if (!card) return null;
    const bandId = characters._allData.find((row) => row.id === card.characterID)?.bandID ?? 0;
    const groups = buildMemberCardMaterials({
      awakeResourceGroup: card.memberCardAwakeResourceGroup ?? 0,
      rankGroup: card.memberCardRankGroup ?? 0,
      liveSkillResourceGroup: card.liveSkillLevelResourceGroup ?? 0,
      gekisouSkillResourceGroup: card.gekisouSkillLevelResourceGroup ?? 0,
      rankUpItemId: card.rankUpItemID ?? 0,
      bandRankUpItemId: bandRankUpItemId(bands._allData.find((band) => band.id === bandId), card.rarity),
    }, { awakeResources: awakeResources._allData, ranks: ranks._allData, skillResources: skillResources._allData }, item);
    return { groups, gachaVoiceUrl: card.gachaVoiceSoundId ? soundUrl(card.gachaVoiceSoundId) : "" };
  });
}

export function getBuildMemberCardMaterials(locale: AppLocale, cardId: number): Promise<ServerFacetedValue<CardMaterials> | null> {
  return mergedValue(`card-materials:${locale}:${cardId}`, (server) => memberCardMaterialsOn(server, locale, cardId));
}

export function supportCardMaterialsOn(server: GameServer, locale: AppLocale, cardId: number): Promise<CardMaterials | null> {
  return memo(`support-card-materials:${server}:${locale}:${cardId}`, async () => {
    const [cards, rawCards, ranks] = await Promise.all([
      supportCardsOn(server, locale),
      optionalTable<{ id: number; supportCardRankGroup?: number }>("MasterSupportCard.json", server),
      optionalTable<{ group: number; rank: number; requiredRankUpItemCount: number }>("MasterSupportCardRank.json", server),
    ]);
    const card = cards.find((row) => row.id === cardId);
    const raw = rawCards._allData.find((row) => row.id === cardId);
    if (!card || !raw) return null;
    const groups = buildSupportCardMaterials(raw.supportCardRankGroup ?? 0, ranks._allData, (count) => ({
      id: `card:${card.id}`,
      name: card.title ? `${card.name} · ${card.title}` : card.name,
      imageUrl: getSupportCardThumbnailUrl(card.assetId),
      count,
      link: { routeId: "support-cards", detailId: card.id },
    }));
    return { groups, gachaVoiceUrl: "" };
  });
}

export function getBuildSupportCardMaterials(locale: AppLocale, cardId: number): Promise<ServerFacetedValue<CardMaterials> | null> {
  return mergedValue(`support-card-materials:${locale}:${cardId}`, (server) => supportCardMaterialsOn(server, locale, cardId));
}

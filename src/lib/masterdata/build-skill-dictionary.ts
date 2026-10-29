import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import type { MasterTable, RawBand, RawCharacter } from "@/lib/cards/data";
import type { CardMaterialCost } from "@/lib/cards/materials";
import type {
  RawSkillCondition,
  RawSkillConditionSet,
  RawSkillCumulativeCondition,
  RawSkillDefinition,
  RawSkillEffect,
  RawSkillIcon,
  RawSkillTarget,
} from "@/lib/cards/skills";
import { getItemIconUrl } from "@/lib/items/assets";
import { eachServer, memo, table, texts } from "@/lib/masterdata/build-core";
import { cardsOn, itemsOn, supportCardsOn } from "@/lib/masterdata/build-data";
import {
  normalizeSkillDictionary,
  type RawMemberSkillResourceRow,
  type SkillDictionaryViewModel,
} from "@/lib/skills/dictionary";

function optionalTable<T>(path: string, server: GameServer): Promise<MasterTable<T>> {
  return table<T>(path, server).catch(() => ({ _allData: [] as T[] }));
}

export function skillDictionaryOn(server: GameServer, locale: AppLocale): Promise<SkillDictionaryViewModel> {
  return memo(`skill-dictionary:${server}:${locale}`, async () => {
    const [
      leaderSkills,
      leaderEffects,
      liveSkills,
      liveEffects,
      gekisouSkills,
      gekisouEffects,
      supportSkills,
      supportEffects,
      gekisouSupportSkills,
      gekisouSupportEffects,
      icons,
      conditionSets,
      conditions,
      cumulativeConditions,
      skillTargets,
      skillResources,
      memberResourceRows,
      characters,
      bands,
      textTable,
      memberCards,
      supportCards,
      items,
    ] = await Promise.all([
      optionalTable<RawSkillDefinition>("MasterLeaderSkill.json", server),
      optionalTable<RawSkillEffect>("MasterLeaderSkillEffect.json", server),
      optionalTable<RawSkillDefinition>("MasterLiveSkill.json", server),
      optionalTable<RawSkillEffect>("MasterLiveSkillEffect.json", server),
      optionalTable<RawSkillDefinition>("MasterGekisouSkill.json", server),
      optionalTable<RawSkillEffect>("MasterGekisouSkillEffect.json", server),
      optionalTable<RawSkillDefinition>("MasterSupportSkill.json", server),
      optionalTable<RawSkillEffect>("MasterSupportSkillEffect.json", server),
      optionalTable<RawSkillDefinition>("MasterGekisouSupportSkill.json", server),
      optionalTable<RawSkillEffect>("MasterGekisouSupportSkillEffect.json", server),
      optionalTable<RawSkillIcon>("MasterSkillIcon.json", server),
      optionalTable<RawSkillConditionSet>("MasterSkillConditionSet.json", server),
      optionalTable<RawSkillCondition>("MasterSkillCondition.json", server),
      optionalTable<RawSkillCumulativeCondition>("MasterSkillCumulativeCondition.json", server),
      optionalTable<RawSkillTarget>("MasterSkillTarget.json", server),
      optionalTable<{ group: number; level: number; itemID: number; count: number }>("MasterSkillLevelResource.json", server),
      optionalTable<RawMemberSkillResourceRow>("MasterMemberCard.json", server),
      optionalTable<RawCharacter>("MasterCharacter.json", server),
      optionalTable<RawBand>("MasterBand.json", server),
      texts(server),
      cardsOn(server, locale),
      supportCardsOn(server, locale),
      itemsOn(server, locale),
    ]);

    const itemMap = new Map(items.map((item) => [item.id, item]));
    const resolveItemCost = (itemId: number, count: number): CardMaterialCost => {
      const item = itemMap.get(itemId);
      return {
        id: String(itemId),
        name: item?.name || `#${itemId}`,
        imageUrl: item ? getItemIconUrl(item.imagePath, locale) : "",
        count,
        link: { routeId: "items", detailId: itemId },
      };
    };

    return normalizeSkillDictionary({
      leaderSkills: leaderSkills._allData,
      leaderEffects: leaderEffects._allData,
      liveSkills: liveSkills._allData,
      liveEffects: liveEffects._allData,
      gekisouSkills: gekisouSkills._allData,
      gekisouEffects: gekisouEffects._allData,
      supportSkills: supportSkills._allData,
      supportEffects: supportEffects._allData,
      gekisouSupportSkills: gekisouSupportSkills._allData,
      gekisouSupportEffects: gekisouSupportEffects._allData,
      icons: icons._allData,
      conditionSets: conditionSets._allData,
      conditions: conditions._allData,
      cumulativeConditions: cumulativeConditions._allData,
      skillTargets: skillTargets._allData,
      skillResources: skillResources._allData,
      memberResourceRows: memberResourceRows._allData,
      characters: characters._allData,
      bands: bands._allData,
      texts: textTable._allData,
      memberCards,
      supportCards,
      resolveItemCost,
      locale,
    });
  });
}

export function getBuildSkillDictionaries(
  locale: AppLocale,
): Promise<Partial<Record<GameServer, SkillDictionaryViewModel>>> {
  return memo(`skill-dictionaries:${locale}`, async () => {
    const entries = await eachServer((server) => skillDictionaryOn(server, locale));
    return Object.fromEntries(entries) as Partial<Record<GameServer, SkillDictionaryViewModel>>;
  });
}

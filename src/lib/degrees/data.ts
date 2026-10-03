import type { AppLocale } from "@/config/locales";
import { getImageAssetUrl } from "@/lib/assets/url";
import type { RawCharacter, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";
import { parseMasterDate } from "@/lib/schedule";

export interface RawDegree {
  id: number;
  nameTextId: string;
  descriptionTextId: string;
  degreeType: number;
  characterIds: number[];
  imagePath: string;
  orderNum: number;
  startAt?: string;
  endAt?: string;
}

/** A character rank reward row (MasterCharacterRankReward); resourceType 17 hands out a title. */
export interface RawDegreeRankReward {
  characterId: number;
  rank: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

/** How a title is obtained, as far as MasterData says: reaching a character rank. */
export interface DegreeUnlock {
  kind: "characterRank";
  characterId: number;
  characterName: string;
  rank: number;
}

export interface DegreeViewModel {
  id: number;
  name: string;
  /** How the title is obtained, as written in MasterData. */
  source: string;
  type: number;
  imageUrl: string;
  characterIds: number[];
  /** Localized names of `characterIds`, in the same order. */
  characterNames: string[];
  bandIds: number[];
  orderNum: number;
  startAt: string;
  endAt: string;
  /** Character rank rewards that hand the title out. */
  unlocks: DegreeUnlock[];
  /** The member card whose artwork the title shows (`MemberCard/<id>/…`), or null. */
  sourceCardId: number | null;
  searchText: string;
}

/** Resource type of a title in reward tables. */
export const DEGREE_RESOURCE_TYPE = 17;

/** Names carry an inventory tag such as "[Sticker]" (ASCII or full-width brackets); the page already says what they are. */
export function stripInventoryTag(name: string): string {
  return name.replace(/^\s*[[【［][^\]】］]*[\]】］]\s*/, "");
}

// Character stickers without characterIds encode the character in the file name,
// and song jackets encode the band: degree_char_01_22 → character 22, jkt_002_100026 → band 2.
const characterFromImage = /\/degree_char_\d+_(\d+)$/;
const bandFromJacket = /^Image\/Jacket\/jkt_(\d+)_/;
const cardFromImage = /^MemberCard\/(\d+)\//;

/** The member card a title's artwork comes from (`MemberCard/12/member_character` → 12). */
export function degreeSourceCardId(imagePath: string): number | null {
  const id = Number(imagePath.match(cardFromImage)?.[1] ?? 0);
  return id > 0 ? id : null;
}

/** Character rank rewards by the title they hand out (resourceType 17), lowest rank first. */
export function degreeRankUnlocks(rewards: readonly RawDegreeRankReward[]): Map<number, Array<{ characterId: number; rank: number }>> {
  const byDegree = new Map<number, Array<{ characterId: number; rank: number }>>();
  for (const reward of rewards) {
    if (reward.resourceType !== DEGREE_RESOURCE_TYPE || !reward.resourceId || !reward.characterId) continue;
    const list = byDegree.get(reward.resourceId) ?? [];
    if (!list.some((entry) => entry.characterId === reward.characterId && entry.rank === reward.rank)) list.push({ characterId: reward.characterId, rank: reward.rank });
    byDegree.set(reward.resourceId, list);
  }
  for (const list of byDegree.values()) list.sort((a, b) => a.rank - b.rank || a.characterId - b.characterId);
  return byDegree;
}

/** Whether a title has left the game: its end time has passed ("null" and blank mean open-ended). */
export function isDegreeRetired(degree: { endAt: string }, now: number): boolean {
  const end = parseMasterDate(degree.endAt);
  return end !== null && end < now;
}

export function normalizeDegrees(
  degrees: RawDegree[],
  characters: RawCharacter[],
  texts: RawText[],
  locale: AppLocale,
  rankRewards: readonly RawDegreeRankReward[] = [],
): DegreeViewModel[] {
  const textMap = new Map(texts.map((row) => [row.id, row]));
  const characterMap = new Map(characters.map((character) => [character.id, character]));
  const characterName = (id: number) => localizeMasterText(textMap.get(characterMap.get(id)?.nameTextID ?? ""), locale);
  const unlocksByDegree = degreeRankUnlocks(rankRewards);

  return degrees
    .map((degree) => {
      const imageCharacter = Number(degree.imagePath.match(characterFromImage)?.[1] ?? 0);
      const characterIds = (degree.characterIds?.length ? degree.characterIds : [imageCharacter]).filter((id) => characterMap.has(id));
      const jacketBand = Number(degree.imagePath.match(bandFromJacket)?.[1] ?? 0);
      const bandIds = [...new Set([...characterIds.map((id) => characterMap.get(id)!.bandID), jacketBand].filter(Boolean))];
      const name = stripInventoryTag(localizeMasterText(textMap.get(degree.nameTextId), locale)) || `#${degree.id}`;
      const source = localizeMasterText(textMap.get(degree.descriptionTextId), locale);
      const characterNames = characterIds.map(characterName);
      const unlocks = (unlocksByDegree.get(degree.id) ?? [])
        .filter((entry) => characterMap.has(entry.characterId))
        .map((entry): DegreeUnlock => ({ kind: "characterRank", characterId: entry.characterId, characterName: characterName(entry.characterId), rank: entry.rank }));
      return {
        id: degree.id,
        name,
        source,
        type: degree.degreeType,
        imageUrl: getImageAssetUrl(degree.imagePath, locale),
        characterIds,
        characterNames,
        bandIds,
        orderNum: degree.orderNum,
        startAt: degree.startAt ?? "",
        endAt: degree.endAt ?? "",
        unlocks,
        sourceCardId: degreeSourceCardId(degree.imagePath),
        searchText: [name, source, ...characterNames, ...unlocks.map((unlock) => unlock.characterName), degree.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => a.orderNum - b.orderNum || a.id - b.id);
}

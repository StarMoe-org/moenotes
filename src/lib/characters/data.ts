import type { AppLocale } from "@/config/locales";
import type { RawBand, RawText } from "@/lib/cards/data";
import { localizeMasterText } from "@/lib/masterdata/localize-text";

export interface RawCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  enDisplayNameTextId: string;
  shortNameTextID: string;
  mainColorCode: string;
  subColorCode: string;
  bandPart: string;
  birthdayDay: number;
  birthdayMonth: number;
  bloodTypeTextId: string;
  catchCopyTextId: string;
  constellationTextId: string;
  descriptionTextId: string;
  favoriteFoodTextId: string;
  heightTextId: string;
  hobbyTextId: string;
  instrumentTypes: number[];
  schoolClassTextId: string;
  schoolTextId: string;
  voiceActorTextId: string;
}

export interface CharacterViewModel {
  id: number;
  bandId: number;
  displayOrder: number;
  name: string;
  enName: string;
  shortName: string;
  mainColor: string;
  subColor: string;
  bandPart: string;
  birthday: string;
  birthdayMonth: number;
  birthdayDay: number;
  bloodType: string;
  catchCopy: string;
  constellation: string;
  description: string;
  favoriteFood: string;
  height: string;
  hobby: string;
  schoolClass: string;
  school: string;
  voiceActor: string;
  bandName: string;
  searchText: string;
}

export function normalizeCharacters(
  characters: RawCharacter[],
  bands: RawBand[],
  texts: RawText[],
  locale: AppLocale,
): CharacterViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const bandMap = new Map(bands.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return characters.map((char) => {
    const band = bandMap.get(char.bandID);
    const name = resolveText(char.nameTextID);
    const enName = resolveText(char.enDisplayNameTextId);
    const shortName = resolveText(char.shortNameTextID);
    const bandName = band ? resolveText(band.nameTextID) : "";

    const birthday = formatBirthday(char.birthdayMonth, char.birthdayDay, locale);
    const catchCopy = resolveText(char.catchCopyTextId);
    const constellation = resolveText(char.constellationTextId);
    const description = resolveText(char.descriptionTextId);
    const favoriteFood = resolveText(char.favoriteFoodTextId);
    const height = resolveText(char.heightTextId);
    const hobby = resolveText(char.hobbyTextId);
    const schoolClass = resolveText(char.schoolClassTextId);
    const school = resolveText(char.schoolTextId);
    const voiceActor = resolveText(char.voiceActorTextId);
    const bloodType = char.bloodTypeTextId ? resolveText(char.bloodTypeTextId) : "";

    return {
      id: char.id,
      bandId: char.bandID,
      displayOrder: char.displayOrder,
      name,
      enName,
      shortName,
      mainColor: char.mainColorCode.trim() || "var(--mn-accent)",
      subColor: char.subColorCode.trim() || "#FFFFFF",
      bandPart: char.bandPart,
      birthday,
      birthdayMonth: char.birthdayMonth,
      birthdayDay: char.birthdayDay,
      bloodType,
      catchCopy,
      constellation,
      description,
      favoriteFood,
      height,
      hobby,
      schoolClass,
      school,
      voiceActor,
      bandName,
      searchText: [name, enName, shortName, bandName, voiceActor, char.bandPart].join(" ").toLowerCase(),
    };
  });
}


// ---- Character progression (rank, friendship, voice, costume) ----

export interface RawCharacterRank {
  rank: number;
  exp: number;
  bonus: number;
}

export interface RawCharacterRankReward {
  characterId: number;
  rank: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

export interface RawCharacterFriendshipRank {
  rank: number;
  exp: number;
  bonus: number;
}

export interface RawCharacterFriendshipRankReward {
  characterId: number;
  rank: number;
  resourceType: number;
  resourceId: number;
  resourceCount: number;
}

export interface RawCharacterVoice {
  id: number;
  characterId: number;
  type: number;
  textId: string;
  soundId: number;
  scoreRank: number;
  startAt: string;
}

/**
 * MasterCharacterCostume / MasterCharacterCostumeGroup name their keys `_characterID` / `_groupID` (capital `ID`),
 * unlike most tables; the lower-case spellings are accepted too, so either form reads through `costumeCharacterId`.
 */
export interface RawCharacterCostume {
  id: number;
  characterID?: number;
  characterId?: number;
  groupID?: number;
  groupId?: number;
  costumeType: number;
  costumeId: number;
  isDefault: boolean;
  live2dPath: string;
}

export interface RawCharacterCostumeGroup {
  id: number;
  characterID?: number;
  characterId?: number;
  costumeNameTextId: string;
  iconPath: string;
  isInitial: boolean;
  isChangeable: boolean;
  specialConditionMemberCardId: number;
  startAt: string;
}

/** The character a costume row (or costume group row) belongs to, whichever key spelling the table uses. */
export function costumeCharacterId(row: { characterID?: number; characterId?: number }): number {
  return row.characterID ?? row.characterId ?? 0;
}

/** The costume group a costume row belongs to, whichever key spelling the table uses. */
export function costumeGroupId(row: { groupID?: number; groupId?: number }): number {
  return row.groupID ?? row.groupId ?? 0;
}

export interface CostumeViewModel {
  id: number;
  groupId: number;
  name: string;
  iconPath: string;
  isDefault: boolean;
  isInitial: boolean;
  live2dPath: string;
  costumeType: number;
}

export interface VoiceViewModel {
  id: number;
  type: number;
  typeName: string;
  text: string;
  soundUrl: string;
  scoreRank: number;
  startAt: string;
}

export interface RankRewardGroup {
  rank: number;
  rewards: Array<{ kind: string; id: number; count: number; name: string; imageUrl: string; link?: { routeId: string; detailId?: number } }>;
}

export interface CharacterProgressionData {
  costumes: CostumeViewModel[];
  voices: VoiceViewModel[];
  rankRewards: RankRewardGroup[];
  friendshipRewards: RankRewardGroup[];
}

const VOICE_TYPE_NAMES: Record<number, string> = {
  1: "greeting",
  2: "home",
  3: "live_start",
  4: "live_end",
  5: "skill",
  6: "full_combo",
  7: "all_perfect",
  8: "result_success",
  9: "result_failure",
  10: "level_up",
  11: "rank_up",
  12: "story",
  13: "gacha",
  14: "friendship",
  15: "birthday",
  16: "seasonal",
  17: "event",
};

export function getVoiceTypeName(type: number): string {
  return VOICE_TYPE_NAMES[type] ?? `type_${type}`;
}

export function normalizeCharacterCostumes(
  costumes: RawCharacterCostume[],
  groups: RawCharacterCostumeGroup[],
  texts: RawText[],
  locale: AppLocale,
): CostumeViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const groupMap = new Map(groups.map((entry) => [entry.id, entry]));

  return costumes.map((costume) => {
    const groupId = costumeGroupId(costume);
    const group = groupMap.get(groupId);
    const name = group ? localizeMasterText(textMap.get(group.costumeNameTextId), locale) || group.costumeNameTextId : `Costume ${costume.id}`;
    return {
      id: costume.id,
      groupId,
      name,
      iconPath: group?.iconPath ?? "",
      isDefault: costume.isDefault,
      isInitial: group?.isInitial ?? false,
      live2dPath: costume.live2dPath ?? "",
      costumeType: costume.costumeType,
    };
  });
}

export function normalizeCharacterVoices(
  voices: RawCharacterVoice[],
  texts: RawText[],
  locale: AppLocale,
  soundUrlOf: (soundId: number) => string,
): VoiceViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));

  return voices.map((voice) => ({
    id: voice.id,
    type: voice.type,
    typeName: getVoiceTypeName(voice.type),
    text: localizeMasterText(textMap.get(voice.textId), locale) || voice.textId,
    soundUrl: soundUrlOf(voice.soundId),
    scoreRank: voice.scoreRank,
    startAt: voice.startAt,
  }));
}

export function normalizeRankRewards(
  rewards: RawCharacterRankReward[] | RawCharacterFriendshipRankReward[],
  characterId: number,
  resolve: (resource: { resourceType: number; resourceId: number; resourceCount: number }) => { kind: string; id: number; count: number; name: string; imageUrl: string; link?: { routeId: string; detailId?: number } },
): RankRewardGroup[] {

  const filtered = rewards.filter((entry) => entry.characterId === 0 || entry.characterId === characterId);
  if (filtered.length === 0) return [];

  const rankSet = new Set(filtered.map((entry) => entry.rank));
  return [...rankSet].sort((a, b) => a - b).map((rank) => ({
    rank,
    rewards: filtered
      .filter((entry) => entry.rank === rank)
      .map((entry) => resolve(entry)),
  }));
}

function formatBirthday(month: number, day: number, locale: AppLocale): string {
  // Use a fixed non-leap year so month/day formatting is stable across engines.
  const date = new Date(Date.UTC(2024, month - 1, day));
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC",
    }).format(date);
  }
}

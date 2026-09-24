import type { AppLocale } from "@/config/locales";
import { localizeMasterText, type MasterTextRow } from "@/lib/masterdata/localize-text";

export interface MasterTable<T> {
  _allData: T[];
}

export interface RawMemberCard {
  id: number;
  assetID: number;
  characterID: number;
  rarity: number;
  cardType: number;
  nameTextID: string;
  subtitleTextID: string;
  gachaVoiceTextId: string;
  startAt: string;
  liveSkillID: number;
  leaderSkillID: number;
  gekisouSkillID: number;
  performancePowerMax: number;
  technicPowerMax: number;
  visualPowerMax: number;
}

export interface RawCharacter {
  id: number;
  bandID: number;
  displayOrder: number;
  nameTextID: string;
  enDisplayNameTextId: string;
  mainColorCode: string;
}

export interface RawBand {
  id: number;
  nameTextID: string;
  mainColorCode: string;
}

export type RawText = MasterTextRow;

export interface CardViewModel {
  id: number;
  assetId: number;
  characterId: number;
  bandId: number;
  rarity: 2 | 3 | 4;
  cardType: 1 | 2 | 3 | 4 | 5;
  title: string;
  characterName: string;
  bandName: string;
  characterColor: string;
  performancePower: number;
  technicPower: number;
  visualPower: number;
  totalPower: number;
  startAt: string;
  gachaVoice: string;
  liveSkillId: number;
  leaderSkillId: number;
  gekisouSkillId: number;
  searchText: string;
}

export function validateMasterTable<T>(raw: unknown): MasterTable<T> {
  const rows = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { _allData?: unknown })._allData)
      ? (raw as { _allData: unknown[] })._allData
      : null;
  if (!rows) {
    throw new Error("Invalid masterdata table");
  }
  return { _allData: rows.map(normalizeEntry) as T[] };
}

export function normalizeCards(
  cards: RawMemberCard[],
  characters: RawCharacter[],
  bands: RawBand[],
  texts: RawText[],
  locale: AppLocale,
): CardViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const bandMap = new Map(bands.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return cards
    .filter((card): card is RawMemberCard & { rarity: 2 | 3 | 4; cardType: 1 | 2 | 3 | 4 | 5 } =>
      [2, 3, 4].includes(card.rarity) && [1, 2, 3, 4, 5].includes(card.cardType),
    )
    .map((card) => {
      const character = characterMap.get(card.characterID);
      const band = character ? bandMap.get(character.bandID) : undefined;
      const title = resolveText(card.subtitleTextID);
      const characterName = resolveText(card.nameTextID || character?.nameTextID || "");
      const bandName = band ? resolveText(band.nameTextID) : "";

      return {
        id: card.id,
        assetId: card.assetID,
        characterId: card.characterID,
        bandId: character?.bandID ?? 0,
        rarity: card.rarity,
        cardType: card.cardType,
        title,
        characterName,
        bandName,
        characterColor: character?.mainColorCode.trim() || "var(--mn-accent)",
        performancePower: card.performancePowerMax,
        technicPower: card.technicPowerMax,
        visualPower: card.visualPowerMax,
        totalPower: card.performancePowerMax + card.technicPowerMax + card.visualPowerMax,
        startAt: card.startAt,
        gachaVoice: resolveText(card.gachaVoiceTextId || ""),
        liveSkillId: card.liveSkillID,
        leaderSkillId: card.leaderSkillID,
        gekisouSkillId: card.gekisouSkillID,
        searchText: [title, characterName, bandName, card.id].join(" ").toLocaleLowerCase(),
      };
    })
    .sort((a, b) => b.rarity - a.rarity || b.id - a.id);
}


function normalizeEntry(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entryValue]) => [key.replace(/^_/, ""), entryValue]),
  );
}

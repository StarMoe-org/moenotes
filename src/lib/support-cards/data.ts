import type { AppLocale } from "@/config/locales";
import type { RawCharacter, RawBand, RawText } from "@/lib/cards/data";

export interface RawSupportCard {
  id: number;
  assetID: number;
  cardType: number;
  characterIDs: number[];
  descriptionTextID: string;
  diaryTextID: string;
  gekisouSupportSkillId01: number;
  gekisouSupportSkillId02: number;
  nameTextID: string;
  performancePowerMax: number;
  rankUpItemID: number;
  rarity: number;
  startAt: string;
  supportCardLevelGroup: number;
  supportCardRankGroup: number;
  supportSkillId01: number;
  supportSkillId02: number;
  technicPowerMax: number;
  visualPowerMax: number;
}

export interface SupportCardViewModel {
  id: number;
  assetId: number;
  rarity: 2 | 3 | 4;
  cardType: 1 | 2 | 3 | 4 | 5;
  title: string; // Resolves descriptionTextID (e.g. "SupportSubtitle_1")
  name: string;  // Resolves nameTextID (e.g. "Snap_Name_Tomori")
  diaryText: string; // Resolves diaryTextID (e.g. "SupportDiary_1")
  characterIds: number[];
  characters: Array<{
    id: number;
    name: string;
    color: string;
  }>;
  bandId: number;
  bandName: string;
  performancePower: number;
  technicPower: number;
  visualPower: number;
  totalPower: number;
  startAt: string;
  supportSkillId01: number;
  supportSkillId02: number;
  gekisouSupportSkillId01: number;
  gekisouSupportSkillId02: number;
  searchText: string;
}

export function normalizeSupportCards(
  supportCards: RawSupportCard[],
  characters: RawCharacter[],
  bands: RawBand[],
  texts: RawText[],
  locale: AppLocale,
): SupportCardViewModel[] {
  const textMap = new Map(texts.map((entry) => [entry.id, entry]));
  const characterMap = new Map(characters.map((entry) => [entry.id, entry]));
  const bandMap = new Map(bands.map((entry) => [entry.id, entry]));
  const resolveText = (id: string) => localizeMasterText(textMap.get(id), locale) || id;

  return supportCards
    .filter((card): card is RawSupportCard & { rarity: 2 | 3 | 4; cardType: 1 | 2 | 3 | 4 | 5 } =>
      [2, 3, 4].includes(card.rarity) && [1, 2, 3, 4, 5].includes(card.cardType),
    )
    .map((card) => {
      const title = resolveText(card.descriptionTextID);
      const name = resolveText(card.nameTextID);
      const diaryText = resolveText(card.diaryTextID);

      const featuredChars = (card.characterIDs || [])
        .map((charId) => {
          const char = characterMap.get(charId);
          if (!char) return null;
          return {
            id: charId,
            name: resolveText(char.nameTextID),
            color: char.mainColorCode.trim() || "var(--mn-accent)",
            bandId: char.bandID,
          };
        })
        .filter((c): c is NonNullable<typeof c> => c !== null);

      // Derive primary band from the first featured character's band, or fallback to 0
      const primaryBandId = featuredChars[0]?.bandId ?? 0;
      const band = bandMap.get(primaryBandId);
      const bandName = band ? resolveText(band.nameTextID) : "";

      const characterNamesString = featuredChars.map((c) => c.name).join(" ");

      return {
        id: card.id,
        assetId: card.assetID,
        rarity: card.rarity,
        cardType: card.cardType,
        title,
        name,
        diaryText,
        characterIds: card.characterIDs || [],
        characters: featuredChars.map((c) => ({ id: c.id, name: c.name, color: c.color })),
        bandId: primaryBandId,
        bandName,
        performancePower: card.performancePowerMax,
        technicPower: card.technicPowerMax,
        visualPower: card.visualPowerMax,
        totalPower: card.performancePowerMax + card.technicPowerMax + card.visualPowerMax,
        startAt: card.startAt,
        supportSkillId01: card.supportSkillId01,
        supportSkillId02: card.supportSkillId02,
        gekisouSupportSkillId01: card.gekisouSupportSkillId01,
        gekisouSupportSkillId02: card.gekisouSupportSkillId02,
        searchText: [title, name, bandName, characterNamesString, card.id].join(" ").toLowerCase(),
      };
    })
    .sort((a, b) => b.rarity - a.rarity || b.id - a.id);
}

function localizeMasterText(entry: RawText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
  if (locale === "en-US") return entry.english || entry.japanese;
  return entry.japanese || entry.english;
}

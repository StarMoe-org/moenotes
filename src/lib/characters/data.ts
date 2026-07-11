import type { AppLocale } from "@/config/locales";
import type { RawBand, RawText } from "@/lib/cards/data";

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

function localizeMasterText(entry: RawText | undefined, locale: AppLocale): string {
  if (!entry) return "";
  if (locale === "zh-CN") return entry.simplifiedChinese || entry.traditionalChinese || entry.japanese || entry.english;
  if (locale === "en-US") return entry.english || entry.japanese;
  return entry.japanese || entry.english;
}

function formatBirthday(month: number, day: number, locale: AppLocale): string {
  if (locale === "zh-CN" || locale === "ja-JP") {
    return `${month}月${day}日`; // i18n-allow-hardcoded
  }
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = months[month - 1] || "";
  return `${monthName} ${day}`;
}

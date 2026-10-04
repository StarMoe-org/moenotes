import type { CharacterViewModel } from "@/lib/characters/data";

/*
 * Filters of the character list: band part (from MasterCharacter `_bandPart`), school and birth month, plus search.
 * `_bandPart` names the parts ("Gt.&Vo.", "DJ&Mp."), which says more than `_instrumentTypes` (1 vocal / 2 melody /
 * 3 rhythm), so the part filter splits it into its parts.
 */

export interface CharacterFilterState {
  query: string;
  bands: number[];
  positions: string[];
  schools: string[];
  months: number[];
}

export const EMPTY_CHARACTER_FILTERS: CharacterFilterState = { query: "", bands: [], positions: [], schools: [], months: [] };

type FilterSubject = Pick<CharacterViewModel, "bandId" | "bandPart" | "schoolKey" | "birthdayMonth" | "searchText">;

/** The parts of a `_bandPart` value: "Gt.&Vo." → ["Gt.", "Vo."]. */
export function bandPartPositions(bandPart: string): string[] {
  return bandPart.split("&").map((part) => part.trim()).filter(Boolean);
}

/** Every part the characters play, in first-seen order. */
export function positionOptions(characters: readonly Pick<CharacterViewModel, "bandPart">[]): string[] {
  const seen = new Set<string>();
  for (const character of characters) for (const part of bandPartPositions(character.bandPart)) seen.add(part);
  return [...seen];
}

/** Schools by MasterText id, with their localized names, in first-seen order. */
export function schoolOptions(characters: readonly Pick<CharacterViewModel, "schoolKey" | "school">[]): Array<{ key: string; name: string }> {
  const seen = new Map<string, string>();
  for (const character of characters) if (character.schoolKey && character.school && !seen.has(character.schoolKey)) seen.set(character.schoolKey, character.school);
  return [...seen].map(([key, name]) => ({ key, name }));
}

export function hasCharacterFilters(state: CharacterFilterState): boolean {
  return Boolean(state.query.trim()) || state.bands.length > 0 || state.positions.length > 0 || state.schools.length > 0 || state.months.length > 0;
}

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Within a facet any chosen value matches; across facets every facet must match. Search words must all appear. */
export function matchesCharacterFilters(character: FilterSubject, state: CharacterFilterState): boolean {
  if (state.bands.length > 0 && !state.bands.includes(character.bandId)) return false;
  if (state.positions.length > 0 && !bandPartPositions(character.bandPart).some((part) => state.positions.includes(part))) return false;
  if (state.schools.length > 0 && !state.schools.includes(character.schoolKey)) return false;
  if (state.months.length > 0 && !state.months.includes(character.birthdayMonth)) return false;
  const terms = normalized(state.query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const text = normalized(character.searchText);
  return terms.every((term) => text.includes(term));
}

/** Birthday as a sortable month/day number (Jan 1 = 101); null without a birthday. */
export function birthdaySortValue(character: Pick<CharacterViewModel, "birthdayMonth" | "birthdayDay">): number | null {
  return character.birthdayMonth > 0 ? character.birthdayMonth * 100 + character.birthdayDay : null;
}

export function parseCharacterFilterState(raw: string | undefined): CharacterFilterState {
  if (!raw) return EMPTY_CHARACTER_FILTERS;
  try {
    const parsed = JSON.parse(raw) as Partial<CharacterFilterState>;
    const numbers = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : []);
    const strings = (value: unknown) => (Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : []);
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      bands: numbers(parsed.bands),
      positions: strings(parsed.positions),
      schools: strings(parsed.schools),
      months: numbers(parsed.months),
    };
  } catch {
    return EMPTY_CHARACTER_FILTERS;
  }
}

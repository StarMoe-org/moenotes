import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";

/** What the card filters read from a list entry: a member card, a support card, or a picker row built on one. */
export interface CardFilterSubject {
  id: number;
  title: string;
  startAt?: string;
  /** 0 when unknown: such entries pass only while no rarity, attribute, band or character is chosen. */
  rarity: number;
  cardType: number;
  bandId: number;
  bandName: string;
  characters: readonly { id: number; name: string }[];
  searchText: string;
}

export interface CardFilterState {
  query: string;
  rarities: number[];
  cardTypes: number[];
  bands: number[];
  characters: number[];
}

export const EMPTY_CARD_FILTERS: CardFilterState = { query: "", rarities: [], cardTypes: [], bands: [], characters: [] };

export function hasCardFilters(state: CardFilterState): boolean {
  return Boolean(state.query.trim()) || state.rarities.length > 0 || state.cardTypes.length > 0 || state.bands.length > 0 || state.characters.length > 0;
}

const normalized = (text: string) => text.normalize("NFKC").toLocaleLowerCase().replace(/\s+/g, " ").trim();

/** Every search word must appear (in any order). */
export function matchesCardFilters(subject: CardFilterSubject, state: CardFilterState): boolean {
  if (state.rarities.length > 0 && !state.rarities.includes(subject.rarity)) return false;
  if (state.cardTypes.length > 0 && !state.cardTypes.includes(subject.cardType)) return false;
  if (state.bands.length > 0 && !state.bands.includes(subject.bandId)) return false;
  if (state.characters.length > 0 && !subject.characters.some((character) => state.characters.includes(character.id))) return false;
  const terms = normalized(state.query).split(" ").filter(Boolean);
  if (!terms.length) return true;
  const text = normalized(subject.searchText);
  return terms.every((term) => text.includes(term));
}

export function cardBandOptions(subjects: readonly CardFilterSubject[]): [number, string][] {
  const values = new Map<number, string>();
  for (const subject of subjects) if (subject.bandId && subject.bandName) values.set(subject.bandId, subject.bandName);
  return [...values.entries()].sort(([a], [b]) => a - b);
}

/** The characters of the chosen bands (none until a band is chosen). */
export function cardCharacterOptions(subjects: readonly CardFilterSubject[], bands: readonly number[]): { id: number; name: string }[] {
  if (!bands.length) return [];
  const values = new Map<number, { id: number; name: string }>();
  for (const subject of subjects) {
    if (!bands.includes(subject.bandId)) continue;
    for (const character of subject.characters) values.set(character.id, { id: character.id, name: character.name });
  }
  return [...values.values()].sort((a, b) => a.id - b.id);
}

export function memberCardSubject(card: CardViewModel): CardFilterSubject {
  return {
    id: card.id,
    title: card.title,
    startAt: card.startAt,
    rarity: card.rarity,
    cardType: card.cardType,
    bandId: card.bandId,
    bandName: card.bandName,
    characters: [{ id: card.characterId, name: card.characterName }],
    searchText: card.searchText,
  };
}

export function supportCardSubject(card: SupportCardViewModel): CardFilterSubject {
  return {
    id: card.id,
    title: card.title,
    startAt: card.startAt,
    rarity: card.rarity,
    cardType: card.cardType,
    bandId: card.bandId,
    bandName: card.bandName,
    characters: card.characters,
    searchText: card.searchText,
  };
}

export function parseCardFilterState(raw: string | undefined): CardFilterState {
  if (!raw) return EMPTY_CARD_FILTERS;
  try {
    const parsed = JSON.parse(raw) as Partial<CardFilterState>;
    const numbers = (value: unknown) => Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number") : [];
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      rarities: numbers(parsed.rarities),
      cardTypes: numbers(parsed.cardTypes),
      bands: numbers(parsed.bands),
      characters: numbers(parsed.characters),
    };
  } catch {
    return EMPTY_CARD_FILTERS;
  }
}

import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { AttributeFilter, BandFilter, CharacterFilter, RarityFilter } from "@/components/shared/BaseFilters";
import { getSupportCardTypeIconUrl, getSupportRarityIconUrl } from "@/lib/support-cards/assets";
import {
  EMPTY_CARD_FILTERS,
  cardBandOptions,
  cardCharacterOptions,
  hasCardFilters,
  matchesCardFilters,
  type CardFilterState,
  type CardFilterSubject,
} from "@/lib/filter/card-filter";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort, type NumericSortField } from "@/lib/filter/use-list-sort";

export type CardFilterKind = "member" | "support";

const RARITIES: Record<CardFilterKind, readonly number[]> = { member: [20, 4, 3, 2], support: [10, 4, 3, 2] };
const CARD_TYPES = [1, 2, 3, 4, 5] as const;

interface CardFilterOptions<T> {
  /** A further filter of the caller's (e.g. a skill kind), counted in the results and the active state. */
  match?: ((item: T) => boolean) | undefined;
  active?: boolean | undefined;
  onReset?: (() => void) | undefined;
  /**
   * Extra numeric sort fields (stats, totals) next to date and rarity, with their readers. Both must be stable
   * (module-level or memoized).
   */
  numericSort?: { fields: readonly NumericSortField[]; read: Readonly<Record<string, (item: T) => number | null | undefined>> } | undefined;
}

/**
 * Search, rarity, attribute, band, character and sort state over a card list; render the panel with <CardFilters>.
 * `describe` must be stable (module-level or memoized): it maps each entry to the card fields the filters read.
 */
export function useCardFilters<T>(
  items: readonly T[],
  locale: AppLocale,
  sortPage: string,
  describe: (item: T) => CardFilterSubject,
  options: CardFilterOptions<T> = {},
) {
  const [filters, setFilters] = useState<CardFilterState>(EMPTY_CARD_FILTERS);
  const { match, active: extraActive = false, onReset: extraReset, numericSort } = options;
  const sort = useListSort(sortPage, locale, "date rarity", numericSort ? { numeric: numericSort.fields } : {});
  const { onChange: setSort } = sort;
  const numericReaders = useMemo(() => {
    if (!numericSort) return undefined;
    return Object.fromEntries(Object.entries(numericSort.read).map(([key, read]) => [key, (row: { item: T }) => read(row.item)]));
  }, [numericSort]);

  const entries = useMemo(() => items.map((item) => ({ item, subject: describe(item) })), [items, describe]);
  const subjects = useMemo(() => entries.map((entry) => entry.subject), [entries]);
  const bands = useMemo(() => cardBandOptions(subjects), [subjects]);
  const characters = useMemo(() => cardCharacterOptions(subjects, filters.bands), [subjects, filters.bands]);
  const filteredEntries = useMemo(
    () => entries.filter((entry) => matchesCardFilters(entry.subject, filters) && (!match || match(entry.item))),
    [entries, filters, match],
  );
  const filtered = useMemo(() => filteredEntries.map((entry) => entry.item), [filteredEntries]);
  const sorted = useMemo(() => sortEntries(
    // Unknown dates and rarities (0) stay unset, so they sort after real values.
    filteredEntries.map(({ subject, item }) => ({ id: subject.id, title: subject.title, item,
      ...(subject.startAt ? { startAt: subject.startAt } : {}), ...(subject.rarity ? { rarity: subject.rarity } : {}) })),
    sort.value,
    locale,
    numericReaders ? { numeric: numericReaders } : {},
  ).map((row) => row.item), [filteredEntries, sort.value, locale, numericReaders]);
  const hasActiveFilters = sort.value !== "default" || hasCardFilters(filters) || extraActive;

  /** Choosing bands keeps only the chosen characters that belong to them. */
  const toggleBand = useCallback((bandId: number) => {
    setFilters((current) => {
      const nextBands = current.bands.includes(bandId) ? current.bands.filter((id) => id !== bandId) : [...current.bands, bandId];
      const valid = new Set(cardCharacterOptions(subjects, nextBands).map((character) => character.id));
      return { ...current, bands: nextBands, characters: current.characters.filter((id) => valid.has(id)) };
    });
  }, [subjects]);

  const reset = useCallback(() => {
    setSort("default");
    setFilters(EMPTY_CARD_FILTERS);
    extraReset?.();
  }, [setSort, extraReset]);

  return { items, filters, setFilters, sort, bands, characters, filtered, sorted, hasActiveFilters, toggleBand, reset };
}

export type CardFiltersController<T> = ReturnType<typeof useCardFilters<T>>;

interface CardFiltersProps<T> {
  locale: AppLocale;
  controller: CardFiltersController<T>;
  kind: CardFilterKind;
  variant?: "card" | "plain";
  title?: string;
  searchPlaceholder?: string;
  /** Replaces the controller's reset, e.g. to also forget remembered state. */
  onReset?: () => void;
  /** Further sections after the card filters. */
  children?: ReactNode;
}

/** The member / support card list's filter panel, shared by the list pages and the card pickers. */
export default function CardFilters<T>({ locale, controller, kind, variant = "plain", title, searchPlaceholder, onReset, children }: CardFiltersProps<T>) {
  const { items, filters, setFilters, sort, bands, characters, filtered, hasActiveFilters, toggleBand, reset } = controller;
  const pack = kind === "member" ? "cards" : "supportCards";
  const support = kind === "support";
  return (
    <BaseFilters
      sort={sort}
      variant={variant}
      title={title ?? t(locale, `${pack}.filterTitle`)}
      searchValue={filters.query}
      onSearchChange={(query) => setFilters((current) => ({ ...current, query }))}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={searchPlaceholder ?? t(locale, `${pack}.searchPlaceholder`)}
      resultCount={filtered.length}
      totalCount={items.length}
      hasActiveFilters={hasActiveFilters}
      onReset={onReset ?? reset}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <RarityFilter<number>
        title={t(locale, "cards.rarity")}
        rarities={RARITIES[kind]}
        selectedRarities={filters.rarities}
        onChange={(rarities) => setFilters((current) => ({ ...current, rarities }))}
        {...(support ? { getIconUrl: (value: number) => getSupportRarityIconUrl(value as 2 | 3 | 4 | 10) } : {})}
        getRarityLabel={(value) => t(locale, `cards.rarities.${value}`)}
      />

      <AttributeFilter<number>
        title={t(locale, "cards.attribute")}
        attributes={CARD_TYPES}
        selectedAttributes={filters.cardTypes}
        onChange={(cardTypes) => setFilters((current) => ({ ...current, cardTypes }))}
        {...(support ? { getIconUrl: (value: number) => getSupportCardTypeIconUrl(value as 1 | 2 | 3 | 4 | 5) } : {})}
        getAttributeLabel={(value) => t(locale, `cards.attributes.${value}`)}
      />

      <BandFilter
        title={t(locale, "cards.band")}
        bands={bands}
        selectedBands={filters.bands}
        onToggle={toggleBand}
        onReset={() => setFilters((current) => ({ ...current, bands: [], characters: [] }))}
      />

      <CharacterFilter
        title={t(locale, "nav.items.characters")}
        characters={characters}
        selectedCharacters={filters.characters}
        onChange={(selected) => setFilters((current) => ({ ...current, characters: selected }))}
      />

      {children}
    </BaseFilters>
  );
}

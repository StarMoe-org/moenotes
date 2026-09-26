import { useCallback, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { AttributeFilter, BandFilter } from "@/components/shared/BaseFilters";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import type { MusicViewModel } from "@/lib/music/data";
import {
  EMPTY_MUSIC_FILTERS,
  MUSIC_TYPES,
  filterMusic,
  hasMusicFilters,
  musicBandOptions,
  type MusicFilterState,
} from "@/lib/music/filter";

/** Search, attribute, band and sort state over a song list; render the panel with <MusicFilters>. */
export function useMusicFilters(songs: readonly MusicViewModel[], locale: AppLocale, sortPage: string) {
  const [filters, setFilters] = useState<MusicFilterState>(EMPTY_MUSIC_FILTERS);
  const sort = useListSort(sortPage, locale, "date");
  const { onChange: setSort } = sort;

  const bands = useMemo(() => musicBandOptions(songs), [songs]);
  const filtered = useMemo(() => filterMusic(songs, filters), [songs, filters]);
  const sorted = useMemo(() => sortEntries(filtered, sort.value, locale), [filtered, sort.value, locale]);
  const hasActiveFilters = sort.value !== "default" || hasMusicFilters(filters);

  const reset = useCallback(() => {
    setSort("default");
    setFilters(EMPTY_MUSIC_FILTERS);
  }, [setSort]);

  return { songs, filters, setFilters, sort, bands, filtered, sorted, hasActiveFilters, reset };
}

export type MusicFiltersController = ReturnType<typeof useMusicFilters>;

interface MusicFiltersProps {
  locale: AppLocale;
  controller: MusicFiltersController;
  variant?: "card" | "plain";
  /** Replaces the controller's reset, e.g. to also forget remembered state. */
  onReset?: () => void;
}

export default function MusicFilters({ locale, controller, variant = "plain", onReset }: MusicFiltersProps) {
  const { songs, filters, setFilters, sort, bands, filtered, hasActiveFilters, reset } = controller;
  return (
    <BaseFilters
      sort={sort}
      variant={variant}
      title={t(locale, "music.filterTitle")}
      searchValue={filters.query}
      onSearchChange={(query) => setFilters((current) => ({ ...current, query }))}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "music.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={songs.length}
      hasActiveFilters={hasActiveFilters}
      onReset={onReset ?? reset}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <AttributeFilter
        title={t(locale, "cards.attribute")}
        attributes={MUSIC_TYPES}
        selectedAttributes={filters.types}
        onChange={(types) => setFilters((current) => ({ ...current, types }))}
        getAttributeLabel={(value) => t(locale, `cards.attributes.${value}`)}
      />

      <BandFilter
        title={t(locale, "cards.band")}
        bands={bands}
        selectedBands={filters.bands}
        onChange={(selected) => setFilters((current) => ({ ...current, bands: selected }))}
      />
    </BaseFilters>
  );
}

import { useCallback, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { AttributeFilter, BandFilter, FilterButton, FilterSection, RangeFilter, toggleArrayItem } from "@/components/shared/BaseFilters";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";
import {
  EMPTY_MUSIC_FILTERS,
  MUSIC_OTHER_BAND,
  MUSIC_TYPES,
  filterMusic,
  hasMusicFilters,
  hasOtherBandMusic,
  musicBandOptions,
  musicLevelBounds,
  type MusicFilterState,
} from "@/lib/music/filter";

/** Search, attribute, band, difficulty, level and sort state over a song list; render the panel with <MusicFilters>. */
export function useMusicFilters(songs: readonly MusicViewModel[], locale: AppLocale, sortPage: string) {
  const [filters, setFilters] = useState<MusicFilterState>(EMPTY_MUSIC_FILTERS);
  const sort = useListSort(sortPage, locale, "date");
  const { onChange: setSort } = sort;

  const bands = useMemo(() => musicBandOptions(songs), [songs]);
  const hasOtherBand = useMemo(() => hasOtherBandMusic(songs), [songs]);
  const levelBounds = useMemo(() => musicLevelBounds(songs), [songs]);
  const filtered = useMemo(() => filterMusic(songs, filters), [songs, filters]);
  const sorted = useMemo(() => sortEntries(filtered, sort.value, locale), [filtered, sort.value, locale]);
  const hasActiveFilters = sort.value !== "default" || hasMusicFilters(filters);

  const reset = useCallback(() => {
    setSort("default");
    setFilters(EMPTY_MUSIC_FILTERS);
  }, [setSort]);

  return { songs, filters, setFilters, sort, bands, hasOtherBand, levelBounds, filtered, sorted, hasActiveFilters, reset };
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
  const { songs, filters, setFilters, sort, bands, hasOtherBand, levelBounds, filtered, hasActiveFilters, reset } = controller;
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
        extraOption={hasOtherBand ? { id: MUSIC_OTHER_BAND, label: t(locale, "music.filters.bandOther") } : undefined}
      />

      <FilterSection title={t(locale, "music.filters.difficulty")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filters.difficulties.length === 0} onClick={() => setFilters((current) => ({ ...current, difficulties: [] }))}>
            ALL
          </FilterButton>
          {MUSIC_DIFFICULTIES.map((difficulty) => {
            const active = filters.difficulties.includes(difficulty);
            const label = t(locale, `music.difficultyLevels.${difficulty}`);
            return (
              <FilterButton
                key={difficulty}
                active={active}
                onClick={() => setFilters((current) => ({ ...current, difficulties: toggleArrayItem(current.difficulties, difficulty) }))}
              >
                <span aria-hidden="true" title={label} className={active ? undefined : difficultyStyles[difficulty].labelColor}>
                  {DIFFICULTY_SHORT_LABELS[difficulty]}
                </span>
                <span className="sr-only">{label}</span>
              </FilterButton>
            );
          })}
        </div>
      </FilterSection>

      {levelBounds && (
        <RangeFilter
          title={t(locale, "music.filters.level")}
          min={levelBounds[0]}
          max={levelBounds[1]}
          value={[filters.minLevel, filters.maxLevel]}
          onChange={([minLevel, maxLevel]) => setFilters((current) => ({ ...current, minLevel, maxLevel }))}
          minLabel={t(locale, "music.filters.levelMin")}
          maxLabel={t(locale, "music.filters.levelMax")}
          formatRange={(min, max) => t(locale, "music.filters.levelRange", { min, max })}
        />
      )}
    </BaseFilters>
  );
}

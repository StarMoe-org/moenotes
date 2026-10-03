import { useCallback, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { AttributeFilter, BandFilter, FilterButton, FilterSection, RangeFilter, toggleArrayItem } from "@/components/shared/BaseFilters";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort, type NumericSortField } from "@/lib/filter/use-list-sort";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import {
  CREDIT_FILTER_KEYS,
  EMPTY_MUSIC_FILTERS,
  MUSIC_CREDIT_FIELDS,
  MUSIC_OTHER_BAND,
  MUSIC_TYPES,
  filterMusic,
  hasMusicFilters,
  hasOtherBandMusic,
  musicBandOptions,
  musicCategoryOptions,
  musicCreditOptions,
  musicLevelBounds,
  type MusicCreditField,
  type MusicFilterState,
} from "@/lib/music/filter";
import { EMPTY_METRICS_INDEX, lookupMetrics, type ChartMetrics, type ChartMetricsIndex } from "@/lib/music/metrics";

/** Numeric sorts of the music list: the focus chart's level / notes / BPM / NPS, the song's length and category. */
const PANEL_SORT_FIELDS: readonly NumericSortField[] = [
  { key: "level", labelKey: "music.sorting.level" },
  { key: "notes", labelKey: "music.sorting.notes" },
  { key: "bpm", labelKey: "music.sorting.bpm" },
  { key: "duration", labelKey: "music.sorting.duration" },
  { key: "nps", labelKey: "music.sorting.nps" },
  { key: "category", labelKey: "music.sorting.category", initialDirection: "asc" },
];
/** Per-difficulty level sorts, offered by the table's level columns only. */
const TABLE_SORT_FIELDS: readonly NumericSortField[] = MUSIC_DIFFICULTIES.map((difficulty) => ({ key: `level-${difficulty}`, labelKey: `music.difficultyLevels.${difficulty}` }));
/** Sorts that need music-data.json, left out where no figures are loaded (the song picker). */
const METRIC_SORT_KEYS = new Set(["bpm", "duration", "nps"]);
const SORT_FIELDS = [...PANEL_SORT_FIELDS, ...TABLE_SORT_FIELDS];
const BASIC_SORT_FIELDS = SORT_FIELDS.filter((field) => !METRIC_SORT_KEYS.has(field.key));
const PANEL_SORT_KEYS = new Set(PANEL_SORT_FIELDS.map((field) => field.key));

export interface MusicFiltersOptions {
  /** Chart figures (music-data.json) for the BPM / length / NPS sorts. */
  metrics?: ChartMetricsIndex;
  /** MasterLiveMusicCategory names for the category filter; without them the filter is hidden. */
  categories?: ReadonlyMap<number, string>;
}

/** The chart the list's per-chart figures describe: the one difficulty filtered on, else Expert. */
export function focusDifficulty(filters: MusicFilterState): MusicDifficulty {
  return filters.difficulties.length === 1 ? filters.difficulties[0]! : "expert";
}

/** A song's chart of a difficulty (null when the song lacks it). */
export function focusChart(song: MusicViewModel, difficulty: MusicDifficulty) {
  return song.difficulties.find((entry) => entry.difficulty === difficulty) ?? null;
}

/** The figures of a song's chart. */
export function chartMetricsOf(metrics: ChartMetricsIndex, song: MusicViewModel, difficulty: MusicDifficulty): ChartMetrics | null {
  const chart = focusChart(song, difficulty);
  return chart ? lookupMetrics(metrics, song.id, difficulty, chart.scoreId) : null;
}

/** Search, attribute, band, category, credit, difficulty, level and sort state over a song list; render the panel with <MusicFilters>. */
export function useMusicFilters(songs: readonly MusicViewModel[], locale: AppLocale, sortPage: string, options: MusicFiltersOptions = {}) {
  const metrics = options.metrics ?? EMPTY_METRICS_INDEX;
  const withMetrics = options.metrics !== undefined;
  const categoryNames = options.categories;
  const [filters, setFilters] = useState<MusicFilterState>(EMPTY_MUSIC_FILTERS);
  const sort = useListSort(sortPage, locale, "date", { numeric: withMetrics ? SORT_FIELDS : BASIC_SORT_FIELDS });
  const { onChange: setSort } = sort;

  const bands = useMemo(() => musicBandOptions(songs), [songs]);
  const hasOtherBand = useMemo(() => hasOtherBandMusic(songs), [songs]);
  const levelBounds = useMemo(() => musicLevelBounds(songs), [songs]);
  const categories = useMemo(() => categoryNames ? musicCategoryOptions(songs).map(([id, count]) => ({ id, count, name: categoryNames.get(id) ?? `#${id}` })) : [], [songs, categoryNames]);
  const credits = useMemo(() => Object.fromEntries(MUSIC_CREDIT_FIELDS.map((field) => [field, musicCreditOptions(songs, field, locale)])) as Record<MusicCreditField, Array<{ name: string; count: number }>>, [songs, locale]);
  const filtered = useMemo(() => filterMusic(songs, filters), [songs, filters]);
  const focus = focusDifficulty(filters);
  const sorted = useMemo(() => {
    const figure = (pick: (entry: ChartMetrics) => number | null) => (song: MusicViewModel) => {
      const entry = chartMetricsOf(metrics, song, focus);
      return entry ? pick(entry) : null;
    };
    const levelOf = (difficulty: MusicDifficulty) => (song: MusicViewModel) => focusChart(song, difficulty)?.displayLevel ?? null;
    return sortEntries(filtered, sort.value, locale, {
      numeric: {
        level: levelOf(focus),
        notes: (song) => focusChart(song, focus)?.notesCount ?? null,
        bpm: figure((entry) => entry.bpmMax ?? entry.bpm),
        duration: figure((entry) => entry.durationMs),
        nps: figure((entry) => entry.nps),
        category: (song) => song.categoryIds?.[0] ?? null,
        ...Object.fromEntries(MUSIC_DIFFICULTIES.map((difficulty) => [`level-${difficulty}`, levelOf(difficulty)])),
      },
    });
  }, [filtered, sort.value, locale, metrics, focus]);
  const hasActiveFilters = sort.value !== "default" || hasMusicFilters(filters);

  const reset = useCallback(() => {
    setSort("default");
    setFilters(EMPTY_MUSIC_FILTERS);
  }, [setSort]);

  return { songs, filters, setFilters, sort, bands, hasOtherBand, levelBounds, categories, credits, focus, metrics, filtered, sorted, hasActiveFilters, reset };
}

export type MusicFiltersController = ReturnType<typeof useMusicFilters>;

interface MusicFiltersProps {
  locale: AppLocale;
  controller: MusicFiltersController;
  variant?: "card" | "plain";
  /** Replaces the controller's reset, e.g. to also forget remembered state. */
  onReset?: () => void;
}

/** Credit options shown before "show all". */
const CREDIT_PREVIEW = 10;

export default function MusicFilters({ locale, controller, variant = "plain", onReset }: MusicFiltersProps) {
  const { songs, filters, setFilters, sort, bands, hasOtherBand, levelBounds, categories, credits, filtered, hasActiveFilters, reset } = controller;
  const panelSort = useMemo(() => ({ ...sort, options: sort.options.filter((option) => {
    const key = /^field:(.+):(?:asc|desc)$/.exec(option.value)?.[1];
    return !key || PANEL_SORT_KEYS.has(key);
  }) }), [sort]);
  return (
    <BaseFilters
      sort={panelSort}
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

      {categories.length > 1 && (
        <FilterSection title={t(locale, "music.filters.category")}>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={filters.categories.length === 0} onClick={() => setFilters((current) => ({ ...current, categories: [] }))}>
              ALL
            </FilterButton>
            {categories.map((category) => (
              <FilterButton
                key={category.id}
                active={filters.categories.includes(category.id)}
                onClick={() => setFilters((current) => ({ ...current, categories: toggleArrayItem(current.categories, category.id) }))}
              >
                {category.name}
                <CountBadge count={category.count} />
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      )}

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

      {MUSIC_CREDIT_FIELDS.map((field) => credits[field].length > 0 && (
        <CreditFilter
          key={field}
          locale={locale}
          title={t(locale, `music.${field}`)}
          options={credits[field]}
          selected={filters[CREDIT_FILTER_KEYS[field]]}
          onChange={(names) => setFilters((current) => ({ ...current, [CREDIT_FILTER_KEYS[field]]: names }))}
        />
      ))}
    </BaseFilters>
  );
}

function CountBadge({ count }: { count: number }) {
  return <span className="ml-1.5 font-mono text-[10px] font-semibold opacity-70">{count}</span>;
}

/** People of one credit field, most credited first; the rest behind "show all" (selected ones always shown). */
function CreditFilter({ locale, title, options, selected, onChange }: {
  locale: AppLocale;
  title: string;
  options: ReadonlyArray<{ name: string; count: number }>;
  selected: readonly string[];
  onChange: (names: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? options : options.filter((option, index) => index < CREDIT_PREVIEW || selected.includes(option.name));
  const hidden = options.length - shown.length;
  return (
    <FilterSection title={title}>
      <div className="flex flex-wrap gap-2">
        <FilterButton active={selected.length === 0} onClick={() => onChange([])}>ALL</FilterButton>
        {shown.map((option) => (
          <FilterButton key={option.name} active={selected.includes(option.name)} onClick={() => onChange(toggleArrayItem(selected, option.name))}>
            {option.name}
            <CountBadge count={option.count} />
          </FilterButton>
        ))}
        {(hidden > 0 || expanded) && options.length > CREDIT_PREVIEW && (
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mn-focus rounded-lg px-2 py-1.5 text-xs font-bold text-[var(--mn-accent-deep)] hover:underline"
          >
            {expanded ? t(locale, "music.filters.showFewer") : t(locale, "music.filters.showAll", { count: options.length })}
          </button>
        )}
      </div>
    </FilterSection>
  );
}

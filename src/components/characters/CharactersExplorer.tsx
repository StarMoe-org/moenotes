import { useEffect, useMemo, useCallback, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import ServerScope from "@/components/shared/ServerScope";
import BaseFilters, { BandFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import { listForServer, type ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer, useServerAssetUrl } from "@/lib/servers/use-content-server";
import { localizePath } from "@/i18n/routing";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { entityLinkPath } from "@/lib/route/entity-link";
import {
  getBandSmallIconUrl,
  getCharacterThumbnailUrl,
} from "@/lib/cards/assets";
import { type CharacterViewModel } from "@/lib/characters/data";
import {
  EMPTY_CHARACTER_FILTERS,
  birthdaySortValue,
  hasCharacterFilters,
  matchesCharacterFilters,
  parseCharacterFilterState,
  positionOptions,
  schoolOptions,
  type CharacterFilterState,
} from "@/lib/characters/list-filter";

interface Props {
  locale: AppLocale;
  initialCharacters: {
    characters: ServerFaceted<CharacterViewModel>[];
    bands: ServerFaceted<BandModel>[];
  };
  servers: GameServer[];
}

interface BandModel {
  id: number;
  name: string;
  description: string;
  color: string;
}

const SORT_FIELDS = [{ key: "birthday", labelKey: "characters.list.sortBirthday", initialDirection: "asc" as const }];
const SORT_READERS = { birthday: birthdaySortValue };
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;

export default function CharactersExplorer({ locale, servers, initialCharacters }: Props) {
  const memory = useListPageMemory("characters");
  const [server, pickServer] = useContentServer(locale, servers);
  const assetUrl = useServerAssetUrl(server);
  const data = useMemo(() => ({
    characters: listForServer(initialCharacters.characters, server),
    bands: listForServer(initialCharacters.bands, server),
  }), [initialCharacters, server]);
  const [filters, setFilters] = useState<CharacterFilterState>(EMPTY_CHARACTER_FILTERS);
  const sort = useListSort("characters", locale, "", { numeric: SORT_FIELDS });

  useEffect(() => {
    setFilters(parseCharacterFilterState(memory.state?.filtersHash));
  }, [memory.state?.filtersHash]);

  const filtered = useMemo(() => data.characters.filter((char) => matchesCharacterFilters(char, filters)), [data.characters, filters]);
  // The default order groups the characters by band; any other sort lists them in one grid.
  const sorted = useMemo(() => sortEntries(filtered, sort.value, locale, { numeric: SORT_READERS }), [filtered, sort.value, locale]);
  const grouped = sort.value === "default";
  const positions = useMemo(() => positionOptions(data.characters), [data.characters]);
  const schools = useMemo(() => schoolOptions(data.characters), [data.characters]);
  const monthName = useMemo(() => {
    const format = new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" });
    return (month: number) => format.format(new Date(Date.UTC(2024, month - 1, 1)));
  }, [locale]);
  const hasActiveFilters = sort.value !== "default" || hasCharacterFilters(filters);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;

    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    memory.saveState({ scrollY: window.scrollY, filtersHash: JSON.stringify(filters) });
  }, [memory, filters]);

  const resetFilters = () => {
    sort.onChange("default");
    setFilters(EMPTY_CHARACTER_FILTERS);
    memory.clearState();
  };

  const toggle = (field: "positions" | "schools", value: string) => setFilters((current) => ({ ...current, [field]: toggleArrayItem(current[field], value) }));

  useQuickFilter(t(locale, "characters.filterTitle"), (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "characters.filterTitle")}
      searchValue={filters.query}
      onSearchChange={(query) => setFilters((current) => ({ ...current, query }))}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "characters.searchPlaceholder")}
      resultCount={filtered.length}
      totalCount={data.characters.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <BandFilter
        title={t(locale, "characters.band")}
        bands={data.bands.map((band): [number, string] => [band.id, band.name])}
        selectedBands={filters.bands}
        onChange={(bands) => setFilters((current) => ({ ...current, bands }))}
      />
      <FilterSection title={t(locale, "characters.list.position")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filters.positions.length === 0} onClick={() => setFilters((current) => ({ ...current, positions: [] }))}>ALL</FilterButton>
          {positions.map((part) => <FilterButton key={part} active={filters.positions.includes(part)} onClick={() => toggle("positions", part)}>{part}</FilterButton>)}
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "characters.list.school")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filters.schools.length === 0} onClick={() => setFilters((current) => ({ ...current, schools: [] }))}>ALL</FilterButton>
          {schools.map((school) => <FilterButton key={school.key} active={filters.schools.includes(school.key)} onClick={() => toggle("schools", school.key)}>{school.name}</FilterButton>)}
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "characters.list.birthMonth")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={filters.months.length === 0} onClick={() => setFilters((current) => ({ ...current, months: [] }))}>ALL</FilterButton>
          {MONTHS.map((month) => (
            <FilterButton key={month} active={filters.months.includes(month)} onClick={() => setFilters((current) => ({ ...current, months: toggleArrayItem(current.months, month) }))}>
              {monthName(month)}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
    </BaseFilters>
  ), [sort.value, filters, filtered.length, data.characters.length, data.bands, positions, schools, hasActiveFilters, locale]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      {filtered.length === 0 ? (
        <div className="mn-paper p-8 text-center sm:p-12">
          <p className="text-sm font-medium text-[var(--mn-text-muted)]">{t(locale, "characters.list.empty")}</p>
          <button type="button" onClick={resetFilters} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "characters.reset")}
          </button>
        </div>
      ) : !grouped ? (
        <section className="mn-paper p-6 sm:p-8">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5">
            {sorted.map((char) => <CharacterCard key={char.id} char={char} locale={locale} onClick={saveCurrentState} />)}
          </div>
        </section>
      ) : (
        <div className="space-y-12">
          {data.bands.map((band) => {
            const bandChars = filtered.filter((char) => char.bandId === band.id);
            if (bandChars.length === 0) return null;

            return (
              <section key={band.id} className="mn-paper p-6 sm:p-8" aria-labelledby={`band-title-${band.id}`}>
                {/* Band Header (PJSK Style info box) */}
                <div className="flex items-start gap-4 border-b-[1.5px] border-dashed border-[var(--mn-border)]/30 pb-5 mb-6">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp-sm)]">
                    <img className="h-9 w-auto object-contain" src={assetUrl(getBandSmallIconUrl(band.id))} alt="" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 id={`band-title-${band.id}`} className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] flex items-center gap-2">
                      {band.name}
                      <span className="h-2.5 w-2.5 rounded-full border border-[var(--mn-border)]/50" style={{ backgroundColor: band.color }} />
                    </h2>
                    <p className="mt-1.5 text-xs font-semibold leading-relaxed text-[var(--mn-text-muted)] max-w-5xl">
                      {band.description}
                    </p>
                  </div>
                </div>

                {/* Character Cards Horizontal/Grid Row */}
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-5">
                  {bandChars.map((char) => (
                    <CharacterCard key={char.id} char={char} locale={locale} onClick={saveCurrentState} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </ServerScope>
  );
}

function CharacterCard({ char, locale, onClick }: { char: CharacterViewModel; locale: AppLocale; onClick: () => void }) {
  const assetUrl = useAssetUrl();
  return (
    <a
      href={localizePath(entityLinkPath({ routeId: "characters", detailId: char.id }), locale)}
      onClick={onClick}
      className="mn-list-card group relative block aspect-[1/2.8] w-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] shadow-[var(--mn-shadow-stamp)] transition-all hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      style={{ backgroundColor: char.mainColor }}
      aria-label={char.name}
    >
      {/* Card Background Shine and Stripe Pattern */}
      <div className="absolute inset-0 opacity-15 bg-gradient-to-tr from-transparent via-white to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 left-[20%] w-[30%] -skew-x-12 bg-white/10 pointer-events-none" />

      {/* Position/Role Badge */}
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)]">
        {char.bandPart}
      </span>

      {/* Character Thumbnail Artwork */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden pointer-events-none">
        <img
          className="h-full w-full object-cover object-top select-none transition-transform duration-300 group-hover:scale-105"
          src={assetUrl(getCharacterThumbnailUrl(char.id))}
          alt=""
          aria-hidden="true"
          loading="lazy"
        />
      </div>

      {/* Slanted Name tag sticker at the bottom */}
      <div className="mn-list-caption absolute bottom-4 left-3 right-3 z-10 bg-[var(--mn-paper)] border-[1.5px] border-[var(--mn-border)] rounded-2xl py-2.5 px-2 text-center shadow-[var(--mn-shadow-stamp-sm)] transition-transform duration-300 group-hover:scale-102">
        <span className="block text-xs font-black text-[var(--mn-text)] truncate">{char.name}</span>
        <span className="block text-[8px] font-bold text-[var(--mn-text-muted)] tracking-wider uppercase truncate mt-0.5">{char.enName}</span>
      </div>
    </a>
  );
}

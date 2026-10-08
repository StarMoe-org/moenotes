import { useEffect, useMemo, useCallback, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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
      <MdMuiProvider>
      {filtered.length === 0 ? (
        <Card variant="outlined" sx={{ px: { xs: 4, sm: 6 }, py: { xs: 4, sm: 6 }, textAlign: "center" }}>
          <Typography variant="body2" sx={{ fontWeight: 500, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "characters.list.empty")}</Typography>
          <Button variant="outlined" onClick={resetFilters} sx={{ mt: 3 }}>
            {t(locale, "characters.reset")}
          </Button>
        </Card>
      ) : !grouped ? (
        <Card component="section" variant="outlined" sx={{ p: { xs: 3, sm: 4 } }}>
          <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 2 }}>
            {sorted.map((char) => <CharacterCard key={char.id} char={char} locale={locale} onClick={saveCurrentState} />)}
          </Box>
        </Card>
      ) : (
        <Box sx={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {data.bands.map((band) => {
            const bandChars = filtered.filter((char) => char.bandId === band.id);
            if (bandChars.length === 0) return null;

            return (
              <Card key={band.id} component="section" variant="outlined" sx={{ p: { xs: 3, sm: 4 } }} aria-labelledby={`band-title-${band.id}`}>
                {/* Band Header (PJSK Style info box) */}
                <div className="flex items-start gap-4 border-b-[1.5px] border-dashed border-[var(--md-sys-color-outline-variant)]/30 pb-5 mb-6">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)]">
                    <img className="h-9 w-auto object-contain" src={assetUrl(getBandSmallIconUrl(band.id))} alt="" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <Typography component="h2" id={`band-title-${band.id}`} sx={{ fontFamily: "var(--mn-font-display)", fontSize: 20, color: "var(--md-sys-color-on-surface)", display: "flex", alignItems: "center", gap: 1 }}>
                      {band.name}
                      <span className="h-2.5 w-2.5 rounded-full border border-[var(--md-sys-color-outline-variant)]/50" style={{ backgroundColor: band.color }} />
                    </Typography>
                    <Typography variant="caption" component="p" sx={{ mt: 0.75, fontWeight: 600, lineHeight: 1.6, color: "var(--md-sys-color-on-surface-variant)", maxWidth: 1024, display: "block" }}>
                      {band.description}
                    </Typography>
                  </div>
                </div>

                {/* Character Cards Horizontal/Grid Row */}
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", sm: "repeat(3, minmax(0, 1fr))", md: "repeat(5, minmax(0, 1fr))" }, gap: 2 }}>
                  {bandChars.map((char) => (
                    <CharacterCard key={char.id} char={char} locale={locale} onClick={saveCurrentState} />
                  ))}
                </Box>
              </Card>
            );
          })}
        </Box>
      )}
      </MdMuiProvider>
    </ServerScope>
  );
}

function CharacterCard({ char, locale, onClick }: { char: CharacterViewModel; locale: AppLocale; onClick: () => void }) {
  const assetUrl = useAssetUrl();
  return (
    <a
      href={localizePath(entityLinkPath({ routeId: "characters", detailId: char.id }), locale)}
      onClick={onClick}
      className="group relative block aspect-[1/2.8] w-full overflow-hidden rounded-3xl border-[1.5px] border-[var(--md-sys-color-outline-variant)] transition-colors hover:border-[var(--md-sys-color-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
      style={{ backgroundColor: char.mainColor }}
      aria-label={char.name}
    >
      {/* Card Background Shine and Stripe Pattern */}
      <div className="absolute inset-0 opacity-15 bg-gradient-to-tr from-transparent via-white to-transparent pointer-events-none" />
      <div className="absolute top-0 bottom-0 left-[20%] w-[30%] -skew-x-12 bg-white/10 pointer-events-none" />

      {/* Position/Role Badge */}
      <span className="absolute top-3 left-3 z-10 px-2 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-md border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface)]">
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
      <div className="absolute bottom-4 left-3 right-3 z-10 bg-[var(--md-sys-color-surface-container-high)] border-[1.5px] border-[var(--md-sys-color-outline-variant)] rounded-2xl py-2.5 px-2 text-center transition-transform duration-300 group-hover:scale-102">
        <span className="block text-xs font-black text-[var(--md-sys-color-on-surface)] truncate">{char.name}</span>
        <span className="block text-[8px] font-bold text-[var(--md-sys-color-on-surface-variant)] tracking-wider uppercase truncate mt-0.5">{char.enName}</span>
      </div>
    </a>
  );
}

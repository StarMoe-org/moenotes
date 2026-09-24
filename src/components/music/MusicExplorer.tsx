import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, {
  AttributeFilter,
  BandFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  type MusicViewModel,
} from "@/lib/music/data";
import SongCard from "@/components/music/SongCard";

interface Props {
  locale: AppLocale;
  initialSongs: MusicViewModel[];
}

const musicTypes: number[] = [1, 2, 3, 4, 5];

export default function MusicExplorer({ locale, initialSongs }: Props) {
  const memory = useListPageMemory("music");
  
  const [songs] = useState<MusicViewModel[]>(initialSongs);
  const [query, setQuery] = useState("");
  const sort = useListSort("music", locale, "date");
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedTypes(remembered.types);
    setSelectedBands(remembered.bands);
  }, [memory.state?.filtersHash]);

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
    const filtersHash = JSON.stringify({
      query,
      types: selectedTypes,
      bands: selectedBands,
    });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedTypes, selectedBands, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const bands = useMemo(() => {
    const values = new Map<number, string>();
    songs.forEach((song) => {
      if (song.bandId && song.bandName) values.set(song.bandId, song.bandName);
    });
    return [...values.entries()].sort(([a], [b]) => a - b);
  }, [songs]);

  const filteredSongs = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return songs.filter((song) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(song.musicType)) return false;
      if (selectedBands.length > 0 && !selectedBands.includes(song.bandId)) return false;
      return !needle || song.searchText.includes(needle);
    });
  }, [songs, query, selectedTypes, selectedBands]);

  const sortedEntries = useMemo(() => sortEntries(filteredSongs, sort.value, locale), [filteredSongs, sort.value, locale]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedTypes.length > 0 || selectedBands.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedTypes([]);
    setSelectedBands([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "music.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "music.searchPlaceholder")}
      resultCount={filteredSongs.length}
      totalCount={songs.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <AttributeFilter
        title={t(locale, "cards.attribute")}
        attributes={musicTypes}
        selectedAttributes={selectedTypes}
        onChange={setSelectedTypes}
        getAttributeLabel={(value) => t(locale, `cards.attributes.${value}`)}
      />

      <BandFilter
        title={t(locale, "cards.band")}
        bands={bands}
        selectedBands={selectedBands}
        onChange={setSelectedBands}
      />
    </BaseFilters>
  );

  useQuickFilter(t(locale, "music.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedTypes,
    selectedBands,
    bands,
    hasActiveFilters,
    filteredSongs.length,
    songs.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {filteredSongs.length === 0 ? (
        <EmptyState locale={locale} onReset={resetFilters} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6">
          {sortedEntries.map((song) => (
            <SongCard key={song.id} song={song} locale={locale} onClick={saveCurrentState} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
        {t(locale, "music.emptyTitle")}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
        {t(locale, "music.emptyDescription")}
      </p>
      <button type="button" onClick={onReset} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "music.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(filtersHash: string | undefined) {
  const fallback = { query: "", types: [] as number[], bands: [] as number[] };
  if (!filtersHash) return fallback;
  try {
    const raw = JSON.parse(filtersHash) as Record<string, unknown>;
    return {
      query: typeof raw.query === "string" ? raw.query : "",
      types: Array.isArray(raw.types) ? (raw.types as number[]) : [],
      bands: Array.isArray(raw.bands) ? (raw.bands as number[]) : [],
    };
  } catch {
    return fallback;
  }
}

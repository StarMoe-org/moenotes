import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, {
  AttributeFilter,
  BandFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  type MusicViewModel,
} from "@/lib/music/data";
import {
  getCardTypeIconUrl,
  getBandSmallIconUrl,
  type CardType,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  initialSongs: MusicViewModel[];
}

const musicTypes: number[] = [1, 2, 3, 4, 5];
const difficultyKeys = ["easy", "normal", "hard", "expert"] as const;

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

function SongCard({ song, locale, onClick }: { song: MusicViewModel; locale: AppLocale; onClick: () => void }) {
  return (
    <a
      href={localizePath(`/music/${song.id}`, locale)}
      onClick={onClick}
      className="mn-list-card mn-focus group block relative rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] overflow-hidden shadow-[var(--mn-shadow-stamp)] transition-all hover:scale-[1.01] hover:shadow-[var(--mn-shadow-stamp-lg)] hover:-translate-y-0.5"
    >
      {/* Top Cover Block */}
      <div className="relative aspect-square w-full shrink-0 border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] overflow-hidden">
        <img
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          src={song.jacketUrl}
          alt={song.title}
          loading="lazy"
        />
        {/* Band Icon Overlaid (Top Left) */}
        <img
          className="absolute top-2 left-2 z-10 h-6 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          src={getBandSmallIconUrl(song.bandId)}
          alt={song.bandName}
          title={song.bandName}
          onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
        />
        {/* Attribute Icon Overlaid (Top Right) */}
        <img
          className="absolute top-2 right-2 z-10 h-5 w-5 drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
          src={getCardTypeIconUrl(song.musicType as CardType)}
          alt=""
          aria-hidden="true"
        />
      </div>

      {/* Bottom Info Area */}
      <div className="p-3 flex-1 flex flex-col justify-between gap-3">
        <div className="space-y-0.5">
          <h3 className="font-[var(--mn-font-display)] text-[15px] font-bold leading-snug text-[var(--mn-text)] truncate group-hover:text-[var(--mn-accent-deep)] transition-colors">
            {song.title}
          </h3>
          <p className="text-[10px] font-medium text-[var(--mn-text-muted)] truncate">
            {t(locale, "music.composer")}: {song.composer}
          </p>
        </div>

        {/* Difficulties Display */}
        <div className="flex items-center gap-1">
          {difficultyKeys.map((diffKey) => {
            const diff = song.difficulties.find((d) => d.difficulty === diffKey);
            if (!diff) return null;

            const diffColors = {
              easy: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-900/50",
              normal: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
              hard: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
              expert: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50",
            };

            const shortDiffLabels: Record<string, string> = {
              easy: "EZ",
              normal: "NM",
              hard: "HD",
              expert: "EX",
            };

            return (
              <div
                key={diffKey}
                className={`flex-1 text-center py-0.5 rounded text-[8px] font-black border uppercase tracking-tighter ${diffColors[diffKey]}`}
              >
                <span className="block opacity-60 text-[6px] leading-none mb-0.5">{shortDiffLabels[diffKey]}</span>
                <span className="font-mono text-[10px]">{diff.displayLevel}</span>
              </div>
            );
          })}
        </div>
      </div>
    </a>
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

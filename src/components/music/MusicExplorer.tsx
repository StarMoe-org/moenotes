import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { FilterButton, FilterSection } from "@/components/shared/BaseFilters";
import QuickFilterButton from "@/components/shared/QuickFilterButton";
import { fetchMasterData } from "@/lib/masterdata/client";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  normalizeMusic,
  validateMasterTable,
  type MusicViewModel,
  type RawMusic,
  type RawMusicScore,
  type RawCharacter,
  type RawBand,
  type RawText,
} from "@/lib/music/data";
import {
  getCardTypeIconUrl,
  getBandSmallIconUrl,
  type CardType,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
}

const musicTypes: number[] = [1, 2, 3, 4, 5];
const difficultyKeys = ["easy", "normal", "hard", "expert"] as const;

export default function MusicExplorer({ locale }: Props) {
  const memory = useListPageMemory("music");
  const remembered = parseRememberedFilters(memory.state?.filtersHash);
  
  const [songs, setSongs] = useState<MusicViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState(remembered.query);
  const [selectedTypes, setSelectedTypes] = useState<number[]>(remembered.types);
  const [selectedBands, setSelectedBands] = useState<number[]>(remembered.bands);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    void Promise.all([
      fetchMasterData("MasterLiveMusic.json", { validate: validateMasterTable<RawMusic> }),
      fetchMasterData("MasterLiveMusicScore.json", { validate: validateMasterTable<RawMusicScore> }),
      fetchMasterData("MasterCharacter.json", { validate: validateMasterTable<RawCharacter> }),
      fetchMasterData("MasterBand.json", { validate: validateMasterTable<RawBand> }),
      fetchMasterData("MasterText.json", { validate: validateMasterTable<RawText> }),
    ])
      .then(([musicTable, scoreTable, characterTable, bandTable, textTable]) => {
        if (!active) return;
        setSongs(
          normalizeMusic(
            musicTable._allData,
            scoreTable._allData,
            characterTable._allData,
            bandTable._allData,
            textTable._allData,
            locale
          )
        );
      })
      .catch((err) => {
        console.error("Failed to load music data:", err);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locale, reloadKey]);

  useEffect(() => {
    if (loading || !memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;
    
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [loading, memory.state?.scrollY]);

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

  const hasActiveFilters = Boolean(query) || selectedTypes.length > 0 || selectedBands.length > 0;

  const toggleFilter = (list: number[], setList: (next: number[]) => void, value: number) => {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setSelectedTypes([]);
    setSelectedBands([]);
    memory.clearState();
  };

  const filters = (disableCollapse: boolean) => (
    <BaseFilters
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
      disableCollapse={disableCollapse}
    >
      <FilterSection title={t(locale, "cards.attribute")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedTypes.length === 0} onClick={() => setSelectedTypes([])}>ALL</FilterButton>
          {musicTypes.map((value) => {
            const name = t(locale, `cards.attributes.${value}`);
            return (
              <FilterButton key={value} active={selectedTypes.includes(value)} onClick={() => toggleFilter(selectedTypes, setSelectedTypes, value)}>
                <span className="flex items-center" title={name} aria-label={name}>
                  <img className="h-5 w-5" src={getCardTypeIconUrl(value as CardType)} alt={name} />
                </span>
              </FilterButton>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title={t(locale, "cards.band")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedBands.length === 0} onClick={() => setSelectedBands([])}>ALL</FilterButton>
          {bands.map(([id, name]) => (
            <FilterButton key={id} active={selectedBands.includes(id)} onClick={() => toggleFilter(selectedBands, setSelectedBands, id)}>
              <span className="flex items-center" title={name} aria-label={name}>
                <img className="h-5 w-auto object-contain" src={getBandSmallIconUrl(id)} alt={name} />
              </span>
            </FilterButton>
          ))}
        </div>
      </FilterSection>
    </BaseFilters>
  );

  return (
    <>
      <div className="mb-6 lg:hidden">{filters(false)}</div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="sticky top-24 hidden min-w-0 lg:block">{filters(true)}</aside>
        <section className="min-w-0" aria-live="polite">
          {loading ? (
            <LoadingGrid label={t(locale, "music.loading")} />
          ) : error ? (
            <ErrorState locale={locale} onRetry={() => setReloadKey((value) => value + 1)} />
          ) : filteredSongs.length === 0 ? (
            <EmptyState locale={locale} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6">
              {filteredSongs.map((song) => (
                <SongCard key={song.id} song={song} locale={locale} onClick={saveCurrentState} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="lg:hidden">
        <QuickFilterButton
          title={t(locale, "music.filterTitle")}
          buttonLabel={t(locale, "cards.quickFilter")}
          content={<div className="min-w-0">{filters(true)}</div>}
        />
      </div>
    </>
  );
}

function SongCard({ song, locale, onClick }: { song: MusicViewModel; locale: AppLocale; onClick: () => void }) {
  return (
    <a
      href={localizePath(`/music/${song.id}`, locale)}
      onClick={onClick}
      className="mn-focus mn-stamp-press group block relative rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] overflow-hidden shadow-[var(--mn-shadow-stamp)] transition-all hover:scale-[1.01] hover:shadow-[var(--mn-shadow-stamp-lg)] hover:-translate-y-0.5"
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

function LoadingGrid({ label }: { label: string }) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6" aria-label={label}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="mn-paper h-80 animate-pulse" />
      ))}
    </div>
  );
}

function ErrorState({ locale, onRetry }: { locale: AppLocale; onRetry: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12" role="alert">
      <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
        {t(locale, "music.loadErrorTitle")}
      </h2>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
        {t(locale, "music.loadErrorDescription")}
      </p>
      <button type="button" onClick={onRetry} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "cards.retry")}
      </button>
    </div>
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

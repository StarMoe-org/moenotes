import { useEffect, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  type MusicViewModel,
} from "@/lib/music/data";
import { parseMusicFilters, serializeMusicFilters } from "@/lib/music/filter";
import MusicFilters, { useMusicFilters } from "@/components/music/MusicFilters";
import SongCard from "@/components/music/SongCard";

interface Props {
  locale: AppLocale;
  initialSongs: MusicViewModel[];
}

export default function MusicExplorer({ locale, initialSongs }: Props) {
  const memory = useListPageMemory("music");

  const music = useMusicFilters(initialSongs, locale, "music");
  const { filters, setFilters } = music;

  useEffect(() => {
    setFilters(parseMusicFilters(memory.state?.filtersHash));
  }, [memory.state?.filtersHash, setFilters]);

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
    memory.saveState({ scrollY: window.scrollY, filtersHash: serializeMusicFilters(filters) });
  }, [filters, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const resetFilters = () => {
    music.reset();
    memory.clearState();
  };

  const quickFilterContent = <MusicFilters locale={locale} controller={music} onReset={resetFilters} />;

  useQuickFilter(t(locale, "music.filterTitle"), quickFilterContent, [
    music.sort.value,
    filters,
    music.bands,
    music.levelBounds,
    music.hasActiveFilters,
    music.filtered.length,
    music.songs.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {music.filtered.length === 0 ? (
        <EmptyState locale={locale} onReset={resetFilters} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6">
          {music.sorted.map((song) => (
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

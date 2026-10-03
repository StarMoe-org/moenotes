import { useEffect, useCallback, useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import CollectionViewSwitch, { useCollectionView } from "@/components/shared/CollectionViewSwitch";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import type { ServerFaceted } from "@/lib/servers/facets";
import { serverOnlyLabel, useServerAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { setQueue } from "@/lib/audio/player";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_CHIP_CLASSES, DIFFICULTY_SHORT_LABELS, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";
import { parseMusicFilters, serializeMusicFilters } from "@/lib/music/filter";
import { formatBpm, formatDuration } from "@/lib/music/metrics";
import { useSongTitle } from "@/lib/music/title-preference";
import { songQueue, songTrack } from "@/lib/music/tracks";
import { useChartMetrics } from "@/lib/music/use-chart-metrics";
import MusicFilters, { chartMetricsOf, useMusicFilters, type MusicFiltersController } from "@/components/music/MusicFilters";
import MusicTable, { songHref } from "@/components/music/MusicTable";
import SongCard from "@/components/music/SongCard";

interface Props {
  locale: AppLocale;
  initialSongs: ServerFaceted<MusicViewModel>[];
  servers: GameServer[];
  /** MasterLiveMusicCategory names, `[id, name]`. */
  categories?: Array<[number, string]>;
}

const VIEWS = ["grid", "list", "table"] as const;

export default function MusicExplorer({ locale, servers, initialSongs, categories = [] }: Props) {
  const memory = useListPageMemory("music");
  const [view, setView] = useCollectionView("music", VIEWS, "grid");

  const { server, pickServer, items: songs } = useServerList(locale, servers, initialSongs);
  const { index: metrics } = useChartMetrics();
  const categoryNames = useMemo(() => new Map(categories), [categories]);
  const music = useMusicFilters(songs, locale, "music", { metrics, categories: categoryNames });
  const { filters, setFilters } = music;
  const titleOf = useSongTitle();
  const assetUrl = useServerAssetUrl(server);
  const timeZone = useDisplayTimeZone();

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
    music.hasOtherBand,
    music.levelBounds,
    music.categories,
    music.credits,
    music.hasActiveFilters,
    music.filtered.length,
    music.songs.length,
    locale,
  ]);

  const queue = useMemo(() => songQueue(music.sorted, titleOf, assetUrl), [music.sorted, titleOf, assetUrl]);
  const actions = (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => setQueue(queue)}
        disabled={queue.length === 0}
        className="mn-focus mn-stamp-press inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-3.5 py-1.5 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)] disabled:opacity-50"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
        {t(locale, "music.playAll", { count: queue.length })}
      </button>
      <CollectionViewSwitch locale={locale} views={VIEWS} value={view} onChange={setView} compact />
    </div>
  );

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} actions={actions}>
      <section className="min-w-0" aria-live="polite">
        {music.filtered.length === 0 ? (
          <EmptyState locale={locale} onReset={resetFilters} />
        ) : view === "table" ? (
          <MusicTable
            locale={locale}
            songs={music.sorted}
            metrics={metrics}
            focus={music.focus}
            titleOf={titleOf}
            assetUrl={assetUrl}
            categoryName={(id) => categoryNames.get(id) ?? `#${id}`}
            timeZone={timeZone}
            sort={music.sort.value}
            onSort={music.sort.onChange}
            onOpen={saveCurrentState}
          />
        ) : view === "list" ? (
          <MusicList locale={locale} music={music} titleOf={titleOf} assetUrl={assetUrl} onOpen={saveCurrentState} servers={servers} />
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6">
            {music.sorted.map((song) => (
              <SongCard key={song.id} song={song} locale={locale} onClick={saveCurrentState} badge={serverOnlyLabel(locale, song, servers)} playable />
            ))}
          </div>
        )}
      </section>
    </ServerScope>
  );
}

/** One row per song: jacket, title and band, the four levels, the focus chart's length and BPM, and a play button. */
function MusicList({ locale, music, titleOf, assetUrl, onOpen, servers }: {
  locale: AppLocale;
  music: MusicFiltersController;
  titleOf: (song: MusicViewModel) => string;
  assetUrl: (url: string) => string;
  onOpen: () => void;
  servers: GameServer[];
}) {
  return (
    <ul className="space-y-2">
      {music.sorted.map((song) => {
        const title = titleOf(song);
        const track = songTrack(song, title, assetUrl);
        const figures = chartMetricsOf(music.metrics, song, music.focus);
        const badge = serverOnlyLabel(locale, song, servers);
        return (
          <li key={song.id} className="mn-list-card mn-list-card-row flex items-center gap-3 border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] p-2 pr-3 shadow-[var(--mn-shadow-stamp-sm)]">
            <a href={songHref(song, locale)} onClick={onOpen} className="mn-focus group flex min-w-0 flex-1 items-center gap-3 rounded-lg">
              <img className="h-14 w-14 shrink-0 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-[var(--mn-font-display)] text-[15px] font-bold text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]" title={title}>{title}</span>
                <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] font-semibold text-[var(--mn-text-muted)]">
                  {song.bandId > 0 && <img className="h-4 w-auto shrink-0 object-contain" src={assetUrl(getBandSmallIconUrl(song.bandId))} alt="" aria-hidden="true" />}
                  <span className="truncate">{song.bandName}</span>
                  {badge && <span className="shrink-0 rounded-full bg-[var(--mn-accent-soft)] px-1.5 text-[10px] text-[var(--mn-accent-deep)]">{badge}</span>}
                </span>
              </span>
              <span className="hidden shrink-0 gap-1 sm:flex">
                {MUSIC_DIFFICULTIES.map((difficulty) => {
                  const chart = song.difficulties.find((entry) => entry.difficulty === difficulty);
                  return (
                    <span key={difficulty} className={`w-9 rounded border py-0.5 text-center ${DIFFICULTY_CHIP_CLASSES[difficulty]} ${chart ? "" : "opacity-30"}`}>
                      <span className="block text-[7px] font-black leading-none opacity-60">{DIFFICULTY_SHORT_LABELS[difficulty]}</span>
                      <span className="font-mono text-[11px] font-black">{chart?.displayLevel ?? "—"}</span>
                    </span>
                  );
                })}
              </span>
              <span className="hidden w-24 shrink-0 text-right font-mono text-[11px] font-semibold leading-5 text-[var(--mn-text-muted)] md:block">
                <span className="block">{formatDuration(figures?.durationMs)}</span>
                <span className="block">{t(locale, "music.bpmValue", { bpm: formatBpm(figures) })}</span>
              </span>
            </a>
            {track ? <AudioPlayButton locale={locale} track={track} size="sm" /> : <span className="h-8 w-8 shrink-0" aria-hidden="true" />}
          </li>
        );
      })}
    </ul>
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

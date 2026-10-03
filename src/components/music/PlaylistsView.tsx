import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import ServerScope from "@/components/shared/ServerScope";
import AudioPlayButton from "@/components/shared/AudioPlayButton";
import BandLogo from "@/components/shared/BandLogo";
import { setQueue } from "@/lib/audio/player";
import type { MusicViewModel } from "@/lib/music/data";
import { formatDuration, lookupMetrics, type ChartMetricsIndex } from "@/lib/music/metrics";
import { musicPlaylists, playlistDuration, type MusicPlaylist } from "@/lib/music/playlists";
import { useSongTitle } from "@/lib/music/title-preference";
import { songQueue, songTrack, type SongAudioKind } from "@/lib/music/tracks";
import { useChartMetrics } from "@/lib/music/use-chart-metrics";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { songHref } from "@/components/music/MusicTable";

interface Props {
  locale: AppLocale;
  servers: GameServer[];
  initialSongs: ServerFaceted<MusicViewModel>[];
}

const KINDS: readonly SongAudioKind[] = ["preview", "full"];

/** A song's length from music-data.json (the BGM's, shared by its charts). */
function songLength(metrics: ChartMetricsIndex, song: MusicViewModel): number | null {
  for (const chart of song.difficulties) {
    const length = lookupMetrics(metrics, song.id, chart.difficulty, chart.scoreId)?.durationMs;
    if (length) return length;
  }
  return null;
}

/** Each band's songs as a playlist in the game's order, with play all and per-song previews. */
export default function PlaylistsView({ locale, servers, initialSongs }: Props) {
  const { server, pickServer, items: songs } = useServerList(locale, servers, initialSongs);
  const { index: metrics } = useChartMetrics();
  const assetUrl = useServerAssetUrl(server);
  const titleOf = useSongTitle();
  const [kind, setKind] = useState<SongAudioKind>("preview");
  const playlists = useMemo(() => musicPlaylists(songs), [songs]);

  const kindSwitch = (
    <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "music.playlists.audioKind")}>
      {KINDS.map((entry) => (
        <button
          key={entry}
          type="button"
          aria-pressed={kind === entry}
          onClick={() => setKind(entry)}
          className={`mn-focus rounded-full px-3 py-1.5 text-xs font-bold transition ${kind === entry ? "bg-[var(--mn-accent-soft)] text-[var(--mn-text)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
        >
          {t(locale, `music.audio.${entry}`)}
        </button>
      ))}
    </div>
  );

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} actions={kindSwitch}>
      {playlists.length === 0 ? (
        <div className="mn-paper p-8 text-center sm:p-12">
          <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "music.emptyTitle")}</h2>
        </div>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {playlists.map((playlist) => (
            <Playlist
              key={playlist.bandId}
              locale={locale}
              playlist={playlist}
              kind={kind}
              metrics={metrics}
              titleOf={titleOf}
              assetUrl={assetUrl}
            />
          ))}
        </div>
      )}
    </ServerScope>
  );
}

function Playlist({ locale, playlist, kind, metrics, titleOf, assetUrl }: {
  locale: AppLocale;
  playlist: MusicPlaylist;
  kind: SongAudioKind;
  metrics: ChartMetricsIndex;
  titleOf: (song: MusicViewModel) => string;
  assetUrl: (url: string) => string;
}) {
  const queue = useMemo(() => songQueue(playlist.songs, titleOf, assetUrl, kind), [playlist.songs, titleOf, assetUrl, kind]);
  const duration = useMemo(() => playlistDuration(playlist.songs, (song) => songLength(metrics, song)), [playlist.songs, metrics]);
  const name = playlist.bandName || t(locale, "music.playlists.otherBand");
  const headingId = `playlist-${playlist.bandId}`;
  return (
    <section className="mn-paper flex min-w-0 flex-col overflow-hidden" aria-labelledby={headingId}>
      <header className="flex flex-wrap items-center gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-5 py-4">
        <div className="min-w-0 flex-1">
          <div className="flex h-7 items-center">
            {playlist.bandId > 0 ? <BandLogo bandId={playlist.bandId} bandName={name} locale={locale} /> : null}
          </div>
          <h2 id={headingId} className="mt-1 truncate font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{name}</h2>
          <p className="text-xs font-semibold text-[var(--mn-text-muted)]">
            {t(locale, "music.playlists.songCount", { count: playlist.songs.length })}
            {duration.known > 0 && (
              <span> · {t(locale, duration.known < playlist.songs.length ? "music.playlists.durationPartial" : "music.playlists.duration", { duration: formatTotal(duration.totalMs) })}</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setQueue(queue)}
          disabled={queue.length === 0}
          className="mn-focus mn-stamp-press inline-flex items-center gap-1.5 rounded-full border-[1.5px] border-[var(--mn-accent-deep)] bg-[var(--mn-accent)] px-4 py-2 text-xs font-bold text-white shadow-[var(--mn-shadow-stamp-sm)] disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" /></svg>
          {t(locale, "music.playAll", { count: queue.length })}
        </button>
      </header>
      <ol className="max-h-[28rem] divide-y divide-dashed divide-[var(--mn-border)]/60 overflow-y-auto">
        {playlist.songs.map((song, index) => {
          const title = titleOf(song);
          const track = songTrack(song, title, assetUrl, kind);
          return (
            <li key={song.id} className="flex items-center gap-3 px-4 py-2">
              <span className="w-6 shrink-0 text-right font-mono text-xs font-bold text-[var(--mn-text-muted)]">{index + 1}</span>
              <a href={songHref(song, locale)} className="mn-focus group flex min-w-0 flex-1 items-center gap-3 rounded-lg">
                <img className="h-10 w-10 shrink-0 rounded-lg border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover" src={assetUrl(song.jacketUrl)} alt="" loading="lazy" />
                <span className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]" title={title}>{title}</span>
                <span className="shrink-0 font-mono text-[11px] text-[var(--mn-text-muted)]">{formatDuration(songLength(metrics, song))}</span>
              </a>
              {track ? <AudioPlayButton locale={locale} track={track} size="sm" /> : <span className="h-8 w-8 shrink-0" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** "h:mm:ss" or "m:ss". */
function formatTotal(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return hours ? `${hours}:${String(minutes).padStart(2, "0")}:${rest}` : `${minutes}:${rest}`;
}

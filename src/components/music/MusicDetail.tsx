"use client";

import { SiriusIcon } from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, useRef, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope, { HeadingServerSwitch } from "@/components/shared/ServerScope";
import AssetGallery, { type GalleryAsset } from "@/components/shared/AssetGallery";
import DetailHero from "@/components/shared/DetailHero";
import { DetailList, DetailRow } from "@/components/shared/DetailRows";
import { BandLogoMark } from "@/components/shared/BandLogo";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, forServer, valueForServer, type ServerFaceted, type ServerFacetedValue } from "@/lib/servers/facets";
import { useAssetUrl, useContentServer } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import { formatMasterDay } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { getChartPreviewHref } from "@/lib/music/chart-preview";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";
import { SpoilerNotice, DeveloperTestingBanner } from "@/components/shared/SpoilerNotice";
import ChartSheetDialog from "@/components/music/ChartSheetDialog";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import {
  type MusicViewModel,
  type SongDifficultyModel,
} from "@/lib/music/data";
import type { MusicDetailData } from "@/lib/masterdata/build-data";
import type { MusicLiveExtras } from "@/lib/masterdata/build-music";
import { useSongTitle } from "@/lib/music/title-preference";
import { useChartMetrics } from "@/lib/music/use-chart-metrics";
import MusicChartPanel, { MusicExpRewards } from "@/components/music/MusicChartPanel";
import { rewardName } from "@/components/shared/RewardChip";
import {
  getCardTypeIconUrl,
  getBandSmallIconUrl,
  getCharacterFaceIconUrl,
  type CardType,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  songId: number;
  initialSong: ServerFaceted<MusicViewModel> | null;
  /** Live-system extras joined from MasterLiveMusic*; per the first server in the merged list. */
  liveDetail?: MusicDetailData | null;
  /** Combo tier and exp rewards (build-music.ts), per server. */
  liveExtras?: ServerFacetedValue<MusicLiveExtras> | null;
  servers: GameServer[];
}

/** The song as the page's server has it (docs/servers.md). */
export default function MusicDetail({ locale, initialSong, liveDetail, liveExtras, servers }: Props) {
  const [server, pickServer] = useContentServer(locale, servers);
  const song = useMemo(() => initialSong && moveReleaseUrls(forServer(initialSong, server), entityServer(initialSong, server)), [initialSong, server]);
  const extras = useMemo(() => (liveExtras ? valueForServer(liveExtras, server) : null), [liveExtras, server]);
  // The hero carries the server switch beside the name, so the scope leaves its own out.
  const serverSwitch = <HeadingServerSwitch locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialSong?.servers ?? []} />;
  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} entityServers={initialSong?.servers ?? []} hideSwitch>
      <MusicDetailView locale={locale} song={song} liveDetail={liveDetail ?? null} extras={extras} serverSwitch={serverSwitch} />
    </ServerScope>
  );
}

function MusicDetailView({ locale, song, liveDetail, extras, serverSwitch }: { locale: AppLocale; song: MusicViewModel | null; liveDetail: MusicDetailData | null; extras: MusicLiveExtras | null; serverSwitch: ReactNode }) {
  const assetUrl = useAssetUrl();
  const titleOf = useSongTitle();
  const { index: metrics, status: metricsStatus } = useChartMetrics();
  const timeZone = useDisplayTimeZone();
  // The difficulty whose 2D chart sheet is open (null: none).
  const [sheetDifficulty, setSheetDifficulty] = useState<SongDifficultyModel["difficulty"] | null>(null);

  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const isUnreleased = Boolean(now !== null && song?.startAt && isSpoiler(song.startAt, now));

  if (!song) {
    return (
      <div className="md3-surface p-8 text-center sm:p-12">
        <h1 className="text-headline-small text-on-surface">{t(locale, "music.detailNotFound")}</h1>
        <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "music.detailNotFoundDescription")}</p>
      </div>
    );
  }

  if (isUnreleased && !showSpoiler) {
    return <SpoilerNotice locale={locale} />;
  }

  const attributeName = t(locale, `cards.attributes.${song.musicType}`);
  const title = titleOf(song);
  const jacket: GalleryAsset[] = [{ id: "jacket", label: t(locale, "music.assets.jacket"), url: song.jacketUrl, downloadName: `${song.jacketAssetName}.webp` }];

  return (
    <div className="w-full space-y-8">
      {isUnreleased && <DeveloperTestingBanner locale={locale} />}
      <DetailHero
        title={title}
        subtitle={title !== song.title ? song.title : undefined}
        aside={serverSwitch}
        eyebrow={<>
          <BandLogoMark locale={locale} bandId={song.bandId} />
          <span>{song.bandName}</span>
          <span className="inline-flex items-center gap-1.5 text-on-surface"><img className="h-5 w-5" src={assetUrl(getCardTypeIconUrl(song.musicType as CardType))} alt="" aria-hidden="true" />{attributeName}</span>
        </>}
      >
        {song.vocalists.length > 0 && (
          <ul className="mt-1 flex flex-wrap gap-2" aria-label={t(locale, "music.vocals")}>
            {song.vocalists.map((vocalist) => (
              <li key={vocalist.id}>
                <a href={localizePath(`/characters/${vocalist.id}`, locale)} className="md3-state inline-flex items-center gap-2 rounded-full border border-outline-variant py-1 pl-1 pr-3 text-label-large text-on-surface">
                  <img className="h-7 w-7 rounded-full bg-surface-container-highest object-cover" src={assetUrl(getCharacterFaceIconUrl(vocalist.id))} alt="" aria-hidden="true" />
                  {vocalist.name}
                </a>
              </li>
            ))}
          </ul>
        )}
      </DetailHero>

      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,2fr)_3fr] lg:items-start">
        <aside className="lg:sticky lg:top-24">
          <AssetGallery locale={locale} assets={jacket} shape="square">
            <SongAudioPanel locale={locale} song={song} title={title} />
          </AssetGallery>
        </aside>

        <section className="min-w-0 flex-1 space-y-6">
          <DetailList>
            <DetailRow label={t(locale, "music.composer")} value={song.composer} />
            <DetailRow label={t(locale, "music.lyricist")} value={song.lyricist} />
            <DetailRow label={t(locale, "music.arranger")} value={song.arranger} />
            <DetailRow label={t(locale, "cards.detailBand")} value={
              <span className="inline-flex items-center gap-1.5">
                <img className="h-5 w-auto object-contain" src={assetUrl(getBandSmallIconUrl(song.bandId))} alt="" aria-hidden="true" />
                {song.bandName}
              </span>
            } />
            <DetailRow label={t(locale, "music.releaseDate")} value={formatMasterDay(song.startAt, locale, timeZone)} />
            <DetailRow label={t(locale, "music.songId")} value={`#${song.id}`} />
            <DetailRow label={t(locale, "music.jacketAsset")} value={song.jacketAssetName} />
          </DetailList>

          {/* Difficulties Card */}
          <div className="md3-surface overflow-hidden">
            <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
              <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">
                {t(locale, "music.difficultiesTitle")}
              </h3>
            </div>
            <div className="p-6 sm:p-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {song.difficulties.map((diff) => {
                const config = difficultyStyles[diff.difficulty];
                const level = t(locale, `music.difficultyLevels.${diff.difficulty}`);
                const previewButton = "md3-button md3-button--outlined md3-button--small";

                return (
                  <div key={diff.difficulty} className={`p-3 border rounded-shape-lg flex flex-col items-center justify-between text-center gap-2 ${config.cardBg}`}>
                    <div className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />
                      <span className={`text-label-medium ${config.labelColor}`}>{config.shortLabel}</span>
                    </div>
                    <div className="font-mono text-headline-small text-primary my-0.5">
                      {diff.displayLevel}
                    </div>
                    <div className="text-label-small text-on-surface-variant">
                      {t(locale, "music.notesCount", { count: diff.notesCount })}
                    </div>
                    <div className="mt-1 flex flex-wrap justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSheetDifficulty(diff.difficulty)}
                        aria-label={t(locale, "music.preview2dLabel", { difficulty: level })}
                        className={previewButton}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <rect x="4" y="3" width="16" height="18" rx="2" /><path d="M10 3v18M4 12h16" />
                        </svg>
                        {t(locale, "music.preview2d")}
                      </button>
                      <a
                        href={getChartPreviewHref(locale, { musicId: song.id, difficulty: diff.difficulty })}
                        aria-label={t(locale, "music.preview3dLabel", { difficulty: level })}
                        className={previewButton}
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                        {t(locale, "music.preview3d")}
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <MusicChartPanel locale={locale} song={song} metrics={metrics} status={metricsStatus} comboTiers={extras?.comboTiers ?? []} />

          {liveDetail && <LiveSystemSections locale={locale} detail={liveDetail} />}

          {extras && <MusicExpRewards locale={locale} rewards={extras.expRewards} />}

          {/* Back Action */}
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("music"), locale)} className="md3-button md3-button--tonal">
              {t(locale, "music.backToList")}
            </a>
          </div>
        </section>
      </div>

      {song.difficulties.length > 0 && (
        <ChartSheetDialog locale={locale} song={song} difficulty={sheetDifficulty} onClose={() => setSheetDifficulty(null)} />
      )}
    </div>
  );
}

/** Renders the MasterLiveMusic* extras of the song: categories, score-rank ladder, alternate vocals and live rewards. */
function LiveSystemSections({ locale, detail }: { locale: AppLocale; detail: MusicDetailData }) {
  const { live, comboRewards, scoreRewards } = detail;
  if (!live) return null;
  const hasScoreRanks = live.scoreRanks.length > 0;
  const hasCombo = comboRewards.length > 0;
  const hasScore = scoreRewards.length > 0;
  if (!hasScoreRanks && !hasCombo && !hasScore && live.categories.length === 0 && live.anotherVocals.length === 0) return null;

  return (
    <div className="md3-surface overflow-hidden">
      <div className="border-b border-outline-variant px-6 py-4 sm:px-8">
        <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface sm:text-headline-small">{t(locale, "music.live.title")}</h3>
      </div>
      <div className="p-6 sm:p-8 space-y-6">
        {live.categories.length > 0 && (
          <section>
            <h4 className="text-label-medium text-on-surface-variant">{t(locale, "music.live.categories")}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {live.categories.map((category) => (
                <span key={category.id} className="inline-flex items-center rounded-full border border-outline-variant bg-surface-container-highest px-2.5 py-1 text-label-medium text-on-surface">
                  {category.name}
                </span>
              ))}
            </div>
          </section>
        )}

        {live.anotherVocals.length > 0 && (
          <section>
            <h4 className="text-label-medium text-on-surface-variant">{t(locale, "music.live.anotherVocals")}</h4>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {live.anotherVocals.map((vocal) => (
                <a
                  key={vocal.characterId}
                  href={localizePath(`/characters/${vocal.characterId}`, locale)}
                  className="md3-state inline-flex items-center gap-1.5 rounded-full border border-outline-variant bg-surface-container-highest px-2 py-0.5 text-label-medium text-on-surface shadow-sm transition-all hover:bg-primary hover:text-white"
                >
                  {vocal.name}
                </a>
              ))}
            </div>
          </section>
        )}

        {hasScoreRanks && (
          <section>
            <h4 className="text-label-medium text-on-surface-variant">{t(locale, "music.live.scoreRanks")}</h4>
            <div className="mt-2 overflow-x-auto rounded-shape-md border border-outline-variant">
              <table className="min-w-full divide-y divide-outline-variant text-body-medium">
                <thead className="bg-surface-container text-left text-label-medium text-on-surface-variant">
                  <tr>
                    <th className="px-3 py-2">{t(locale, "music.live.rank")}</th>
                    <th className="px-3 py-2 text-right">{t(locale, "music.live.requiredScore")}</th>
                    <th className="px-3 py-2 text-right">{t(locale, "music.live.battleScore")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dashed divide-outline-variant/50 bg-surface-container-low">
                  {live.scoreRanks.filter((row) => row.requiredScore > 0).map((row) => (
                    <tr key={row.liveScoreRank}>
                      <td className="px-3 py-2 font-black text-primary">{row.rank}</td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-on-surface">{row.requiredScore.toLocaleString(locale)}</td>
                      <td className="px-3 py-2 text-right font-mono text-on-surface-variant">{row.battleLiveRequiredScore > 0 ? row.battleLiveRequiredScore.toLocaleString(locale) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {(hasCombo || hasScore) && (
          <section className="grid gap-6 lg:grid-cols-2">
            {hasScore && (
              <div>
                <h4 className="text-label-medium text-on-surface-variant">{t(locale, "music.live.scoreRewards")}</h4>
                <ul className="mt-2 space-y-2">
                  {scoreRewards.map((entry, index) => (
                    <li key={`${entry.liveScoreRank}-${index}`} className="flex items-center justify-between gap-3 rounded-shape-md border border-outline-variant bg-surface-container-low px-3 py-2">
                      <span className="font-black text-primary">{entry.rank}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-label-large text-on-surface">{rewardName(entry.reward, locale)}<span className="ml-1.5 font-mono text-body-small text-on-surface-variant">×{entry.reward.count.toLocaleString(locale)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {hasCombo && (
              <div>
                <h4 className="text-label-medium text-on-surface-variant">{t(locale, "music.live.comboRewards")}</h4>
                <ul className="mt-2 space-y-2">
                  {comboRewards.map((entry, index) => (
                    <li key={`${entry.difficulty}-${index}`} className="flex items-center justify-between gap-3 rounded-shape-md border border-outline-variant bg-surface-container-low px-3 py-2">
                      <span className="text-label-medium text-primary">{t(locale, `music.difficultyLevels.${entry.difficulty}`)}</span>
                      <span className="min-w-0 flex-1 truncate text-right text-label-large text-on-surface">{rewardName(entry.reward, locale)}<span className="ml-1.5 font-mono text-body-small text-on-surface-variant">×{entry.reward.count.toLocaleString(locale)}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}


/** Saves a remote file under a readable name; opens it in a new tab when the browser blocks the blob download. */
async function saveRemoteFile(url: string, filename: string): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const objectUrl = window.URL.createObjectURL(await response.blob());
    const anchor = document.createElement("a");
    anchor.href = objectUrl;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(objectUrl);
  } catch {
    window.open(url, "_blank", "noopener");
  }
}

function safeFilename(value: string): string {
  return value.replace(/[\/:*?"<>|]+/g, "_").trim() || "audio";
}

function SongAudioPanel({ locale, song, title }: { locale: AppLocale; song: MusicViewModel; title: string }) {
  const tracks = [
    song.audioUrl && { kind: "full" as const, url: song.audioUrl },
    song.previewAudioUrl && { kind: "preview" as const, url: song.previewAudioUrl },
  ].filter((track): track is { kind: "full" | "preview"; url: string } => Boolean(track));
  const [active, setActive] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (tracks.length === 0) {
    return (
      <div className="md3-surface p-4 text-body-medium">
        <p className="font-bold text-on-surface">{t(locale, "music.audio.unavailableTitle")}</p>
        <p className="mt-1.5 text-body-small leading-6 text-on-surface-variant">{t(locale, "music.audio.unavailableDescription")}</p>
      </div>
    );
  }

  const track = tracks[Math.min(active, tracks.length - 1)]!;
  const download = async (item: (typeof tracks)[number]) => {
    setDownloading(item.kind);
    const suffix = item.kind === "preview" ? "_short" : "";
    // Release audio is published as AAC in M4A.
    await saveRemoteFile(item.url, `${safeFilename(title)}${suffix}.m4a`);
    setDownloading(null);
  };

  return (
    <div className="space-y-3">
      {tracks.length > 1 && (
        <div className="md3-segmented w-fit" role="group" aria-label={t(locale, "music.audio.title")}>
          {tracks.map((item, index) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={index === active}
              className="md3-segment md3-state"
            >
              {t(locale, `music.audio.${item.kind}`)}
            </button>
          ))}
        </div>
      )}
      <AudioPlayer locale={locale} src={track.url} title={title} label={t(locale, `music.audio.${track.kind}`)} />
      <div className="flex flex-wrap gap-2">
        {tracks.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => download(item)}
            disabled={downloading !== null}
            className="md3-button md3-button--tonal md3-button--small"
          >
            {downloading === item.kind
              ? <SiriusIcon className="" />
              : <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>}
            {t(locale, "music.audio.download", { kind: t(locale, `music.audio.${item.kind}`) })}
          </button>
        ))}
      </div>
    </div>
  );
}

function AudioPlayer({ locale, src, title, label }: { locale: AppLocale; src: string; title: string; label: string }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [src]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch((err) => console.error("Audio playback error:", err));
    }
  };

  const onTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const onLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration || 0);
    }
  };

  const onAudioEnded = () => {
    setIsPlaying(false);
    setCurrentTime(0);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div className="md3-surface overflow-hidden p-4 flex flex-col gap-3">
      <audio
        ref={audioRef}
        src={src}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={onTimeUpdate}
        onLoadedMetadata={onLoadedMetadata}
        onEnded={onAudioEnded}
      />

      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <span className="text-label-medium text-primary block opacity-75">
            {label}
          </span>
          <span className="text-label-medium text-on-surface truncate block mt-0.5" title={title}>
            {title}
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="md3-icon-button md3-icon-button--filled shrink-0"
          aria-label={t(locale, isPlaying ? "music.audio.pause" : "music.audio.play")}
        >
          {isPlaying ? (
            <svg className="fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-label-small text-on-surface-variant shrink-0 w-8">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          aria-label={t(locale, "music.audio.seek")}
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="md3-range min-w-0 flex-1"
          style={{ "--md3-range-progress": `${duration ? (currentTime / duration) * 100 : 0}%` } as React.CSSProperties}
        />
        <span className="font-mono text-label-small text-on-surface-variant shrink-0 w-8 text-right">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

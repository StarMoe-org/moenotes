import { useEffect, useState, useRef, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import { getChartPreviewHref } from "@/lib/music/chart-preview";
import Modal from "@/components/shared/Modal";
import ChartPreview from "@/components/music/ChartPreview";
import { difficultyStyles } from "@/components/music/difficulty-styles";
import {
  type MusicViewModel,
} from "@/lib/music/data";
import {
  getCardTypeIconUrl,
  getBandSmallIconUrl,
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getCharacterFaceIconUrl,
  type CardType,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  songId: number;
  initialSong: MusicViewModel | null;
}

interface DetailData {
  song: MusicViewModel | null;
}

export default function MusicDetail({ locale, initialSong }: Props) {
  const [data] = useState<DetailData>({ song: initialSong });
  const loading = false;
  const error = false;
  const [, setReloadKey] = useState(0);
  const [activeTabId, setActiveTabId] = useState<"jacket" | "info">("jacket");
  const [jacketModalOpen, setJacketModalOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "success" | "error">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success">("idle");

  const song = data.song;

  const copyJacketLink = async () => {
    if (!song) return;
    setCopyState("copying");
    try {
      const response = await fetch(song.jacketUrl);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setCopyState("success");
      } else {
        await navigator.clipboard.writeText(song.jacketUrl);
        setCopyState("success");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(song.jacketUrl);
        setCopyState("success");
      } catch {
        setCopyState("error");
      }
    }
    setTimeout(() => setCopyState("idle"), 1800);
  };

  const downloadJacket = async () => {
    if (!song) return;
    setDownloadState("downloading");
    await saveRemoteFile(song.jacketUrl, `${song.jacketAssetName}.webp`);
    setDownloadState("success");
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  if (loading) {
    return <div className="mn-paper h-72 animate-pulse" aria-label={t(locale, "music.loading")} />;
  }

  if (error || !song) {
    return (
      <div className="mn-paper p-8 text-center sm:p-12" role={error ? "alert" : undefined}>
        <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
          {t(locale, error ? "music.loadErrorTitle" : "music.detailNotFound")}
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
          {t(locale, error ? "music.loadErrorDescription" : "music.detailNotFoundDescription")}
        </p>
        {error && (
          <button type="button" onClick={() => setReloadKey((value) => value + 1)} className="mn-focus mn-stamp-press mt-6 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "cards.retry")}
          </button>
        )}
      </div>
    );
  }

  const attributeName = t(locale, `cards.attributes.${song.musicType}`);

  const previewActions = (
    <>
      <button
        type="button"
        onClick={downloadJacket}
        disabled={downloadState === "downloading"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {downloadState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {downloadState === "downloading" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {downloadState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <button
        type="button"
        onClick={copyJacketLink}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {copyState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {copyState === "copying" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {copyState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {copyState === "error" && <svg className="h-4 w-4 text-[var(--mn-rose)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </button>
    </>
  );

  return (
    <div className="space-y-8 w-full">
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(20rem,1fr)_1.5fr] lg:items-start">
        {/* Left Column: Fixed / Sticky Asset Pane */}
        <aside className="lg:sticky lg:top-24 w-full flex flex-col pt-8">
          <div
            className="relative aspect-square w-full rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] p-5 shadow-[var(--mn-shadow-stamp-lg)]"
          >
            {/* Spine Crease */}

            {/* Bookmarks on Top Edge */}
            <div className="absolute bottom-full left-4 right-4 flex gap-1 pb-[1px] z-10">
              <button
                type="button"
                onClick={() => setActiveTabId("jacket")}
                className={`px-4 pt-1.5 pb-3 text-[10px] font-semibold tracking-wider uppercase border border-b-0 border-[var(--mn-border)] rounded-t-xl transition-all origin-bottom -mb-[6px] rotate-[-1deg] ${
                  activeTabId === "jacket"
                    ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-md z-20 -translate-y-[2px]"
                    : "bg-[var(--mn-surface)] text-[var(--mn-text)] hover:bg-[var(--mn-accent-soft)] hover:-translate-y-[1px]"
                }`}
              >
                {t(locale, "music.assets.jacket")}
              </button>
              <button
                type="button"
                onClick={() => setActiveTabId("info")}
                className={`px-4 pt-1.5 pb-3 text-[10px] font-semibold tracking-wider uppercase border border-b-0 border-[var(--mn-border)] rounded-t-xl transition-all origin-bottom -mb-[6px] rotate-[1.5deg] ${
                  activeTabId === "info"
                    ? "bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-md z-20 -translate-y-[2px]"
                    : "bg-[var(--mn-surface)] text-[var(--mn-text)] hover:bg-[var(--mn-accent-soft)] hover:-translate-y-[1px]"
                }`}
              >
                {t(locale, "music.songInfoTitle")}
              </button>
            </div>

            {/* Content Area */}
            <div className="relative h-full w-full flex flex-col">
              {activeTabId === "jacket" ? (
                <div className="h-full w-full">
                  <button
                    type="button"
                    onClick={() => setJacketModalOpen(true)}
                    className="group relative block w-full h-full overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] shadow-inner transition hover:scale-[1.01]"
                    aria-label={t(locale, "music.assets.previewFull")}
                  >
                    <img
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-102"
                      src={song.jacketUrl}
                      alt={song.title}
                    />
                    <div className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10 flex items-center justify-center">
                      <svg className="h-8 w-8 text-white opacity-0 transition group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m4-3H6" /></svg>
                    </div>
                  </button>
                </div>
              ) : (
                <div className="h-full w-full flex flex-col justify-between">
                  <div className="flex-1 overflow-y-auto space-y-4 pr-1">
                    <div className="rounded-2xl border border-solid border-[var(--mn-border)] bg-[var(--mn-surface)] p-4 space-y-3 shadow-inner">
                      <h4 className="font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--mn-text)] border-b border-[var(--mn-border)]/60 pb-1.5">Song Notebook</h4>
                      <div className="space-y-2 text-[11px] font-bold text-[var(--mn-text-muted)]">
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Band</span>
                          <span className="text-[var(--mn-text)]">{song.bandName}</span>
                        </div>
                        <div className="flex justify-between border-b border(--mn-border)/20 pb-1">
                          <span>Attribute</span>
                          <span className="text-[var(--mn-text)]">{attributeName}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Composer</span>
                          <span className="text-[var(--mn-text)]">{song.composer}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Lyricist</span>
                          <span className="text-[var(--mn-text)]">{song.lyricist}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Release</span>
                          <span className="text-[var(--mn-text)]">{formatDate(song.startAt, locale)}</span>
                        </div>
                        <div className="flex justify-between border-b border-[var(--mn-border)]/20 pb-1">
                          <span>Song ID</span>
                          <span className="text-[var(--mn-text)]">#{song.id}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Jacket Asset</span>
                          <span className="text-[var(--mn-text)]">{song.jacketAssetName}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 w-full">
            <SongAudioPanel locale={locale} song={song} />
          </div>
        </aside>

        {/* Right Column: Details & Difficulties */}
        <section className="flex-1 min-w-0 space-y-6">
          {/* Main Info */}
          <div className="mn-paper overflow-hidden">
            {/* Header Banner */}
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent p-6 sm:p-8">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <img
                      className="h-6 w-auto object-contain block dark:hidden"
                      src={getBandLogoUrl(song.bandId, locale)}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <img
                      className="h-6 w-auto object-contain hidden dark:block"
                      src={getBandLogoWhiteUrl(song.bandId, locale)}
                      alt=""
                      aria-hidden="true"
                      onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                    />
                    <span className="font-[var(--mn-font-note)] text-sm text-[var(--mn-accent-deep)]">{song.bandName}</span>
                  </div>
                  <h2 className="mt-1 font-[var(--mn-font-display)] text-3xl leading-tight text-[var(--mn-text)] sm:text-4xl">{song.title}</h2>
                </div>
                <img className="h-8 w-8 shrink-0" src={getCardTypeIconUrl(song.musicType as CardType)} alt="" aria-hidden="true" />
              </div>
            </div>

            {/* Details Table */}
            <div className="p-6 sm:p-8 bg-[var(--mn-paper)]">
              <div className="divide-y divide-dashed divide-[var(--mn-border)]/60">
                <DetailRow label={t(locale, "music.composer")} value={song.composer} />
                <DetailRow label={t(locale, "music.lyricist")} value={song.lyricist} />
                <DetailRow label={t(locale, "music.arranger")} value={song.arranger} />
                <DetailRow label={t(locale, "cards.detailBand")} value={
                  <span className="inline-flex items-center gap-1.5">
                    <img className="h-5 w-auto object-contain" src={getBandSmallIconUrl(song.bandId)} alt="" aria-hidden="true" />
                    {song.bandName}
                  </span>
                } />
                {song.vocalists.length > 0 && (
                  <DetailRow label={t(locale, "music.vocals")} value={
                    <div className="flex flex-wrap gap-1.5 justify-end">
                      {song.vocalists.map((voc) => (
                        <a
                          key={voc.id}
                          href={localizePath(`/characters/${voc.id}`, locale)}
                          className="mn-focus mn-stamp-press inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] hover:bg-[var(--mn-accent)] hover:text-white transition-all text-xs font-bold text-[var(--mn-text)] shadow-sm"
                        >
                          <img className="h-4.5 w-4.5 rounded-full object-cover bg-white" src={getCharacterFaceIconUrl(voc.id)} alt="" />
                          <span>{voc.name}</span>
                        </a>
                      ))}
                    </div>
                  } />
                )}
                <DetailRow label={t(locale, "music.releaseDate")} value={formatDate(song.startAt, locale)} />
                <DetailRow label={t(locale, "music.songId")} value={`#${song.id}`} />
                <DetailRow label={t(locale, "music.jacketAsset")} value={song.jacketAssetName} />
              </div>
            </div>
          </div>

          {/* Difficulties Card */}
          <div className="mn-paper overflow-hidden">
            <div className="border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
              <h3 className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
                {t(locale, "music.difficultiesTitle")}
              </h3>
            </div>
            <div className="p-6 sm:p-8 grid grid-cols-2 lg:grid-cols-4 gap-4">
              {song.difficulties.map((diff) => {
                const config = difficultyStyles[diff.difficulty];

                return (
                  <div key={diff.difficulty} className={`p-3 border rounded-2xl flex flex-col items-center justify-between text-center gap-2 ${config.cardBg}`}>
                    <div className="flex items-center gap-1">
                      <span className={`h-2 w-2 rounded-full shrink-0 ${config.dot}`} />
                      <span className={`font-black text-xs uppercase tracking-wider ${config.labelColor}`}>{config.shortLabel}</span>
                    </div>
                    <div className="font-mono text-2xl font-black text-[var(--mn-accent-deep)] leading-none my-0.5">
                      {diff.displayLevel}
                    </div>
                    <div className="text-[10px] font-semibold text-[var(--mn-text-muted)] leading-none">
                      {t(locale, "music.notesCount", { count: diff.notesCount })}
                    </div>
                    <a
                      href={getChartPreviewHref(locale, { musicId: song.id, difficulty: diff.difficulty })}
                      aria-label={t(locale, "music.chartPreviewLabel", { difficulty: t(locale, `music.difficultyLevels.${diff.difficulty}`) })}
                      className="mn-focus mn-stamp-press mt-1 inline-flex items-center gap-1 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-2.5 py-1 text-[10px] font-bold text-[var(--mn-text)] transition hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]"
                    >
                      <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l10.5-6.5z" /></svg>
                      {t(locale, "music.chartPreview")}
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Back Action */}
          <div className="flex justify-start">
            <a href={localizePath(getRoutePathById("music"), locale)} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
              {t(locale, "music.backToList")}
            </a>
          </div>
        </section>
      </div>

      {song.difficulties.length > 0 && <ChartPreview locale={locale} song={song} />}

      {/* Jacket Zoom Modal */}
      <Modal
        isOpen={jacketModalOpen}
        onClose={() => setJacketModalOpen(false)}
        title={song.title}
        closeLabel={t(locale, "actions.close")}
        size="md"
        headerActions={previewActions}
      >
        <div className="w-full overflow-hidden rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-surface)]">
          <img
            className="mx-auto max-h-[65vh] w-full object-contain"
            src={song.jacketUrl}
            alt={song.title}
          />
        </div>
      </Modal>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3.5 text-sm">
      <span className="font-semibold text-[var(--mn-text-muted)]">{label}</span>
      <span className="font-semibold text-[var(--mn-text)] text-right">{value}</span>
    </div>
  );
}

function formatDate(value: string, locale: AppLocale): string {
  const normalized = value.replaceAll("/", "-").replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale, { year: "numeric", month: "long", day: "numeric" }).format(date);
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

function SongAudioPanel({ locale, song }: { locale: AppLocale; song: MusicViewModel }) {
  const tracks = [
    song.audioUrl && { kind: "full" as const, url: song.audioUrl },
    song.previewAudioUrl && { kind: "preview" as const, url: song.previewAudioUrl },
  ].filter((track): track is { kind: "full" | "preview"; url: string } => Boolean(track));
  const [active, setActive] = useState(0);
  const [downloading, setDownloading] = useState<string | null>(null);

  if (tracks.length === 0) {
    return (
      <div className="mn-paper p-4 text-sm">
        <p className="font-bold text-[var(--mn-text)]">{t(locale, "music.audio.unavailableTitle")}</p>
        <p className="mt-1.5 text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, "music.audio.unavailableDescription")}</p>
      </div>
    );
  }

  const track = tracks[Math.min(active, tracks.length - 1)]!;
  const download = async (item: (typeof tracks)[number]) => {
    setDownloading(item.kind);
    const suffix = item.kind === "preview" ? "_short" : "";
    // Release audio is published as AAC in M4A.
    await saveRemoteFile(item.url, `${safeFilename(song.title)}${suffix}.m4a`);
    setDownloading(null);
  };

  return (
    <div className="space-y-3">
      {tracks.length > 1 && (
        <div className="mn-segmented flex w-fit gap-1 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-surface-strong)] p-1" role="group" aria-label={t(locale, "music.audio.title")}>
          {tracks.map((item, index) => (
            <button
              key={item.kind}
              type="button"
              onClick={() => setActive(index)}
              aria-pressed={index === active}
              className={`mn-focus rounded-full px-3 py-1 text-xs font-bold transition ${index === active ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"}`}
            >
              {t(locale, `music.audio.${item.kind}`)}
            </button>
          ))}
        </div>
      )}
      <AudioPlayer locale={locale} src={track.url} title={song.title} label={t(locale, `music.audio.${track.kind}`)} />
      <div className="flex flex-wrap gap-2">
        {tracks.map((item) => (
          <button
            key={item.kind}
            type="button"
            onClick={() => download(item)}
            disabled={downloading !== null}
            className="mn-focus mn-stamp-press inline-flex items-center gap-2 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] disabled:opacity-60"
          >
            {downloading === item.kind
              ? <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden="true"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>
              : <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 4v11" /><path d="m7 10 5 5 5-5" /><path d="M5 20h14" /></svg>}
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
    <div className="mn-paper overflow-hidden border border-[var(--mn-border)] bg-[var(--mn-paper)] p-4 shadow-[var(--mn-shadow-stamp)] flex flex-col gap-3">
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
          <span className="text-[10px] font-black uppercase tracking-wider text-[var(--mn-accent-deep)] block opacity-75">
            {label}
          </span>
          <span className="text-xs font-bold text-[var(--mn-text)] truncate block mt-0.5" title={title}>
            {title}
          </span>
        </div>

        <button
          type="button"
          onClick={togglePlay}
          className="mn-focus mn-stamp-press flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent)] text-[var(--mn-bg)] shadow-sm hover:scale-105 transition-all"
          aria-label={t(locale, isPlaying ? "music.audio.pause" : "music.audio.play")}
        >
          {isPlaying ? (
            <svg className="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          ) : (
            <svg className="h-5 w-5 fill-current ml-0.5" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] text-[var(--mn-text-muted)] shrink-0 w-8">
          {formatTime(currentTime)}
        </span>
        <input
          type="range"
          aria-label={t(locale, "music.audio.seek")}
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeek}
          className="flex-1 h-1.5 rounded-lg appearance-none cursor-pointer bg-[var(--mn-cream-deep)] accent-[var(--mn-accent)] focus:outline-none"
          style={{
            background: `linear-gradient(to right, var(--mn-accent) 0%, var(--mn-accent) ${
              duration ? (currentTime / duration) * 100 : 0
            }%, var(--mn-cream-deep) ${
              duration ? (currentTime / duration) * 100 : 0
            }%, var(--mn-cream-deep) 100%)`,
          }}
        />
        <span className="font-mono text-[10px] text-[var(--mn-text-muted)] shrink-0 w-8 text-right">
          {formatTime(duration)}
        </span>
      </div>
    </div>
  );
}

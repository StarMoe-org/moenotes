"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { moveReleaseUrls } from "@/lib/assets/release";
import { replaceUrl } from "@/lib/browser/history";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_CHIP_CLASSES, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { getChartManifestUrl, getChartPreviewHref, parseChartPreviewSearch } from "@/lib/music/chart-preview";
import { getRoutePathById } from "@/lib/route/registry";
import { entityServer, type ServerFaceted } from "@/lib/servers/facets";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import ChartStage, { StageSignature } from "@/components/tools/ChartStage";
import ChartQuickSettings from "@/components/tools/ChartQuickSettings";
import type { ChartPlayer } from "ournotes-player";
import { useSongTitle } from "@/lib/music/title-preference";
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  /** Every server's songs; a song the primary server lacks shows its own server's files. */
  songs: ServerFaceted<MusicViewModel>[];
}

export default function ChartPreview3D({ locale, songs: allSongs }: Props) {
  const songs = useMemo(() => allSongs.map((song) => moveReleaseUrls(song, entityServer(song, PRIMARY_SERVER))), [allSongs]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preferred, setPreferred] = useState<MusicDifficulty>("expert");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [player, setPlayer] = useState<ChartPlayer | null>(null);
  const { showSpoiler, now } = useSpoilerSetting();

  const song = useMemo(() => songs.find((entry) => entry.id === selectedId) ?? null, [songs, selectedId]);
  const difficulty = song ? resolveDifficulty(song, preferred) : null;
  const isUnreleased = Boolean(song?.startAt && isSpoiler(song.startAt, now));

  useEffect(() => {
    const { musicId, difficulty: requested } = parseChartPreviewSearch(window.location.search);
    if (musicId !== null && songs.some((entry) => entry.id === musicId)) {
      setSelectedId(musicId);
      if (requested) setPreferred(requested);
    }
    setRestored(true);
  }, [songs]);

  // Shareable address of the current chart; the dialog's own history entry is left alone.
  useEffect(() => {
    if (!restored || dialogOpen) return;
    replaceUrl(song && difficulty ? getChartPreviewHref(locale, { musicId: song.id, difficulty }) : getChartPreviewHref(locale));
  }, [restored, dialogOpen, song, difficulty, locale]);

  const openDialog = () => setDialogOpen(true);

  if (!showSpoiler && isUnreleased) {
    return (
      <div className="space-y-4">
        <SpoilerNotice locale={locale} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {song && difficulty ? (
        <>
          <ChartHeader locale={locale} song={song} difficulty={difficulty} onDifficulty={setPreferred} onChangeSong={openDialog} />
          <ChartStage locale={locale} manifestUrl={getChartManifestUrl({ musicId: song.id, difficulty })} onPlayer={setPlayer} />
          {player && <ChartQuickSettings locale={locale} player={player} />}
        </>
      ) : (
        <StageEmpty locale={locale} onChooseSong={openDialog} />
      )}
      <p className="-mt-2 px-1 text-right text-label-small text-on-surface-variant">{t(locale, "chartPreview3d.credit")}</p>

      <MusicSelectDialog
        locale={locale}
        songs={songs}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        current={song && difficulty ? { musicId: song.id, difficulty } : null}
        onSelect={(selection) => {
          setSelectedId(selection.song.id);
          setPreferred(selection.difficulty);
        }}
      />
    </div>
  );
}

function ChartHeader({ locale, song, difficulty, onDifficulty, onChangeSong }: {
  locale: AppLocale;
  song: MusicViewModel;
  difficulty: MusicDifficulty;
  onDifficulty: (difficulty: MusicDifficulty) => void;
  onChangeSong: () => void;
}) {
  const current = song.difficulties.find((entry) => entry.difficulty === difficulty);
  const title = useSongTitle()(song);
  return (
    <div className="md3-surface flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:p-5">
      <a
        href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
        className="group flex min-w-0 flex-1 items-center gap-3"
        title={t(locale, "music.openDetail", { title })}
      >
        <img
          className="h-16 w-16 shrink-0 rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover"
          src={song.jacketUrl}
          alt=""
        />
        <span className="min-w-0">
          <span className="block truncate font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface transition-colors group-hover:text-primary sm:text-headline-small">
            {title}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-label-medium text-on-surface-variant">
            <img className="h-4 w-auto shrink-0 object-contain" src={getBandSmallIconUrl(song.bandId)} alt="" aria-hidden="true" />
            <span className="truncate">{song.bandName}</span>
            {current && <span className="shrink-0">· {t(locale, "music.notesCount", { count: current.notesCount })}</span>}
          </span>
        </span>
      </a>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div role="radiogroup" aria-label={t(locale, "chartPreview3d.difficulty")} className="grid grid-cols-4 gap-1.5">
          {MUSIC_DIFFICULTIES.map((key) => {
            const entry = song.difficulties.find((item) => item.difficulty === key);
            const checked = key === difficulty;
            return (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={checked}
                disabled={!entry}
                onClick={() => onDifficulty(key)}
                className={`min-w-14 rounded-shape-md border px-2 py-1.5 text-center transition disabled:cursor-not-allowed disabled:opacity-35 ${DIFFICULTY_CHIP_CLASSES[key]} ${ checked ? "ring-2 ring-primary ring-offset-1 ring-offset-surface-container-low" : "opacity-70 hover:opacity-100" }`}
              >
                <span className="block text-label-medium">{t(locale, `music.difficultyLevels.${key}`)}</span>
                <span className="mt-1 block font-mono text-title-medium">{entry ? entry.displayLevel : "-"}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onChangeSong}
          className="md3-button md3-button--tonal"
        >
          <MusicGlyph />
          {t(locale, "chartPreview3d.changeSong")}
        </button>
      </div>
    </div>
  );
}

function StageEmpty({ locale, onChooseSong }: { locale: AppLocale; onChooseSong: () => void }) {
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-shape-lg border border-outline-variant bg-black px-6 text-center shadow-elevation-1">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--md-sys-color-primary)_35%,transparent),transparent_65%)]" aria-hidden="true" />
      <StageSignature />
      <div className="relative">
        <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-white sm:text-headline-small">{t(locale, "chartPreview3d.emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-body-small leading-6 text-white/70 sm:text-body-medium">{t(locale, "chartPreview3d.emptyDescription")}</p>
        <button
          type="button"
          onClick={onChooseSong}
          className="md3-button md3-button--filled mt-5"
        >
          <MusicGlyph />
          {t(locale, "chartPreview3d.chooseSong")}
        </button>
      </div>
    </div>
  );
}

function MusicGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" />
    </svg>
  );
}

/** The wanted difficulty when the song has it, else its hardest chart. */
function resolveDifficulty(song: MusicViewModel, preferred: MusicDifficulty): MusicDifficulty | null {
  if (song.difficulties.some((entry) => entry.difficulty === preferred)) return preferred;
  return song.difficulties.at(-1)?.difficulty ?? null;
}

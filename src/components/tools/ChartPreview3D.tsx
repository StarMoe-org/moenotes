import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import { DIFFICULTY_CHIP_CLASSES, MUSIC_DIFFICULTIES, type MusicDifficulty } from "@/lib/music/difficulty";
import { getChartManifestUrl, getChartPreviewHref, parseChartPreviewSearch } from "@/lib/music/chart-preview";
import { getRoutePathById } from "@/lib/route/registry";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import ChartStage, { StageSignature } from "@/components/tools/ChartStage";

interface Props {
  locale: AppLocale;
  songs: MusicViewModel[];
}

export default function ChartPreview3D({ locale, songs }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [preferred, setPreferred] = useState<MusicDifficulty>("expert");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restored, setRestored] = useState(false);

  const song = useMemo(() => songs.find((entry) => entry.id === selectedId) ?? null, [songs, selectedId]);
  const difficulty = song ? resolveDifficulty(song, preferred) : null;

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

  return (
    <div className="space-y-4">
      {song && difficulty ? (
        <>
          <ChartHeader locale={locale} song={song} difficulty={difficulty} onDifficulty={setPreferred} onChangeSong={openDialog} />
          <ChartStage locale={locale} manifestUrl={getChartManifestUrl({ musicId: song.id, difficulty })} />
        </>
      ) : (
        <StageEmpty locale={locale} onChooseSong={openDialog} />
      )}
      <p className="-mt-2 px-1 text-right text-[11px] font-semibold tracking-wide text-[var(--mn-text-muted)]">{t(locale, "chartPreview3d.credit")}</p>

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
  return (
    <div className="mn-paper flex flex-col gap-4 p-4 lg:flex-row lg:items-center lg:p-5">
      <a
        href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
        className="mn-focus group flex min-w-0 flex-1 items-center gap-3"
        title={t(locale, "music.openDetail", { title: song.title })}
      >
        <img
          className="h-16 w-16 shrink-0 rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover"
          src={song.jacketUrl}
          alt=""
        />
        <span className="min-w-0">
          <span className="block truncate font-[var(--mn-font-display)] text-lg font-bold text-[var(--mn-text)] transition-colors group-hover:text-[var(--mn-accent-deep)] sm:text-xl">
            {song.title}
          </span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--mn-text-muted)]">
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
                className={`mn-focus min-w-14 rounded-xl border px-2 py-1.5 text-center transition disabled:cursor-not-allowed disabled:opacity-35 ${DIFFICULTY_CHIP_CLASSES[key]} ${
                  checked ? "ring-2 ring-[var(--mn-accent)] ring-offset-1 ring-offset-[var(--mn-paper)]" : "opacity-70 hover:opacity-100"
                }`}
              >
                <span className="block text-[9px] font-black uppercase leading-none tracking-wider">{t(locale, `music.difficultyLevels.${key}`)}</span>
                <span className="mt-1 block font-mono text-base font-black leading-none">{entry ? entry.displayLevel : "-"}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          onClick={onChangeSong}
          className="mn-focus mn-stamp-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2.5 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] transition hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]"
        >
          <MusicGlyph className="h-4 w-4" />
          {t(locale, "chartPreview3d.changeSong")}
        </button>
      </div>
    </div>
  );
}

function StageEmpty({ locale, onChooseSong }: { locale: AppLocale; onChooseSong: () => void }) {
  return (
    <div className="relative grid aspect-video place-items-center overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-black px-6 text-center shadow-[var(--mn-shadow-stamp)]">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--mn-accent)_35%,transparent),transparent_65%)]" aria-hidden="true" />
      <StageSignature />
      <div className="relative">
        <h2 className="font-[var(--mn-font-display)] text-xl text-white sm:text-2xl">{t(locale, "chartPreview3d.emptyTitle")}</h2>
        <p className="mx-auto mt-2 max-w-md text-xs font-medium leading-6 text-white/70 sm:text-sm">{t(locale, "chartPreview3d.emptyDescription")}</p>
        <button
          type="button"
          onClick={onChooseSong}
          className="mn-focus mn-stamp-press mt-5 inline-flex items-center gap-2 rounded-full bg-[var(--mn-accent)] px-6 py-3 text-sm font-bold text-white shadow-[var(--mn-shadow-stamp)] hover:bg-[var(--mn-accent-deep)]"
        >
          <MusicGlyph className="h-4 w-4" />
          {t(locale, "chartPreview3d.chooseSong")}
        </button>
      </div>
    </div>
  );
}

function MusicGlyph({ className }: { className: string }) {
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

/**
 * Replaces the address of the current history entry. A closing modal leaves its own entry with `history.back()`,
 * which lands after this runs; the address is then written once that navigation is done.
 */
function replaceUrl(href: string) {
  const apply = () => {
    if (`${window.location.pathname}${window.location.search}` !== href) window.history.replaceState(window.history.state, "", href);
  };
  if (window.history.state?.modal) window.addEventListener("popstate", apply, { once: true });
  else apply();
}

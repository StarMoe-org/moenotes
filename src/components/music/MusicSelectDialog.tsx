import { useEffect, useRef } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import MusicFilters, { useMusicFilters } from "@/components/music/MusicFilters";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import type { MusicViewModel } from "@/lib/music/data";
import {
  DIFFICULTY_CHIP_CLASSES,
  DIFFICULTY_SHORT_LABELS,
  MUSIC_DIFFICULTIES,
  type MusicDifficulty,
} from "@/lib/music/difficulty";

export interface MusicSelection {
  song: MusicViewModel;
  difficulty: MusicDifficulty;
}

interface MusicSelectDialogProps {
  locale: AppLocale;
  songs: readonly MusicViewModel[];
  open: boolean;
  onClose: () => void;
  onSelect: (selection: MusicSelection) => void;
  /** Highlighted in the list; its difficulty is kept when another song is picked by its cover. */
  current?: { musicId: number; difficulty: MusicDifficulty } | null;
  title?: string;
  /** Session key of the remembered sort order. */
  sortPage?: string;
}

/** Song picker dialog: the music list's full filters and every song, picked together with a difficulty. */
export default function MusicSelectDialog({
  locale,
  songs,
  open,
  onClose,
  onSelect,
  current = null,
  title,
  sortPage = "music-select",
}: MusicSelectDialogProps) {
  // Lives outside the modal body, so the filters survive closing and reopening.
  const music = useMusicFilters(songs, locale, sortPage);
  const gridRef = useRef<HTMLUListElement>(null);
  const currentId = current?.musicId ?? null;

  useEffect(() => {
    if (!open || currentId === null) return;
    // After the panel has mounted: bring the current song into view.
    const frame = requestAnimationFrame(() => {
      gridRef.current?.querySelector(`[data-song-id="${currentId}"]`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, currentId]);

  const pick = (song: MusicViewModel, difficulty: MusicDifficulty) => {
    onSelect({ song, difficulty });
    onClose();
  };

  return (
    <Modal isOpen={open} onClose={onClose} title={title ?? t(locale, "music.picker.title")} closeLabel={t(locale, "actions.close")} size="xl">
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-0">
          <MusicFilters locale={locale} controller={music} variant="card" />
        </div>

        <div className="min-w-0 space-y-3">
          <p className="px-1 text-xs font-medium text-[var(--mn-text-muted)]">{t(locale, "music.picker.hint")}</p>
          {music.sorted.length === 0 ? (
            <div className="mn-paper p-8 text-center">
              <p className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{t(locale, "music.emptyTitle")}</p>
              <button
                type="button"
                onClick={music.reset}
                className="mn-focus mn-stamp-press mt-4 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
              >
                {t(locale, "music.reset")}
              </button>
            </div>
          ) : (
            <ul ref={gridRef} aria-label={t(locale, "music.picker.listLabel")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {music.sorted.map((song) => (
                <SongOption
                  key={song.id}
                  locale={locale}
                  song={song}
                  current={song.id === currentId ? current?.difficulty ?? null : null}
                  preferred={current?.difficulty ?? "expert"}
                  onPick={(difficulty) => pick(song, difficulty)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}

function SongOption({ locale, song, current, preferred, onPick }: {
  locale: AppLocale;
  song: MusicViewModel;
  /** The chosen difficulty when this is the chosen song. */
  current: MusicDifficulty | null;
  preferred: MusicDifficulty;
  onPick: (difficulty: MusicDifficulty) => void;
}) {
  const coverDifficulty = song.difficulties.some((entry) => entry.difficulty === preferred)
    ? preferred
    : song.difficulties.at(-1)?.difficulty;
  const selected = current !== null;

  return (
    <li
      data-song-id={song.id}
      className={`group min-w-0 overflow-hidden rounded-2xl border-[1.5px] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition ${
        selected ? "border-[var(--mn-accent)] ring-2 ring-[var(--mn-accent)]" : "border-[var(--mn-border)] hover:-translate-y-0.5 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      }`}
    >
      <button
        type="button"
        disabled={!coverDifficulty}
        onClick={() => coverDifficulty && onPick(coverDifficulty)}
        aria-label={t(locale, "music.picker.pickSong", { title: song.title })}
        className="mn-focus block w-full text-left"
      >
        <span className="relative block aspect-square w-full overflow-hidden border-b-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)]">
          <img className="h-full w-full object-cover transition duration-300 group-hover:scale-105" src={song.jacketUrl} alt="" loading="lazy" />
          <img
            className="absolute left-2 top-2 h-5 w-auto object-contain drop-shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
            src={getBandSmallIconUrl(song.bandId)}
            alt=""
            aria-hidden="true"
            onError={(event) => { (event.target as HTMLElement).style.display = "none"; }}
          />
        </span>
        <span className="block px-2.5 pb-1.5 pt-2">
          <span className={`block truncate font-[var(--mn-font-display)] text-sm font-bold ${selected ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)]"}`}>
            {song.title}
          </span>
          <span className="block truncate text-[10px] font-medium text-[var(--mn-text-muted)]">{song.bandName}</span>
        </span>
      </button>

      <div className="grid grid-cols-4 gap-1 px-2.5 pb-2.5">
        {MUSIC_DIFFICULTIES.map((key) => {
          const entry = song.difficulties.find((item) => item.difficulty === key);
          if (!entry) return <span key={key} aria-hidden="true" />;
          const label = t(locale, `music.difficultyLevels.${key}`);
          return (
            <button
              key={key}
              type="button"
              onClick={() => onPick(key)}
              aria-label={t(locale, "music.picker.pickDifficulty", { title: song.title, difficulty: label })}
              aria-pressed={current === key}
              title={label}
              className={`mn-focus rounded border py-0.5 text-center font-black transition hover:brightness-95 ${DIFFICULTY_CHIP_CLASSES[key]} ${
                current === key ? "ring-2 ring-[var(--mn-accent)] ring-offset-1 ring-offset-[var(--mn-paper)]" : ""
              }`}
            >
              <span className="block text-[7px] leading-none opacity-60">{DIFFICULTY_SHORT_LABELS[key]}</span>
              <span className="font-mono text-[11px] leading-tight">{entry.displayLevel}</span>
            </button>
          );
        })}
      </div>
    </li>
  );
}

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import MusicRanking from "@/components/music/MusicRanking";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import { replaceUrl } from "@/lib/browser/history";
import { getBandSmallIconUrl } from "@/lib/cards/assets";
import { getMusicRankingHref, parseMusicRankingSearch } from "@/lib/game-api/links";
import type { DeckCardLookup } from "@/lib/game-api/music-ranking";
import type { MusicViewModel } from "@/lib/music/data";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  locale: AppLocale;
  songs: MusicViewModel[];
  deckCards: DeckCardLookup;
}

/** A song's high-score ranking on each game server; `?music=` picks the song so the view can be shared. */
export default function MusicRankingTool({ locale, songs, deckCards }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const song = useMemo(() => songs.find((entry) => entry.id === selectedId) ?? null, [songs, selectedId]);

  useEffect(() => {
    const musicId = parseMusicRankingSearch(window.location.search);
    if (musicId !== null && songs.some((entry) => entry.id === musicId)) setSelectedId(musicId);
    setRestored(true);
  }, [songs]);

  useEffect(() => {
    if (!restored || dialogOpen) return;
    replaceUrl(getMusicRankingHref(locale, song?.id));
  }, [restored, dialogOpen, song, locale]);

  const openDialog = () => setDialogOpen(true);

  return (
    <div className="space-y-5">
      {song ? (
        <>
          <div className="mn-paper flex flex-col gap-4 p-4 sm:flex-row sm:items-center lg:p-5">
            <a
              href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
              className="mn-focus group flex min-w-0 flex-1 items-center gap-3"
              title={t(locale, "music.openDetail", { title: song.title })}
            >
              <img className="h-16 w-16 shrink-0 rounded-xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-cover" src={song.jacketUrl} alt="" />
              <span className="min-w-0">
                <span className="block truncate font-[var(--mn-font-display)] text-lg font-bold text-[var(--mn-text)] transition-colors group-hover:text-[var(--mn-accent-deep)] sm:text-xl">
                  {song.title}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-xs font-semibold text-[var(--mn-text-muted)]">
                  <img className="h-4 w-auto shrink-0 object-contain" src={getBandSmallIconUrl(song.bandId)} alt="" aria-hidden="true" />
                  <span className="truncate">{song.bandName}</span>
                </span>
              </span>
            </a>
            <ChangeSongButton onClick={openDialog} label={t(locale, "musicRanking.changeSong")} />
          </div>
          <MusicRanking key={song.id} locale={locale} musicId={song.id} cards={deckCards} />
        </>
      ) : (
        <div className="mn-paper p-8 text-center sm:p-12">
          <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "musicRanking.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "musicRanking.emptyDescription")}</p>
          <div className="mt-6 flex justify-center">
            <ChangeSongButton onClick={openDialog} label={t(locale, "musicRanking.chooseSong")} />
          </div>
        </div>
      )}

      <MusicSelectDialog
        locale={locale}
        songs={songs}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        current={song ? { musicId: song.id, difficulty: song.difficulties.at(-1)?.difficulty ?? "expert" } : null}
        onSelect={(selection) => setSelectedId(selection.song.id)}
        sortPage="music-ranking"
        songOnly
      />
    </div>
  );
}

function ChangeSongButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mn-focus mn-stamp-press inline-flex shrink-0 items-center justify-center gap-1.5 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-4 py-2.5 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] transition hover:border-[var(--mn-accent)] hover:text-[var(--mn-accent-deep)]"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" />
      </svg>
      {label}
    </button>
  );
}

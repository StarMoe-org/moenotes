"use client";

import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { moveReleaseUrls } from "@/lib/assets/release";
import { entityServer, type ServerFaceted } from "@/lib/servers/facets";
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
import SpoilerNotice from "@/components/shared/SpoilerNotice";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  /** Every server's songs; a song the primary server lacks shows its own server's files. */
  songs: ServerFaceted<MusicViewModel>[];
  deckCards: DeckCardLookup;
}

/** A song's high-score ranking on each game server; `?music=` picks the song so the view can be shared. */
export default function MusicRankingTool({ locale, songs: allSongs, deckCards }: Props) {
  const songs = useMemo(() => allSongs.map((song) => moveReleaseUrls(song, entityServer(song, PRIMARY_SERVER))), [allSongs]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const { showSpoiler, now } = useSpoilerSetting();
  const song = useMemo(() => songs.find((entry) => entry.id === selectedId) ?? null, [songs, selectedId]);
  const isUnreleased = Boolean(now !== null && song?.startAt && isSpoiler(song.startAt, now));

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

  if (!showSpoiler && isUnreleased) {
    return (
      <div className="space-y-5">
        <SpoilerNotice locale={locale} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {song ? (
        <>
          <div className="md3-surface flex flex-col gap-4 p-4 sm:flex-row sm:items-center lg:p-5">
            <a
              href={localizePath(`${getRoutePathById("music")}/${song.id}`, locale)}
              className="group flex min-w-0 flex-1 items-center gap-3"
              title={t(locale, "music.openDetail", { title: song.title })}
            >
              <img className="h-16 w-16 shrink-0 rounded-shape-md border border-outline-variant bg-surface-container-highest object-cover" src={song.jacketUrl} alt="" />
              <span className="min-w-0">
                <span className="block truncate font-[var(--md-ref-typeface-brand)] text-title-large text-on-surface transition-colors group-hover:text-primary sm:text-headline-small">
                  {song.title}
                </span>
                <span className="mt-1 flex min-w-0 items-center gap-1.5 text-label-medium text-on-surface-variant">
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
        <div className="md3-surface p-8 text-center sm:p-12">
          <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "musicRanking.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "musicRanking.emptyDescription")}</p>
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
      className="md3-button md3-button--tonal"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 18V6l10-2v12" /><circle cx="6" cy="18" r="3" /><circle cx="16" cy="16" r="3" />
      </svg>
      {label}
    </button>
  );
}

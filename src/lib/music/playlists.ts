import type { MusicViewModel } from "./data";
import { MUSIC_OTHER_BAND } from "./filter";

/** One band's songs in the game's order. */
export interface MusicPlaylist {
  /** MasterBand id, or MUSIC_OTHER_BAND for songs outside every band. */
  bandId: number;
  bandName: string;
  songs: MusicViewModel[];
}

const gameOrder = (song: MusicViewModel) => (typeof song.sortOrder === "number" && song.sortOrder > 0 ? song.sortOrder : Number.MAX_SAFE_INTEGER);

/**
 * Songs grouped by band (MasterLiveMusic `_bandIDs`; a song of several bands is in each), every group in the game's
 * order (`_sortOrder`, then id), groups by their first song's place in that order; songs without a band form the last
 * group.
 */
export function musicPlaylists(songs: readonly MusicViewModel[]): MusicPlaylist[] {
  const groups = new Map<number, MusicPlaylist>();
  for (const song of songs) {
    const ids = song.bandIds?.length ? song.bandIds : song.bandId ? [song.bandId] : [];
    const keys = ids.length && song.bandName ? ids : [MUSIC_OTHER_BAND];
    for (const bandId of new Set(keys)) {
      const group = groups.get(bandId) ?? { bandId, bandName: bandId === MUSIC_OTHER_BAND ? "" : song.bandName, songs: [] };
      groups.set(bandId, group);
      group.songs.push(song);
    }
  }
  const byOrder = (a: MusicViewModel, b: MusicViewModel) => gameOrder(a) - gameOrder(b) || a.id - b.id;
  const playlists = [...groups.values()];
  for (const playlist of playlists) playlist.songs.sort(byOrder);
  return playlists.sort((a, b) => {
    if ((a.bandId === MUSIC_OTHER_BAND) !== (b.bandId === MUSIC_OTHER_BAND)) return a.bandId === MUSIC_OTHER_BAND ? 1 : -1;
    return byOrder(a.songs[0]!, b.songs[0]!) || a.bandId - b.bandId;
  });
}

/** The summed length of the songs whose length is known, and how many those are. */
export function playlistDuration(songs: readonly MusicViewModel[], lengthOf: (song: MusicViewModel) => number | null | undefined): { totalMs: number; known: number } {
  let totalMs = 0, known = 0;
  for (const song of songs) {
    const length = lengthOf(song);
    if (typeof length === "number" && Number.isFinite(length) && length > 0) {
      totalMs += length;
      known += 1;
    }
  }
  return { totalMs, known };
}

import type { AudioTrack } from "@/lib/audio/player";
import type { MusicViewModel } from "./data";

export type SongAudioKind = "preview" | "full";

/** The audio a song offers of a kind: the short cut or the full track, the other one when that is missing. */
export function songAudioUrl(song: Pick<MusicViewModel, "audioUrl" | "previewAudioUrl">, kind: SongAudioKind): string | undefined {
  return kind === "full" ? song.audioUrl ?? song.previewAudioUrl : song.previewAudioUrl ?? song.audioUrl;
}

/**
 * A song as a track of the site-wide player, or null without audio. `assetUrl` moves the release URLs to the page's
 * server catalog (useAssetUrl); `title` is the title the page shows (title-preference.ts).
 */
export function songTrack(
  song: Pick<MusicViewModel, "id" | "bandName" | "jacketUrl" | "audioUrl" | "previewAudioUrl">,
  title: string,
  assetUrl: (url: string) => string,
  kind: SongAudioKind = "preview",
): AudioTrack | null {
  const src = songAudioUrl(song, kind);
  if (!src) return null;
  return {
    id: `music:${song.id}:${kind}`,
    src: assetUrl(src),
    title,
    ...(song.bandName ? { subtitle: song.bandName } : {}),
    ...(song.jacketUrl ? { artwork: assetUrl(song.jacketUrl) } : {}),
  };
}

/** Tracks of every song that has audio, in order. */
export function songQueue(songs: readonly MusicViewModel[], titleOf: (song: MusicViewModel) => string, assetUrl: (url: string) => string, kind: SongAudioKind = "preview"): AudioTrack[] {
  return songs.flatMap((song) => {
    const track = songTrack(song, titleOf(song), assetUrl, kind);
    return track ? [track] : [];
  });
}

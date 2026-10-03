import { useCallback, useSyncExternalStore } from "react";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * "Always show Japanese song titles": a reader preference, kept in local storage as "1" / "0". Song lists and pages
 * read titles through {@link useSongTitle}, which follows the setting live (the settings drawer's switch calls
 * {@link setForceJapaneseTitles}, which fires {@link SONG_TITLE_PREFERENCE_EVENT} on `window`).
 */
export const SONG_TITLE_PREFERENCE_KEY = "moenotes:force-ja-titles";
export const SONG_TITLE_PREFERENCE_EVENT = "moenotes:song-title-preference";

/** Whether song titles show their Japanese MasterText cell (false during SSR and by default). */
export function getForceJapaneseTitles(): boolean {
  return safeGetLocalStorage(SONG_TITLE_PREFERENCE_KEY) === "1";
}

/** Stores the preference and tells every mounted {@link useSongTitle} (`moenotes:song-title-preference`). */
export function setForceJapaneseTitles(on: boolean): void {
  safeSetLocalStorage(SONG_TITLE_PREFERENCE_KEY, on ? "1" : "0");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(SONG_TITLE_PREFERENCE_EVENT, { detail: { forceJapanese: on } }));
}

/** The fields a title is picked from. */
export interface TitledSong {
  title: string;
  titleJa?: string | undefined;
}

/** The title a song shows under the preference: its Japanese title when forced (and known), else the localized one. */
export function songTitle(song: TitledSong, forceJapanese: boolean): string {
  return forceJapanese && song.titleJa ? song.titleJa : song.title;
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === SONG_TITLE_PREFERENCE_KEY) onChange();
  };
  window.addEventListener(SONG_TITLE_PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SONG_TITLE_PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current preference, live (false while hydrating, so the static HTML and the first render agree). */
export function useForceJapaneseTitles(): boolean {
  return useSyncExternalStore(subscribe, getForceJapaneseTitles, () => false);
}

/** A `(song) => title` picker that follows the preference live. */
export function useSongTitle(): (song: TitledSong) => string {
  const force = useForceJapaneseTitles();
  return useCallback((song: TitledSong) => songTitle(song, force), [force]);
}

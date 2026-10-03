import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * The "always show Japanese song titles" switch of the settings. The music pages read the same stored value and
 * listen for the same event (src/lib/music/title-preference.ts: `moenotes:force-ja-titles`, "1" / "0", then
 * `moenotes:song-title-preference` on window), so this file only keeps the settings drawer in step with them.
 */
export const SONG_TITLE_PREFERENCE_EVENT = "moenotes:song-title-preference";
const STORAGE_KEY = storageKeys.forceJapaneseTitles;

export function getForceJapaneseTitlesSetting(): boolean {
  return safeGetLocalStorage(STORAGE_KEY) === "1";
}

export function setForceJapaneseTitlesSetting(on: boolean): void {
  safeSetLocalStorage(STORAGE_KEY, on ? "1" : "0");
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<boolean>(SONG_TITLE_PREFERENCE_EVENT, { detail: on }));
}

import { useCallback, useSyncExternalStore } from "react";
import { storageKeys } from "@/config/storage";
import { parseMasterDate } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { SPOILER_REFERENCE_NOW } from "./spoiler-reference";

export const SPOILER_PREFERENCE_EVENT = "moenotes:spoiler-preference";

/** Checks URL for ?Spoiler=allow (case-insensitive) or ?Spoiler=disallow as a quick-toggle convenience. */
export function checkSpoilerUrlParam(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const search = window.location.search;
    if (/[?&]spoiler=allow(?:&|$)/i.test(search)) {
      safeSetLocalStorage(storageKeys.showSpoiler, "1");
      return true;
    }
    if (/[?&]spoiler=(?:disallow|deny|disable|reset)(?:&|$)/i.test(search)) {
      safeSetLocalStorage(storageKeys.showSpoiler, "0");
      return false;
    }
  } catch {
    // storage not available
  }
  return null;
}

if (typeof window !== "undefined") {
  checkSpoilerUrlParam();
}

/** Whether adjusting spoiler content display is unlocked (currently unlocked for all users as a developer option). */
export function isSpoilerUnlocked(): boolean {
  return typeof window !== "undefined";
}

/** Whether spoiler content is allowed to be displayed (defaults to false until enabled in Settings). */
export function getShowSpoiler(): boolean {
  if (typeof window === "undefined") return false;
  return safeGetLocalStorage(storageKeys.showSpoiler) === "1";
}

/** Stores the preference and fires the event to listeners. */
export function setShowSpoiler(on: boolean): void {
  if (typeof window === "undefined") return;
  safeSetLocalStorage(storageKeys.showSpoiler, on ? "1" : "0");
  window.dispatchEvent(
    new CustomEvent(SPOILER_PREFERENCE_EVENT, {
      detail: { showSpoiler: on, isUnlocked: true },
    }),
  );
}

function subscribe(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const onStorage = (event: StorageEvent) => {
    if (
      event.key === null ||
      event.key === storageKeys.showSpoiler ||
      event.key === storageKeys.spoilerUnlocked
    ) {
      onChange();
    }
  };
  window.addEventListener(SPOILER_PREFERENCE_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(SPOILER_PREFERENCE_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

export interface SpoilerState {
  isUnlocked: boolean;
  showSpoiler: boolean;
  setShowSpoiler: (on: boolean) => void;
  now: number | null;
}

/** The current spoiler preference, live. */
export function useSpoiler(): SpoilerState {
  const showSpoiler = useSyncExternalStore(subscribe, getShowSpoiler, () => false);
  const set = useCallback((on: boolean) => setShowSpoiler(on), []);
  const now = useNow();
  return { isUnlocked: true, showSpoiler, setShowSpoiler: set, now };
}

export const useSpoilerSetting = useSpoiler;

/** Whether a timestamp represents an unreleased / upcoming entity. Without a live clock (SSR and the first client
 * render) it uses the serialized page render time, so both sides hide the same items before the first paint. */
export function isSpoiler(startAt: string | number | null | undefined, now?: number | null): boolean {
  if (startAt == null || startAt === "") return false;
  const start = typeof startAt === "number" ? startAt : parseMasterDate(startAt);
  if (start === null || start <= 0) return false;
  return start > (now ?? SPOILER_REFERENCE_NOW);
}

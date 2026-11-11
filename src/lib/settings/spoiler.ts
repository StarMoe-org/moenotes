import { parseMasterDate } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { SPOILER_REFERENCE_NOW } from "./spoiler-reference";

/**
 * The public site no longer exposes a spoiler switch, URL parameter or stored preference.
 * Unreleased content stays hidden and the shared notice explains why.
 */
export function isSpoilerUnlocked(): boolean {
  return false;
}

export function getShowSpoiler(): boolean {
  return false;
}

/** Kept for callers that still use the old settings API; it has no effect. */
export function setShowSpoiler(_on: boolean): void {
  // Public users cannot enable unreleased content.
}

export interface SpoilerState {
  isUnlocked: boolean;
  showSpoiler: boolean;
  setShowSpoiler: (on: boolean) => void;
  now: number | null;
}

/** The public spoiler state: always locked, with the live clock for date-based hiding. */
export function useSpoiler(): SpoilerState {
  const now = useNow();
  return { isUnlocked: false, showSpoiler: false, setShowSpoiler, now };
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

import { parseMasterDate } from "@/lib/schedule";
import { useNow } from "@/lib/schedule/use-now";
import { SPOILER_REFERENCE_NOW } from "./spoiler-reference";

/** The public site has no spoiler override: content stays locked until its official release time. */
export interface SpoilerState {
  /** Always false; retained only so existing filters share one locked public state. */
  showSpoiler: false;
  now: number | null;
}

export function useSpoiler(): SpoilerState {
  return { showSpoiler: false, now: useNow() };
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

import { useSyncExternalStore } from "react";
import { getState, subscribe, type AudioPlayerState } from "@/lib/audio/player";

const serverState = getState();

/** The site-wide audio player's state, re-rendering on every change (time updates included). */
export function useAudioPlayer(): AudioPlayerState {
  return useSyncExternalStore(
    (onChange) => subscribe(() => onChange()),
    getState,
    () => serverState,
  );
}

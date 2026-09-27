import { storageKeys } from "@/config/storage";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";

/**
 * The story player's sound options, kept in this browser: the game's music, sound effect and voice volumes, and the
 * videos' own sound (StoryPlayer.setVolume "Movie"). A muted category keeps its level for when it is turned back on.
 */
export const STORY_VOLUME_CATEGORIES = ["Bgm", "Se", "Voice", "Movie"] as const;
export type StoryVolumeCategory = typeof STORY_VOLUME_CATEGORIES[number];

export interface StoryVolume {
  level: number;
  muted: boolean;
}

export type StoryVolumes = Record<StoryVolumeCategory, StoryVolume>;

/** AdvPlaybackSpeed: the fast-forward button steps ×1 -> ×1.5 -> ×1.7 -> ×2 -> ×1. */
export const STORY_SPEEDS = [10, 15, 17, 20] as const;
export type StorySpeed = typeof STORY_SPEEDS[number];

export function nextStorySpeed(speed: number): StorySpeed {
  const index = STORY_SPEEDS.indexOf(speed as StorySpeed);
  return STORY_SPEEDS[(index + 1) % STORY_SPEEDS.length] ?? 10;
}

export function storySpeedLabel(speed: number): string {
  return `×${speed / 10}`;
}

export function loadStoryVolumes(): StoryVolumes {
  const volumes = Object.fromEntries(STORY_VOLUME_CATEGORIES.map((category) => [category, { level: 1, muted: false }])) as StoryVolumes;
  const raw = safeGetLocalStorage(storageKeys.storyPlayerVolumes);
  if (!raw) return volumes;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return volumes;
    for (const category of STORY_VOLUME_CATEGORIES) {
      const saved = (parsed as Partial<Record<string, Partial<StoryVolume>>>)[category];
      if (typeof saved?.level === "number" && Number.isFinite(saved.level)) volumes[category].level = Math.min(1, Math.max(0, saved.level));
      if (typeof saved?.muted === "boolean") volumes[category].muted = saved.muted;
    }
  } catch {
    // a damaged value: the defaults
  }
  return volumes;
}

export function saveStoryVolumes(volumes: StoryVolumes): void {
  safeSetLocalStorage(storageKeys.storyPlayerVolumes, JSON.stringify(volumes));
}

/** The volume the player gets: 0 while muted. */
export function storyVolumeLevel(volume: StoryVolume): number {
  return volume.muted ? 0 : volume.level;
}

export function storyPlayerVolumes(volumes: StoryVolumes): Record<StoryVolumeCategory, number> {
  return Object.fromEntries(STORY_VOLUME_CATEGORIES.map((category) => [category, storyVolumeLevel(volumes[category])])) as Record<StoryVolumeCategory, number>;
}

import type { SongDifficultyModel } from "@/lib/music/data";

export type MusicDifficulty = SongDifficultyModel["difficulty"];

export const MUSIC_DIFFICULTIES = ["easy", "normal", "hard", "expert"] as const satisfies readonly MusicDifficulty[];

export const DIFFICULTY_SHORT_LABELS: Readonly<Record<MusicDifficulty, string>> = {
  easy: "EZ",
  normal: "NM",
  hard: "HD",
  expert: "EX",
};

/** Chip colours shared by song cards and pickers. */
export const DIFFICULTY_CHIP_CLASSES: Readonly<Record<MusicDifficulty, string>> = {
  easy: "bg-cyan-100 text-cyan-800 border-cyan-200 dark:bg-cyan-950/40 dark:text-cyan-400 dark:border-cyan-900/50",
  normal: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-900/50",
  hard: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-900/50",
  expert: "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-900/50",
};

export function isMusicDifficulty(value: unknown): value is MusicDifficulty {
  return typeof value === "string" && (MUSIC_DIFFICULTIES as readonly string[]).includes(value);
}

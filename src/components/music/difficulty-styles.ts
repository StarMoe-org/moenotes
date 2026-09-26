import type { SongDifficultyModel } from "@/lib/music/data";

/** Difficulty accents shared by the difficulty cards and the chart preview's picker. */
export const difficultyStyles: Record<SongDifficultyModel["difficulty"], { shortLabel: string; cardBg: string; dot: string; labelColor: string }> = {
  easy: { shortLabel: "EZ", cardBg: "bg-cyan-50/10 border-cyan-100 dark:bg-cyan-950/20 dark:border-cyan-900/50", dot: "bg-cyan-500", labelColor: "text-cyan-700 dark:text-cyan-400" },
  normal: { shortLabel: "NM", cardBg: "bg-emerald-50/10 border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/50", dot: "bg-emerald-500", labelColor: "text-emerald-700 dark:text-emerald-400" },
  hard: { shortLabel: "HD", cardBg: "bg-amber-50/10 border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/50", dot: "bg-amber-500", labelColor: "text-amber-700 dark:text-amber-400" },
  expert: { shortLabel: "EX", cardBg: "bg-rose-50/10 border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/50", dot: "bg-rose-500", labelColor: "text-rose-700 dark:text-rose-400" },
};

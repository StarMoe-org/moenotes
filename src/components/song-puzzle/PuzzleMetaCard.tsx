"use client";

import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { SLIDE_PUZZLE_GRIDS, type SlidePuzzleIndexItem, type SlidePuzzleMeta } from "@/lib/song-puzzle/types";

interface PuzzleMetaCardProps {
  locale: AppLocale;
  currentGrid: number;
  availableGrids: readonly number[];
  meta: SlidePuzzleMeta | null;
  indexItem: SlidePuzzleIndexItem | null;
  onGridChange: (grid: number) => void;
}

export default function PuzzleMetaCard({
  locale,
  currentGrid,
  availableGrids,
  meta,
  indexItem,
  onGridChange,
}: PuzzleMetaCardProps) {
  const quality = meta?.quality ?? indexItem?.quality ?? "heuristic";
  const solver = meta?.solver ?? indexItem?.solver ?? "";
  const steps = meta?.solutionLength ?? indexItem?.solutionLength ?? 0;

  let qualityClass = "bg-surface-container-high text-on-surface-variant border-outline-variant";
  let qualityKey = "songPuzzle.qualityHeuristic";

  if (quality === "optimal") {
    qualityClass = "bg-primary-container text-on-primary-container border-primary/30";
    qualityKey = "songPuzzle.qualityOptimal";
  } else if (quality === "near-optimal") {
    qualityClass = "bg-tertiary-container text-on-tertiary-container border-tertiary/30";
    qualityKey = "songPuzzle.qualityNearOptimal";
  }

  return (
    <div className="md3-surface flex flex-col gap-3 rounded-2xl border border-outline-variant/60 p-4 shadow-sm md:p-5">
      {/* Grid size selection row */}
      <div className="flex flex-col gap-2">
        <span className="text-label-medium font-medium text-on-surface-variant">
          {t(locale, "songPuzzle.gridSize")}:
        </span>
        <div className="flex flex-wrap items-center gap-1.5" role="group">
          {SLIDE_PUZZLE_GRIDS.map((g) => {
            const isAvailable = availableGrids.includes(g);
            const isSelected = g === currentGrid;
            return (
              <button
                key={`grid-${g}`}
                type="button"
                disabled={!isAvailable}
                aria-pressed={isSelected}
                onClick={() => onGridChange(g)}
                className={`rounded-xl px-3 py-1.5 text-label-large font-bold transition-all ${
                  isSelected
                    ? "bg-primary text-on-primary shadow-xs ring-2 ring-primary/40"
                    : isAvailable
                      ? "bg-surface-container text-on-surface hover:bg-surface-container-high"
                      : "bg-surface-container-lowest text-on-surface-variant/40 cursor-not-allowed"
                }`}
              >
                {g}×{g}
              </button>
            );
          })}
        </div>
      </div>

      {/* Meta tags & solver indicators */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/40 pt-3 text-body-small">
        <div className="flex items-center gap-2">
          {/* Quality badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-label-small font-semibold ${qualityClass}`}
            title={solver ? `Solver: ${solver}` : undefined}
          >
            {t(locale, qualityKey)}
          </span>

          {/* Solver tag */}
          {solver && (
            <span className="font-mono text-label-small text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full">
              {solver}
            </span>
          )}
        </div>

        {/* Total steps */}
        <div className="text-on-surface-variant text-body-medium">
          {t(locale, "songPuzzle.optimalSteps")}:{" "}
          <strong className="font-mono text-primary font-bold">{steps}</strong>{" "}
          {t(locale, "songPuzzle.stepsUnit")}
        </div>
      </div>
    </div>
  );
}

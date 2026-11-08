"use client";

import { useMemo } from "react";
import {
  findBlankPosition,
  getTileBackgroundPosition,
  getTileImageCoords,
  getTilePositionsMap,
} from "@/lib/song-puzzle/math";
import type { SlidePuzzleStep } from "@/lib/song-puzzle/types";

export type PuzzleOverlayMode = "picture" | "numbered" | "numbersOnly";

interface PuzzleStageProps {
  jacketUrl: string;
  grid: number;
  board: number[][];
  goal: number[][];
  isSolved: boolean;
  overlayMode: PuzzleOverlayMode;
  stepTransitionDurationMs: number;
  skipTransition: boolean;
  lastStep: SlidePuzzleStep | null;
}

export default function PuzzleStage({
  jacketUrl,
  grid,
  board,
  goal,
  isSolved,
  overlayMode,
  stepTransitionDurationMs,
  skipTransition,
  lastStep,
}: PuzzleStageProps) {
  const positionsMap = useMemo(() => getTilePositionsMap(board), [board]);
  const blankPos = useMemo(() => findBlankPosition(board), [board]);

  // Total tiles minus the empty slot: values 0 to grid*grid - 1 except -1
  const allTileValues = useMemo(() => {
    const list: number[] = [];
    const total = grid * grid;
    // Collect all unique non-negative tile values present in goal
    for (let r = 0; r < goal.length; r += 1) {
      for (let c = 0; c < (goal[r]?.length ?? 0); c += 1) {
        const v = goal[r]?.[c];
        if (v !== undefined && v >= 0) {
          list.push(v);
        }
      }
    }
    if (list.length === 0) {
      for (let i = 0; i < total - 1; i += 1) list.push(i);
    }
    return list;
  }, [goal, grid]);

  // Missing tile in goal state (the empty slot's target slice)
  const goalBlankPos = useMemo(() => findBlankPosition(goal), [goal]);
  const missingTileCoords = useMemo(() => {
    if (!goalBlankPos) return { row: grid - 1, col: grid - 1 };
    return goalBlankPos;
  }, [goalBlankPos, grid]);

  const missingTileBgPos = useMemo(() => {
    if (grid <= 1) return "0% 0%";
    const xPercent = (missingTileCoords.col / (grid - 1)) * 100;
    const yPercent = (missingTileCoords.row / (grid - 1)) * 100;
    return `${xPercent.toFixed(4)}% ${yPercent.toFixed(4)}%`;
  }, [missingTileCoords, grid]);

  const tileSizePercent = 100 / grid;
  const transitionStyle = skipTransition
    ? "none"
    : `transform ${stepTransitionDurationMs}ms cubic-bezier(0.05, 0.7, 0.1, 1.0)`;

  return (
    <div className="relative mx-auto w-full max-w-[500px] select-none">
      {/* Outer frame */}
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl border border-outline-variant bg-surface-container-highest shadow-md md:rounded-3xl">
        {/* Slot grid background */}
        <div
          className="absolute inset-0 grid"
          style={{
            gridTemplateColumns: `repeat(${grid}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${grid}, minmax(0, 1fr))`,
          }}
        >
          {Array.from({ length: grid * grid }).map((_, i) => {
            const r = Math.floor(i / grid);
            const c = i % grid;
            const isBlank = blankPos && blankPos.row === r && blankPos.col === c;
            return (
              <div
                key={`slot-${r}-${c}`}
                className={`border border-outline-variant/30 transition-colors duration-200 ${
                  isBlank
                    ? "bg-surface-container-lowest/80 shadow-inner"
                    : "bg-surface-container/40"
                }`}
              />
            );
          })}
        </div>

        {/* Tiles layer */}
        <div className="absolute inset-0">
          {allTileValues.map((val) => {
            const currentPos = positionsMap.get(val);
            if (!currentPos) return null;

            const bg = getTileBackgroundPosition(val, grid);
            const isMovingTile = lastStep?.tile === val;

            // Check if tile is in its goal position
            const goalRow = goal[currentPos.row];
            const isHome = goalRow ? goalRow[currentPos.col] === val : false;

            // Visual number to display: 1-indexed for readability
            const displayNumber = val + 1;

            return (
              <div
                key={`tile-${val}`}
                className={`absolute p-0.5 transition-all will-change-transform ${
                  isMovingTile ? "z-20 scale-[1.02]" : "z-10"
                }`}
                style={{
                  width: `${tileSizePercent}%`,
                  height: `${tileSizePercent}%`,
                  left: 0,
                  top: 0,
                  transform: `translate3d(${currentPos.col * 100}%, ${currentPos.row * 100}%, 0)`,
                  transition: transitionStyle,
                }}
              >
                <div
                  className={`relative h-full w-full overflow-hidden rounded-md md:rounded-lg border shadow-sm transition-all duration-300 ${
                    isHome
                      ? "border-emerald-500/40 shadow-emerald-500/10"
                      : "border-outline-variant/40"
                  } ${isMovingTile ? "shadow-lg ring-2 ring-primary/60" : ""}`}
                  style={{
                    backgroundColor: "var(--md-sys-color-surface-container)",
                    backgroundImage: overlayMode !== "numbersOnly" ? `url(${jacketUrl})` : "none",
                    backgroundSize: `${grid * 100}% ${grid * 100}%`,
                    backgroundPosition: bg.css,
                    backgroundRepeat: "no-repeat",
                  }}
                >
                  {/* Numbers layer */}
                  {overlayMode !== "picture" && (
                    <div
                      className={`absolute bottom-1 right-1 flex items-center justify-center rounded px-1.5 py-0.5 text-label-small font-bold transition-colors ${
                        isHome
                          ? "bg-emerald-600/90 text-white shadow"
                          : "bg-surface-container-lowest/80 text-on-surface backdrop-blur-xs"
                      }`}
                    >
                      {displayNumber}
                    </div>
                  )}

                  {/* Pure number mode central label */}
                  {overlayMode === "numbersOnly" && (
                    <div className="flex h-full w-full items-center justify-center text-title-medium font-bold text-on-surface">
                      {displayNumber}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Missing tile in solved state (Reveals upon puzzle completion) */}
          {isSolved && (
            <div
              className="absolute p-0.5 transition-all duration-500 animate-in fade-in zoom-in-95"
              style={{
                width: `${tileSizePercent}%`,
                height: `${tileSizePercent}%`,
                left: `${missingTileCoords.col * tileSizePercent}%`,
                top: `${missingTileCoords.row * tileSizePercent}%`,
                zIndex: 15,
              }}
            >
              <div
                className="relative h-full w-full overflow-hidden rounded-md md:rounded-lg border border-emerald-400 shadow-md"
                style={{
                  backgroundColor: "var(--md-sys-color-surface-container)",
                  backgroundImage: `url(${jacketUrl})`,
                  backgroundSize: `${grid * 100}% ${grid * 100}%`,
                  backgroundPosition: missingTileBgPos,
                  backgroundRepeat: "no-repeat",
                }}
              />
            </div>
          )}
        </div>

        {/* Victory completion light sweep effect */}
        {isSolved && (
          <div className="pointer-events-none absolute inset-0 z-30 overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/25 to-transparent -translate-x-full animate-[shimmer_1.2s_ease-out_forwards]" />
          </div>
        )}
      </div>
    </div>
  );
}

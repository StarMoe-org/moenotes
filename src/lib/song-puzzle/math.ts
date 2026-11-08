import type { SlidePuzzleSolution, SlidePuzzleStep, TileCoordinate } from "./types";

/**
 * Calculates the original image row and column (screen order: top=0, left=0)
 * for a tile with target index `tileValue`.
 *
 * According to specification:
 * - Tile value represents the correct target position index.
 * - `index = y * N + x`, with origin at bottom-left, y increasing upwards.
 * - Screen coordinates: row 0 is top.
 * - Therefore:
 *   x = tileValue % N
 *   y = Math.floor(tileValue / N)
 *   screenRow = (N - 1) - y
 *   screenCol = x
 */
export function getTileImageCoords(tileValue: number, grid: number): TileCoordinate {
  if (tileValue < 0) return { row: -1, col: -1 };
  const x = tileValue % grid;
  const y = Math.floor(tileValue / grid);
  return {
    row: grid - 1 - y,
    col: x,
  };
}

/**
 * Calculates CSS background-position percentage for a tile cut from the cover.
 */
export function getTileBackgroundPosition(tileValue: number, grid: number): {
  xPercent: number;
  yPercent: number;
  css: string;
} {
  const { row, col } = getTileImageCoords(tileValue, grid);
  if (row < 0 || col < 0 || grid <= 1) {
    return { xPercent: 0, yPercent: 0, css: "0% 0%" };
  }
  const xPercent = (col / (grid - 1)) * 100;
  const yPercent = (row / (grid - 1)) * 100;
  return {
    xPercent,
    yPercent,
    css: `${xPercent.toFixed(4)}% ${yPercent.toFixed(4)}%`,
  };
}

/**
 * Checks whether two boards are identical.
 */
export function isBoardEqual(a: readonly (readonly number[])[], b: readonly (readonly number[])[]): boolean {
  if (a.length !== b.length) return false;
  for (let r = 0; r < a.length; r += 1) {
    const rowA = a[r];
    const rowB = b[r];
    if (!rowA || !rowB || rowA.length !== rowB.length) return false;
    for (let c = 0; c < rowA.length; c += 1) {
      if (rowA[c] !== rowB[c]) return false;
    }
  }
  return true;
}

/**
 * Checks whether the current board is in its goal solved state.
 */
export function isPuzzleSolved(
  current: readonly (readonly number[])[],
  goal: readonly (readonly number[])[],
): boolean {
  return isBoardEqual(current, goal);
}

/**
 * Finds the [row, col] position of the blank slot (-1) on the board.
 */
export function findBlankPosition(board: readonly (readonly number[])[]): TileCoordinate | null {
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c += 1) {
      if (row[c] === -1) return { row: r, col: c };
    }
  }
  return null;
}

/**
 * Returns the board state at a given step index (0 = initial, 1..N = steps[stepIndex - 1].board).
 */
export function getBoardAtStep(solution: SlidePuzzleSolution, stepIndex: number): number[][] {
  if (stepIndex <= 0) {
    return solution.meta.initial.map((row) => [...row]);
  }
  const clampedIndex = Math.min(stepIndex, solution.steps.length);
  const targetStep = solution.steps[clampedIndex - 1];
  if (!targetStep) {
    return solution.meta.goal.map((row) => [...row]);
  }
  return targetStep.board.map((row) => [...row]);
}

/**
 * Extracts a map of `tileValue -> { row, col }` from a 2D board.
 * Useful for mapping each persistent tile DOM element to its current physical coordinate.
 */
export function getTilePositionsMap(board: readonly (readonly number[])[]): Map<number, TileCoordinate> {
  const map = new Map<number, TileCoordinate>();
  for (let r = 0; r < board.length; r += 1) {
    const row = board[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c += 1) {
      const val = row[c];
      if (val !== undefined && val >= 0) {
        map.set(val, { row: r, col: c });
      }
    }
  }
  return map;
}

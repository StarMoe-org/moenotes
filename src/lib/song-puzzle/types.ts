export type SlidePuzzleQuality = "optimal" | "near-optimal" | "heuristic" | string;

export interface SlidePuzzleIndexItem {
  musicId: number;
  grid: number;
  file: string;
  solutionLength: number;
  solver: string;
  quality: SlidePuzzleQuality;
}

export interface SlidePuzzleMeta {
  type: "meta";
  schema: number;
  musicId: number;
  grid: number;
  jacket: string;
  initial: number[][];
  goal: number[][];
  solutionLength: number;
  solver: string;
  quality: SlidePuzzleQuality;
  elapsedMs: number;
}

export type SlideMoveDirection = "U" | "D" | "L" | "R";

export interface SlidePuzzleStep {
  type: "step";
  index: number;
  /** Space (blank slot) movement direction */
  move: SlideMoveDirection;
  /** The value/tile index of the tile being moved */
  tile: number;
  /** [row, col] of the tile before move (screen order: row 0 is top) */
  from: [number, number];
  /** [row, col] of the tile after move (screen order: row 0 is top) */
  to: [number, number];
  /** Board snapshot after this step is applied (screen order) */
  board: number[][];
}

export interface SlidePuzzleSolution {
  meta: SlidePuzzleMeta;
  steps: SlidePuzzleStep[];
}

export interface TileCoordinate {
  row: number;
  col: number;
}

export const SLIDE_PUZZLE_GRIDS = [3, 4, 5, 6, 7, 8] as const;
export type SlidePuzzleGrid = (typeof SLIDE_PUZZLE_GRIDS)[number];

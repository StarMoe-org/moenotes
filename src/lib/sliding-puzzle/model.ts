export const PUZZLE_SIZES = Object.freeze([3, 4, 5, 6, 7, 8] as const);
export type PuzzleSize = (typeof PUZZLE_SIZES)[number];

declare const puzzleBoardBrand: unique symbol;

/** An immutable permutation of 0..size²-1. Parse again after JSON/Worker transport. */
export interface PuzzleBoard {
  readonly size: PuzzleSize;
  readonly cells: readonly number[];
  readonly [puzzleBoardBrand]: true;
}

/** A tile slides from its current cell into the blank; indices are zero-based. */
export interface PuzzleMove {
  readonly tileId: number;
  readonly fromIndex: number;
  readonly toIndex: number;
}

export interface PuzzleValidationIssue {
  readonly code: "invalidSize" | "invalidCells" | "invalidLength" | "invalidTile" | "duplicateTile";
  readonly index?: number;
}

export type PuzzleBoardValidation =
  | { readonly ok: true; readonly board: PuzzleBoard }
  | { readonly ok: false; readonly issue: PuzzleValidationIssue };

export class PuzzleInputError extends Error {
  constructor(readonly issue: PuzzleValidationIssue) {
    super(issue.code);
    this.name = "PuzzleInputError";
  }
}

export function isPuzzleSize(value: unknown): value is PuzzleSize {
  return typeof value === "number" && (PUZZLE_SIZES as readonly number[]).includes(value);
}

export function assertPuzzleSize(value: unknown): asserts value is PuzzleSize {
  if (!isPuzzleSize(value)) throw new PuzzleInputError({ code: "invalidSize" });
}

function freezeBoard(size: PuzzleSize, cells: number[]): PuzzleBoard {
  return Object.freeze({ size, cells: Object.freeze(cells) }) as PuzzleBoard;
}

/** Unknown cells (null) are recognition drafts, never blank tiles or solver input. */
export function parsePuzzleBoard(size: unknown, cells: unknown): PuzzleBoardValidation {
  if (!isPuzzleSize(size)) return { ok: false, issue: { code: "invalidSize" } };
  if (!Array.isArray(cells)) return { ok: false, issue: { code: "invalidCells" } };
  const count = size * size;
  if (cells.length !== count) return { ok: false, issue: { code: "invalidLength" } };
  const seen = new Set<number>();
  const copy: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const tile: unknown = cells[index];
    if (typeof tile !== "number" || !Number.isInteger(tile) || tile < 0 || tile >= count) {
      return { ok: false, issue: { code: "invalidTile", index } };
    }
    if (seen.has(tile)) return { ok: false, issue: { code: "duplicateTile", index } };
    seen.add(tile);
    copy.push(tile);
  }
  // count unique in-range IDs implies exactly one blank and no missing tiles.
  return { ok: true, board: freezeBoard(size, copy) };
}

export function createPuzzleBoard(size: PuzzleSize, cells: readonly number[]): PuzzleBoard {
  const result = parsePuzzleBoard(size, cells);
  if (!result.ok) throw new PuzzleInputError(result.issue);
  return result.board;
}

/** The removed artwork is always the bottom-right sample, regardless of the current blank. */
export function createPuzzleGoal(size: PuzzleSize): PuzzleBoard {
  assertPuzzleSize(size);
  const count = size * size;
  return freezeBoard(size, Array.from({ length: count }, (_, index) => (index + 1) % count));
}

export function isPuzzleSolved(board: PuzzleBoard): boolean {
  return board.cells.every((tile, index) => tile === (index + 1) % board.cells.length);
}

export interface PuzzleAnalysis {
  readonly blankIndex: number;
  /** One-based from the bottom; parity is relative to the canonical bottom-right blank goal. */
  readonly blankRowFromBottom: number;
  readonly inversions: number;
  readonly solvable: boolean;
  readonly solved: boolean;
}

export function analyzePuzzleBoard(board: PuzzleBoard): PuzzleAnalysis {
  let inversions = 0;
  for (let left = 0; left < board.cells.length; left += 1) {
    const tile = board.cells[left]!;
    if (tile === 0) continue;
    for (let right = left + 1; right < board.cells.length; right += 1) {
      const other = board.cells[right]!;
      if (other !== 0 && tile > other) inversions += 1;
    }
  }
  const blankIndex = board.cells.indexOf(0);
  const blankRowFromBottom = board.size - Math.floor(blankIndex / board.size);
  return {
    blankIndex,
    blankRowFromBottom,
    inversions,
    solvable: board.size % 2 === 1 ? inversions % 2 === 0 : (inversions + blankRowFromBottom) % 2 === 1,
    solved: isPuzzleSolved(board),
  };
}

/** Legal clicks, ordered by the tile above, right, below, then left of the blank. */
export function getPuzzleMoves(board: PuzzleBoard): PuzzleMove[] {
  const blank = board.cells.indexOf(0);
  const row = Math.floor(blank / board.size);
  const column = blank % board.size;
  const sources: number[] = [];
  if (row > 0) sources.push(blank - board.size);
  if (column + 1 < board.size) sources.push(blank + 1);
  if (row + 1 < board.size) sources.push(blank + board.size);
  if (column > 0) sources.push(blank - 1);
  return sources.map((fromIndex) => ({ tileId: board.cells[fromIndex]!, fromIndex, toIndex: blank }));
}

/** Reject stale coordinates, row wrapping and a mismatched tile ID before replaying a move. */
export function applyPuzzleMove(board: PuzzleBoard, move: PuzzleMove): PuzzleBoard {
  const { tileId, fromIndex, toIndex } = move;
  if (!Number.isInteger(tileId) || tileId <= 0 || tileId >= board.cells.length
    || !Number.isInteger(fromIndex) || fromIndex < 0 || fromIndex >= board.cells.length
    || !Number.isInteger(toIndex) || toIndex < 0 || toIndex >= board.cells.length
    || board.cells[fromIndex] !== tileId || board.cells[toIndex] !== 0
    || Math.abs(Math.floor(fromIndex / board.size) - Math.floor(toIndex / board.size))
      + Math.abs(fromIndex % board.size - toIndex % board.size) !== 1) {
    throw new RangeError("Invalid puzzle move");
  }
  const cells = [...board.cells];
  cells[toIndex] = tileId;
  cells[fromIndex] = 0;
  return freezeBoard(board.size, cells);
}

/** Replays every step without mutating the input. Completion is checked separately. */
export function replayPuzzleMoves(board: PuzzleBoard, moves: readonly PuzzleMove[]): PuzzleBoard {
  return moves.reduce(applyPuzzleMove, board);
}

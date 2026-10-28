import {
  applyPuzzleMove, createPuzzleGoal, getPuzzleMoves, isPuzzleSolved, replayPuzzleMoves,
  type PuzzleBoard, type PuzzleMove,
} from "./model";

const CELL_COUNT = 9;
const PERMUTATIONS = 362880;
const FACTORIALS = [1, 1, 2, 6, 24, 120, 720, 5040, 40320] as const;
// Nine base-9 digits fit in Uint32; this avoids JavaScript's 32-bit limit on nine 4-bit tiles.
const POWERS = Array.from({ length: CELL_COUNT }, (_, index) => 9 ** index);
const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, blank) =>
  Array.from({ length: CELL_COUNT }, (_, index) => index).filter(index =>
    Math.abs(Math.floor(index / 3) - Math.floor(blank / 3)) + Math.abs(index % 3 - blank % 3) === 1));

/** A collision-free permutation index in 0..9!-1. Only validated 3x3 boards reach this boundary. */
function rank(cells: readonly number[]): number {
  let result = 0;
  for (let index = 0; index < CELL_COUNT - 1; index += 1) {
    let smaller = 0;
    for (let next = index + 1; next < CELL_COUNT; next += 1) {
      if (cells[next]! < cells[index]!) smaller += 1;
    }
    result += smaller * FACTORIALS[CELL_COUNT - index - 1]!;
  }
  return result;
}

function assertExactSize(board: PuzzleBoard): void {
  if (board.size !== 3) throw new RangeError("Exact puzzle solver requires a 3x3 board");
}

export interface ExactPuzzleTableStats {
  readonly reachableStates: number;
  readonly maxDistance: number;
  /** Retained distance buffer only, excluding the temporary build queue and object overhead. */
  readonly tableBytes: number;
}

export type ExactPuzzleResult =
  | { readonly status: "solved"; readonly optimal: true; readonly distance: number; readonly moves: readonly PuzzleMove[] }
  | { readonly status: "unsolvable" };

export interface ExactPuzzleSolver {
  readonly stats: ExactPuzzleTableStats;
  /** null denotes a valid but unreachable permutation, never an unfinished search. */
  distance(board: PuzzleBoard): number | null;
  /** Only accepts a complete model-validated 3x3 board; malformed input must be parsed first. */
  solve(board: PuzzleBoard): ExactPuzzleResult;
}

function buildTable(): { distances: Int8Array; stats: ExactPuzzleTableStats } {
  const distances = new Int8Array(PERMUTATIONS).fill(-1);
  // The queue is temporary. No queue, full board strings or mutable table escape to callers.
  const queue = new Uint32Array(PERMUTATIONS);
  const cells = [...createPuzzleGoal(3).cells];
  const goalCode = cells.reduce((sum, tile, index) => sum + tile * POWERS[index]!, 0);
  distances[rank(cells)] = 0;
  queue[0] = goalCode;
  let head = 0, tail = 1, maxDistance = 0;

  while (head < tail) {
    const code = queue[head++]!;
    let rest = code;
    for (let index = 0; index < CELL_COUNT; index += 1) {
      cells[index] = rest % 9;
      rest = Math.floor(rest / 9);
    }
    const depth = distances[rank(cells)]!;
    const blank = cells.indexOf(0);
    for (const source of NEIGHBORS[blank]!) {
      const tile = cells[source]!;
      cells[blank] = tile;
      cells[source] = 0;
      const nextRank = rank(cells);
      if (distances[nextRank] === -1) {
        const distance = depth + 1;
        distances[nextRank] = distance;
        queue[tail++] = code + tile * (POWERS[blank]! - POWERS[source]!);
        maxDistance = Math.max(maxDistance, distance);
      }
      cells[source] = tile;
      cells[blank] = 0;
    }
  }
  return { distances, stats: Object.freeze({ reachableStates: tail, maxDistance, tableBytes: distances.byteLength }) };
}

let cachedSolver: ExactPuzzleSolver | undefined;

/**
 * Builds the complete reverse-BFS table on first explicit use, then shares it within this JS realm. Construction
 * is synchronous: call from the dedicated puzzle Worker when the UI is integrated, not during rendering.
 * The cache is published only after the whole table is complete. No import-time search or network is involved.
 */
export function getExactPuzzleSolver(): ExactPuzzleSolver {
  if (cachedSolver) return cachedSolver;
  const { distances, stats } = buildTable();
  const distance = (board: PuzzleBoard): number | null => {
    assertExactSize(board);
    const value = distances[rank(board.cells)]!;
    return value < 0 ? null : value;
  };

  const solve = (board: PuzzleBoard): ExactPuzzleResult => {
    const initialDistance = distance(board);
    if (initialDistance === null) return Object.freeze({ status: "unsolvable" });
    const moves: PuzzleMove[] = [];
    let current = board;
    for (let remaining = initialDistance; remaining > 0; remaining -= 1) {
      let found = false;
      for (const move of getPuzzleMoves(current)) {
        const next = applyPuzzleMove(current, move);
        if (distance(next) !== remaining - 1) continue;
        moves.push(Object.freeze(move));
        current = next;
        found = true;
        break;
      }
      if (!found) throw new Error("Exact puzzle distance has no descending neighbor");
    }
    // Recheck the complete path using the model's independent move and goal validation before claiming success.
    if (!isPuzzleSolved(replayPuzzleMoves(board, moves))) throw new Error("Exact puzzle replay did not reach the goal");
    return Object.freeze({ status: "solved", optimal: true, distance: initialDistance, moves: Object.freeze(moves) });
  };

  cachedSolver = Object.freeze({ stats, distance, solve });
  return cachedSolver;
}

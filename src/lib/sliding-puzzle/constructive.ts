import { applyPuzzleMove, type PuzzleBoard, type PuzzleMove } from "./model";

export interface PuzzlePlacementStats {
  readonly expandedStates: number;
  readonly discoveredStates: number;
  /** Dense encoding capacity, including unused entries where tracked positions would overlap. */
  readonly stateCapacity: number;
}

export type PuzzlePlacementResult =
  | {
    readonly status: "placed";
    readonly board: PuzzleBoard;
    readonly moves: readonly PuzzleMove[];
    /** Previous locks plus the newly placed tiles, in ascending cell order. */
    readonly lockedIndices: readonly number[];
    readonly stats: PuzzlePlacementStats;
  }
  | {
    /** The requested placement is unreachable while these locks remain fixed; not a whole-board verdict. */
    readonly status: "blocked";
    readonly stats: PuzzlePlacementStats;
  };

export class PuzzlePlacementError extends RangeError {
  constructor(readonly code: "invalidTile" | "invalidLine" | "invalidLocks" | "lockedTileMismatch") {
    super(code);
    this.name = "PuzzlePlacementError";
  }
}

function validateLocks(board: PuzzleBoard, indices: readonly number[]): Set<number> {
  const locked = new Set<number>();
  for (const index of indices) {
    if (!Number.isInteger(index) || index < 0 || index >= board.cells.length - 1 || locked.has(index)) {
      throw new PuzzlePlacementError("invalidLocks");
    }
    if (board.cells[index] !== index + 1) throw new PuzzlePlacementError("lockedTileMismatch");
    locked.add(index);
  }
  return locked;
}

/**
 * Project the unlocked board onto the blank and up to two distinguished tiles. Every projected edge is a real
 * blank slide; the other tile identities do not restrict it. BFS therefore finds a complete placement path without
 * enumerating full-board permutations. With m unlocked cells the encoding uses at most m³ <= 64³ entries.
 */
function placeTiles(board: PuzzleBoard, tileIds: readonly number[], lockedIndices: readonly number[]): PuzzlePlacementResult {
  const locked = validateLocks(board, lockedIndices);
  const active = tileIds.filter(tileId => !locked.has(tileId - 1));
  const finish = (moves: readonly PuzzleMove[], stats: PuzzlePlacementStats): PuzzlePlacementResult => {
    let current = board;
    for (const move of moves) {
      if (locked.has(move.fromIndex) || locked.has(move.toIndex)) throw new Error("Placement crossed a locked cell");
      current = applyPuzzleMove(current, move);
    }
    if (tileIds.some(tileId => current.cells[tileId - 1] !== tileId)
      || [...locked].some(index => current.cells[index] !== board.cells[index])) {
      throw new Error("Puzzle placement replay failed");
    }
    return Object.freeze({
      status: "placed", board: current, moves: Object.freeze(moves), stats,
      lockedIndices: Object.freeze([...new Set([...locked, ...tileIds.map(tileId => tileId - 1)])].sort((a, b) => a - b)),
    });
  };
  if (active.every(tileId => board.cells[tileId - 1] === tileId)) {
    return finish([], Object.freeze({ expandedStates: 0, discoveredStates: 0, stateCapacity: 0 }));
  }

  const free = board.cells.flatMap((_, index) => locked.has(index) ? [] : [index]);
  const local = new Int16Array(board.cells.length).fill(-1);
  free.forEach((index, position) => { local[index] = position; });
  const neighbors = free.map(index => {
    const row = Math.floor(index / board.size), column = index % board.size;
    const adjacent: number[] = [];
    if (row > 0) adjacent.push(index - board.size);
    if (column + 1 < board.size) adjacent.push(index + 1);
    if (row + 1 < board.size) adjacent.push(index + board.size);
    if (column > 0) adjacent.push(index - 1);
    return adjacent.filter(cell => !locked.has(cell)).map(cell => local[cell]!);
  });
  const count = free.length;
  const secondFactor = active.length === 2 ? count * count : 0;
  const capacity = count ** (active.length + 1);
  const blank = local[board.cells.indexOf(0)]!;
  const first = local[board.cells.indexOf(active[0]!)]!;
  const second = active.length === 2 ? local[board.cells.indexOf(active[1]!)]! : 0;
  const firstGoal = local[active[0]! - 1]!;
  const secondGoal = active.length === 2 ? local[active[1]! - 1]! : 0;
  const start = blank + count * first + secondFactor * second;
  const parents = new Int32Array(capacity).fill(-1);
  const queue = new Uint32Array(capacity);
  parents[start] = start;
  queue[0] = start;
  let head = 0, tail = 1, goal = -1;

  while (head < tail) {
    const code = queue[head++]!;
    const zero = code % count;
    const a = Math.floor(code / count) % count;
    const b = secondFactor ? Math.floor(code / secondFactor) : 0;
    if (a === firstGoal && b === secondGoal) { goal = code; break; }
    for (const source of neighbors[zero]!) {
      const nextA = a === source ? zero : a;
      const nextB = secondFactor && b === source ? zero : b;
      const next = source + count * nextA + secondFactor * nextB;
      if (parents[next] !== -1) continue;
      parents[next] = code;
      queue[tail++] = next;
    }
  }
  const stats = Object.freeze({ expandedStates: head, discoveredStates: tail, stateCapacity: capacity });
  if (goal === -1) return Object.freeze({ status: "blocked", stats });

  const sources: number[] = [];
  for (let code = goal; code !== start; code = parents[code]!) sources.push(free[code % count]!);
  sources.reverse();
  // Lift the projected path to actual tile IDs, then independently replay through the model in finish().
  const cells = [...board.cells];
  const moves: PuzzleMove[] = [];
  let toIndex = board.cells.indexOf(0);
  for (const fromIndex of sources) {
    const tileId = cells[fromIndex]!;
    moves.push(Object.freeze({ tileId, fromIndex, toIndex }));
    cells[toIndex] = tileId;
    cells[fromIndex] = 0;
    toIndex = fromIndex;
  }
  return finish(moves, stats);
}

/** Place one nonblank tile in its canonical cell, preserving and extending existing correct locks. */
export function placePuzzleTile(board: PuzzleBoard, tileId: number, lockedIndices: readonly number[] = []): PuzzlePlacementResult {
  if (!Number.isInteger(tileId) || tileId <= 0 || tileId >= board.cells.length) {
    throw new PuzzlePlacementError("invalidTile");
  }
  return placeTiles(board, [tileId], lockedIndices);
}

/** Complete the rightmost two cells of a row together; the bottom row is reserved for final reduction. */
export function placePuzzleRowEnd(board: PuzzleBoard, row: number, lockedIndices: readonly number[] = []): PuzzlePlacementResult {
  if (!Number.isInteger(row) || row < 0 || row >= board.size - 1) throw new PuzzlePlacementError("invalidLine");
  return placeTiles(board, [row * board.size + board.size - 1, row * board.size + board.size], lockedIndices);
}

/** Complete the bottom two cells of a column together; the rightmost column includes the removed tile. */
export function placePuzzleColumnEnd(board: PuzzleBoard, column: number, lockedIndices: readonly number[] = []): PuzzlePlacementResult {
  if (!Number.isInteger(column) || column < 0 || column >= board.size - 1) throw new PuzzlePlacementError("invalidLine");
  return placeTiles(board, [(board.size - 2) * board.size + column + 1, (board.size - 1) * board.size + column + 1], lockedIndices);
}

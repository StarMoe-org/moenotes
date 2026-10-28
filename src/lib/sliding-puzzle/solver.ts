import {
  placePuzzleColumnEnd, placePuzzleRowEnd, placePuzzleTile, type PuzzlePlacementResult,
} from "./constructive";
import { getExactPuzzleSolver } from "./exact";
import {
  analyzePuzzleBoard, applyPuzzleMove, isPuzzleSolved, parsePuzzleBoard, replayPuzzleMoves,
  type PuzzleBoard, type PuzzleMove,
} from "./model";

export interface PuzzleSolveStats {
  readonly layers: number;
  /** Placement calls, including targets already home, not just searches. */
  readonly placements: number;
  /** Sum of placement expansions; excludes the shared exact-table construction. */
  readonly expandedStates: number;
  /** Largest individual placement encoding; not the total memory or number of visited states. */
  readonly peakStateCapacity: number;
  /** Shortest distance within the final 3x3, not a global lower bound for a larger board. */
  readonly tailDistance: number | null;
}

export type PuzzleSolveFailure = "placementBlocked" | "invalidReduction" | "tailUnsolvable" | "replayMismatch";
export type PuzzleSolveResult =
  | {
    readonly status: "solved";
    readonly method: "alreadySolved" | "exact3x3" | "layered";
    readonly optimal: boolean;
    readonly steps: number;
    readonly moves: readonly PuzzleMove[];
    readonly stats: PuzzleSolveStats;
  }
  | { readonly status: "unsolvable" }
  | { readonly status: "failed"; readonly reason: PuzzleSolveFailure; readonly stats: PuzzleSolveStats };

/**
 * Synchronous 3x3..8x8 core. Call from a dedicated Worker when integrated with UI. Input must be parsed by the
 * model first. Only initial parity can return unsolvable; a failed local construction is an internal failure.
 */
export function solvePuzzle(board: PuzzleBoard): PuzzleSolveResult {
  const analysis = analyzePuzzleBoard(board);
  if (!analysis.solvable) return Object.freeze({ status: "unsolvable" });
  const work = { layers: 0, placements: 0, expandedStates: 0, peakStateCapacity: 0, tailDistance: null as number | null };
  const snapshot = (): PuzzleSolveStats => Object.freeze({ ...work });
  const failed = (reason: PuzzleSolveFailure): PuzzleSolveResult => Object.freeze({ status: "failed", reason, stats: snapshot() });
  if (analysis.solved) {
    return Object.freeze({
      status: "solved", method: "alreadySolved", optimal: true, steps: 0,
      moves: Object.freeze([]), stats: snapshot(),
    });
  }

  let current = board;
  let locked: readonly number[] = [];
  const moves: PuzzleMove[] = [];
  const adopt = (result: PuzzlePlacementResult): boolean => {
    work.placements += 1;
    work.expandedStates += result.stats.expandedStates;
    work.peakStateCapacity = Math.max(work.peakStateCapacity, result.stats.stateCapacity);
    if (result.status === "blocked") return false;
    current = result.board;
    locked = result.lockedIndices;
    moves.push(...result.moves);
    return true;
  };

  // Each layer removes a top row and left column of the current square, keeping at least a 3x3 remainder.
  for (let layer = 0; layer < board.size - 3; layer += 1) {
    for (let column = layer; column < board.size - 2; column += 1) {
      if (!adopt(placePuzzleTile(current, layer * board.size + column + 1, locked))) return failed("placementBlocked");
    }
    if (!adopt(placePuzzleRowEnd(current, layer, locked))) return failed("placementBlocked");
    for (let row = layer + 1; row < board.size - 2; row += 1) {
      if (!adopt(placePuzzleTile(current, row * board.size + layer + 1, locked))) return failed("placementBlocked");
    }
    if (!adopt(placePuzzleColumnEnd(current, layer, locked))) return failed("placementBlocked");
    work.layers += 1;
  }

  const offset = board.size - 3;
  const indices = Array.from({ length: 9 }, (_, index) =>
    (offset + Math.floor(index / 3)) * board.size + offset + index % 3);
  const tailIndices = new Set(indices);
  if (locked.length !== board.cells.length - 9 || locked.some(index => tailIndices.has(index))
    || current.cells.some((tile, index) => !tailIndices.has(index) && tile !== index + 1)) {
    return failed("invalidReduction");
  }

  // Canonical IDs in this region are not consecutive on larger boards: e.g. 4x4 has 6,7,8,10,11,12,14,15,0.
  const localToGlobal = [0, ...indices.slice(0, -1).map(index => index + 1)];
  const globalToLocal = new Map(localToGlobal.map((tileId, localId) => [tileId, localId]));
  const tail = parsePuzzleBoard(3, indices.map(index => globalToLocal.get(current.cells[index]!)));
  if (!tail.ok) return failed("invalidReduction");
  const exact = getExactPuzzleSolver().solve(tail.board);
  if (exact.status !== "solved") return failed("tailUnsolvable");
  work.tailDistance = exact.distance;
  for (const localMove of exact.moves) {
    const move = Object.freeze({
      tileId: localToGlobal[localMove.tileId]!,
      fromIndex: indices[localMove.fromIndex]!,
      toIndex: indices[localMove.toIndex]!,
    });
    current = applyPuzzleMove(current, move);
    moves.push(move);
  }

  // Certify the complete path from the original board, not just the final reduced board.
  if (!isPuzzleSolved(replayPuzzleMoves(board, moves))) return failed("replayMismatch");
  return Object.freeze({
    status: "solved", method: board.size === 3 ? "exact3x3" : "layered", optimal: board.size === 3,
    steps: moves.length, moves: Object.freeze(moves), stats: snapshot(),
  });
}

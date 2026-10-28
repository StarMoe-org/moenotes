import { applyPuzzleMove, isPuzzleSolved, replayPuzzleMoves, type PuzzleBoard, type PuzzleMove } from "./model";

export interface PuzzlePlayback {
  readonly initial: PuzzleBoard;
  readonly board: PuzzleBoard;
  readonly moves: readonly PuzzleMove[];
  readonly position: number;
}

/** Immutable cursor: one next/previous action applies exactly one move, without retaining every board snapshot. */
export function createPuzzlePlayback(initial: PuzzleBoard, moves: readonly PuzzleMove[]): PuzzlePlayback {
  const snapshot = Object.freeze(moves.map(move => Object.freeze({ ...move })));
  if (!isPuzzleSolved(replayPuzzleMoves(initial, snapshot))) throw new RangeError("Incomplete puzzle playback");
  return Object.freeze({ initial, board: initial, moves: snapshot, position: 0 });
}

export function stepPuzzlePlayback(state: PuzzlePlayback, direction: "previous" | "next"): PuzzlePlayback {
  const index = direction === "next" ? state.position : state.position - 1;
  const move = state.moves[index];
  if (!move) return state;
  const applied = direction === "next" ? move : { tileId: move.tileId, fromIndex: move.toIndex, toIndex: move.fromIndex };
  return Object.freeze({ ...state, board: applyPuzzleMove(state.board, applied), position: state.position + (direction === "next" ? 1 : -1) });
}

export function resetPuzzlePlayback(state: PuzzlePlayback): PuzzlePlayback {
  return Object.freeze({ ...state, board: state.initial, position: 0 });
}

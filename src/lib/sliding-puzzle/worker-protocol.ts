import { analyzePuzzleBoard, isPuzzleSolved, replayPuzzleMoves, type PuzzleBoard, type PuzzleMove, type PuzzleValidationIssue } from "./model";
import type { PuzzleSolveFailure, PuzzleSolveResult, PuzzleSolveStats } from "./solver";

export const PUZZLE_WORKER_PROTOCOL = "moenotes.sliding-puzzle/1";
export const MAX_PUZZLE_TIME_MS = 120000;
export const MAX_PUZZLE_MOVES = 10000;

export interface PuzzleTaskBinding {
  readonly jobId: string;
  readonly inputRevision: string;
  readonly artworkSourceId: string;
}

export interface PuzzleWorkerRequest {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL;
  readonly type: "solve";
  /** Internal client sequence, preventing duplicate replies when caller bindings are reused. */
  readonly requestId: number;
  readonly binding: PuzzleTaskBinding;
  readonly input: { readonly size: unknown; readonly cells: unknown };
  readonly timeLimitMs: number;
}

export type PuzzleWorkerFailureCode = "protocol" | "worker" | "message" | "runtime" | "solver" | "scope";
export type PuzzleWorkerResult =
  | Extract<PuzzleSolveResult, { status: "solved" | "unsolvable" }>
  | { readonly status: "invalid"; readonly issue: PuzzleValidationIssue }
  | { readonly status: "failed"; readonly code: PuzzleWorkerFailureCode; readonly reason?: PuzzleSolveFailure }
  | { readonly status: "timeLimit" };
export type PuzzleJobResult = PuzzleWorkerResult | { readonly status: "cancelled" | "stale" };

export interface PuzzleWorkerReply {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL;
  readonly type: "result";
  readonly requestId: number;
  readonly binding: PuzzleTaskBinding;
  readonly result: PuzzleWorkerResult;
}

export function isPuzzleRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function parsePuzzleBinding(value: unknown): PuzzleTaskBinding | null {
  if (!isPuzzleRecord(value)) return null;
  const { jobId, inputRevision, artworkSourceId } = value;
  if (![jobId, inputRevision, artworkSourceId].every(part => typeof part === "string" && part.length > 0 && part.length <= 1024)) return null;
  return Object.freeze({ jobId: jobId as string, inputRevision: inputRevision as string, artworkSourceId: artworkSourceId as string });
}

export function samePuzzleBinding(a: PuzzleTaskBinding, b: PuzzleTaskBinding): boolean {
  return a.jobId === b.jobId && a.inputRevision === b.inputRevision && a.artworkSourceId === b.artworkSourceId;
}

export function validPuzzleBudget(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 && value <= MAX_PUZZLE_TIME_MS;
}

export function readPuzzleWorkerRequest(value: unknown): PuzzleWorkerRequest | null {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "solve"
    || !Number.isSafeInteger(value.requestId) || (value.requestId as number) <= 0
    || !validPuzzleBudget(value.timeLimitMs) || !isPuzzleRecord(value.input)) return null;
  const binding = parsePuzzleBinding(value.binding);
  if (!binding) return null;
  return { protocol: PUZZLE_WORKER_PROTOCOL, type: "solve", requestId: value.requestId as number,
    binding, input: { size: value.input.size, cells: value.input.cells }, timeLimitMs: value.timeLimitMs };
}

const integer = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value >= 0 && value <= max;

export class PuzzleProtocolError extends Error {
  constructor() { super("Invalid puzzle Worker reply"); this.name = "PuzzleProtocolError"; }
}

function readStats(value: unknown, board: PuzzleBoard, method: string, steps: number): PuzzleSolveStats {
  if (!isPuzzleRecord(value)) throw new PuzzleProtocolError();
  const { layers, placements, expandedStates, peakStateCapacity, tailDistance } = value;
  const already = method === "alreadySolved";
  if (!integer(layers, 5) || layers !== (already ? 0 : board.size - 3)
    || !integer(placements, 45) || placements !== (already ? 0 : (board.size - 3) * (board.size + 1))
    || !integer(expandedStates, placements * 64 ** 3) || !integer(peakStateCapacity, 64 ** 3)
    || (already ? tailDistance !== null : !integer(tailDistance, Math.min(31, steps)))) throw new PuzzleProtocolError();
  return Object.freeze({ layers, placements, expandedStates, peakStateCapacity, tailDistance: tailDistance as number | null });
}

/** Validate the complete solution in the receiving realm; never run a second search on the main thread. */
export function validatePuzzleWorkerReply(value: unknown, requestId: number, binding: PuzzleTaskBinding, board: PuzzleBoard): PuzzleWorkerResult {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "result"
    || value.requestId !== requestId) throw new PuzzleProtocolError();
  const receivedBinding = parsePuzzleBinding(value.binding);
  if (!receivedBinding || !samePuzzleBinding(receivedBinding, binding) || !isPuzzleRecord(value.result)) throw new PuzzleProtocolError();
  const result = value.result;
  if (result.status === "unsolvable") {
    if (analyzePuzzleBoard(board).solvable) throw new PuzzleProtocolError();
    return Object.freeze({ status: "unsolvable" });
  }
  if (result.status === "timeLimit") return Object.freeze({ status: "timeLimit" });
  if (result.status === "failed") {
    const codes: readonly string[] = ["protocol", "worker", "message", "runtime", "solver", "scope"];
    const reasons: readonly string[] = ["placementBlocked", "invalidReduction", "tailUnsolvable", "replayMismatch"];
    if (typeof result.code !== "string" || !codes.includes(result.code)
      || (result.code === "solver" && (typeof result.reason !== "string" || !reasons.includes(result.reason)))) throw new PuzzleProtocolError();
    return Object.freeze({ status: "failed", code: result.code as PuzzleWorkerFailureCode,
      ...(result.code === "solver" ? { reason: result.reason as PuzzleSolveFailure } : {}) });
  }
  // A client sends only parsed inputs. A Worker invalid-input verdict for that snapshot is a protocol failure.
  if (result.status !== "solved" || !integer(result.steps, MAX_PUZZLE_MOVES)
    || !Array.isArray(result.moves) || result.moves.length !== result.steps) throw new PuzzleProtocolError();
  const method = isPuzzleSolved(board) ? "alreadySolved" : board.size === 3 ? "exact3x3" : "layered";
  if (result.method !== method || result.optimal !== (method !== "layered")) throw new PuzzleProtocolError();
  const stats = readStats(result.stats, board, method, result.steps);
  if (method === "alreadySolved" && result.steps !== 0
    || method === "exact3x3" && result.steps !== stats.tailDistance) throw new PuzzleProtocolError();
  const moves: PuzzleMove[] = result.moves.map(raw => {
    if (!isPuzzleRecord(raw) || !integer(raw.tileId, board.cells.length - 1) || raw.tileId === 0
      || !integer(raw.fromIndex, board.cells.length - 1) || !integer(raw.toIndex, board.cells.length - 1)) throw new PuzzleProtocolError();
    return Object.freeze({ tileId: raw.tileId, fromIndex: raw.fromIndex, toIndex: raw.toIndex });
  });
  try {
    if (!isPuzzleSolved(replayPuzzleMoves(board, moves))) throw new PuzzleProtocolError();
  } catch { throw new PuzzleProtocolError(); }
  return Object.freeze({ status: "solved", method, optimal: method !== "layered", steps: result.steps, moves: Object.freeze(moves), stats });
}

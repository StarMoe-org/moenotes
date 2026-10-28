import { describe, expect, test } from "bun:test";
import { createPuzzleBoard, createPuzzleGoal } from "../src/lib/sliding-puzzle/model";
import { solvePuzzle } from "../src/lib/sliding-puzzle/solver";
import { createPuzzleWorkerHandler } from "../src/lib/sliding-puzzle/worker-handler";
import {
  MAX_PUZZLE_MOVES, PUZZLE_WORKER_PROTOCOL, PuzzleProtocolError, parsePuzzleBinding, readPuzzleWorkerRequest,
  validatePuzzleWorkerReply, type PuzzleWorkerReply, type PuzzleWorkerRequest,
} from "../src/lib/sliding-puzzle/worker-protocol";

const binding = { jobId: "job", inputRevision: "review-1", artworkSourceId: "tw:100027:art-hash:3:crop-v1" };
const board = createPuzzleBoard(3, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
const request = (): PuzzleWorkerRequest => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "solve", requestId: 1,
  binding: { ...binding }, input: { size: board.size, cells: [...board.cells] }, timeLimitMs: 5000 });
const reply = (): PuzzleWorkerReply => ({ protocol: PUZZLE_WORKER_PROTOCOL, type: "result", requestId: 1, binding, result: solvePuzzle(board) as PuzzleWorkerReply["result"] });

describe("puzzle Worker protocol", () => {
  test("validates version, sequence, budgets and opaque source bindings", () => {
    expect(readPuzzleWorkerRequest(request())).not.toBeNull();
    for (const part of ["jobId", "inputRevision", "artworkSourceId"] as const) {
      expect(parsePuzzleBinding({ ...binding, [part]: "" })).toBeNull();
      expect(parsePuzzleBinding({ ...binding, [part]: 1 })).toBeNull();
      expect(parsePuzzleBinding({ ...binding, [part]: "a".repeat(1025) })).toBeNull();
    }
    for (const changes of [{ protocol: "wrong" }, { type: "cancel" }, { requestId: 0 }, { requestId: 1.5 },
      { timeLimitMs: 0 }, { timeLimitMs: 120001 }, { timeLimitMs: Infinity }, { input: null }, { binding: null }]) {
      expect(readPuzzleWorkerRequest({ ...request(), ...changes })).toBeNull();
    }
    expect(readPuzzleWorkerRequest(null)).toBeNull();
  });

  test("accepts a complete replay and snapshots every move and statistic", () => {
    const raw = structuredClone(reply());
    const result = validatePuzzleWorkerReply(raw, 1, binding, board);
    expect(result.status).toBe("solved");
    if (result.status !== "solved" || raw.result.status !== "solved") throw new Error("Expected solved");
    expect(Object.isFrozen(result.moves)).toBe(true);
    expect(Object.isFrozen(result.moves[0])).toBe(true);
    expect(Object.isFrozen(result.stats)).toBe(true);
    (raw.result.moves[0] as { tileId: number }).tileId = 1;
    expect(result.moves[0]!.tileId).toBe(8);
  });

  test("rejects wrong bindings, unsupported envelopes and false impossibility", () => {
    for (const changes of [{ requestId: 2 }, { protocol: "wrong" }, { type: "progress" },
      { binding: { ...binding, artworkSourceId: "other-server" } }, { result: { status: "unsolvable" } },
      { result: { status: "invalid", issue: { code: "invalidTile" } } }, { result: { status: "cancelled" } }]) {
      expect(() => validatePuzzleWorkerReply({ ...reply(), ...changes }, 1, binding, board)).toThrow(PuzzleProtocolError);
    }
    const unsolvable = createPuzzleBoard(3, [2, 1, 3, 4, 5, 6, 7, 8, 0]);
    expect(validatePuzzleWorkerReply({ ...reply(), result: { status: "unsolvable" } }, 1, binding, unsolvable)).toEqual({ status: "unsolvable" });
  });

  test("rejects truncated, forged, fractional and oversized paths", () => {
    const answer = solvePuzzle(board);
    if (answer.status !== "solved") throw new Error("Expected solved");
    for (const changes of [
      { moves: [], steps: 1 }, { moves: [], steps: 0 }, { steps: 1.5 }, { steps: MAX_PUZZLE_MOVES + 1 },
      { moves: [{ tileId: 7, fromIndex: 8, toIndex: 7 }] },
      { moves: [{ tileId: 8, fromIndex: 8, toIndex: 6 }] },
      { moves: [{ tileId: 8, fromIndex: 8.5, toIndex: 7 }] },
      { optimal: false }, { method: "layered" }, { stats: { ...answer.stats, tailDistance: 2 } },
      { stats: { ...answer.stats, layers: -1 } }, { stats: { ...answer.stats, expandedStates: Infinity } },
    ]) expect(() => validatePuzzleWorkerReply({ ...reply(), result: { ...answer, ...changes } }, 1, binding, board)).toThrow(PuzzleProtocolError);
  });

  test("accepts a replayed large-board result while rejecting a forged global optimality claim", () => {
    const cells = [...createPuzzleGoal(8).cells];
    [cells[62], cells[63]] = [0, 63];
    const large = createPuzzleBoard(8, cells);
    const answer = solvePuzzle(large);
    expect(validatePuzzleWorkerReply({ ...reply(), result: answer }, 1, binding, large).status).toBe("solved");
    expect(() => validatePuzzleWorkerReply({ ...reply(), result: { ...answer, optimal: true } }, 1, binding, large)).toThrow(PuzzleProtocolError);
  });
});

describe("puzzle Worker handler", () => {
  test("revalidates input inside the Worker before invoking the solver", () => {
    const posted: PuzzleWorkerReply[] = [];
    let calls = 0;
    const handle = createPuzzleWorkerHandler(value => posted.push(value), { solve: input => { calls++; return solvePuzzle(input); } });
    handle({ ...request(), input: { size: 3, cells: [1, 2, 3] } });
    expect(calls).toBe(0);
    expect(posted[0]!.result).toEqual({ status: "invalid", issue: { code: "invalidLength" } });
    handle({ ...request(), binding: null });
    expect(posted).toHaveLength(1);
    handle(request());
    expect(calls).toBe(1);
    expect(posted[1]!.binding).toEqual(binding);
    expect(posted[1]!.result.status).toBe("solved");
  });

  test("normalizes runtime errors, solver failures and elapsed budgets without declaring unsolvable", () => {
    const posted: PuzzleWorkerReply[] = [];
    createPuzzleWorkerHandler(value => posted.push(value), { solve: () => { throw new Error("private diagnostic"); } })(request());
    expect(posted.pop()!.result).toEqual({ status: "failed", code: "runtime" });
    const failure = { status: "failed", reason: "placementBlocked", stats: { layers: 0, placements: 1, expandedStates: 1, peakStateCapacity: 16, tailDistance: null } } as const;
    createPuzzleWorkerHandler(value => posted.push(value), { solve: () => failure })(request());
    expect(posted.pop()!.result).toEqual({ status: "failed", code: "solver", reason: "placementBlocked" });
    let clock = 0;
    createPuzzleWorkerHandler(value => posted.push(value), { now: () => clock, solve: input => { clock = 5000; return solvePuzzle(input); } })(request());
    expect(posted.pop()!.result).toEqual({ status: "timeLimit" });
  });
});

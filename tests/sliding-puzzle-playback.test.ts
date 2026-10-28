import { describe, expect, test } from "bun:test";
import { applyPuzzleMove, createPuzzleBoard, createPuzzleGoal, getPuzzleMoves, isPuzzleSolved, PUZZLE_SIZES } from "../src/lib/sliding-puzzle/model";
import { formatPuzzleBoard, parsePuzzleText } from "../src/lib/sliding-puzzle/manual-input";
import { createPuzzlePlayback, resetPuzzlePlayback, stepPuzzlePlayback } from "../src/lib/sliding-puzzle/playback";
import { solvePuzzle } from "../src/lib/sliding-puzzle/solver";

describe("manual puzzle review", () => {
  test("accepts rows and comma-separated IDs while retaining an arbitrary blank", () => {
    for (const text of ["5 4 3\n0 8 2\n6 7 1", "5,4,3,0,8,2,6,7,1", " 5，4，3\r\n0 8 2\r\n6 7 1 "]) {
      const parsed = parsePuzzleText(3, text);
      expect(parsed.ok).toBe(true);
      if (parsed.ok) expect(parsed.board.cells).toEqual([5, 4, 3, 0, 8, 2, 6, 7, 1]);
    }
  });
  test("rejects malformed text, missing cells, duplicates and out-of-range IDs", () => {
    for (const text of ["", "   ", "1 2 3 4 5 6 7 8", "1 2 3 4 5 6 7 8 8", "1 2 3 4 5 6 7 8 9", "1 2 3 4 5 6 7 8 -0", "1 2 3 4 5 6 7 8 0.0", "1 2 3 4 5 6 7 8 0e0", "[1,2,3,4,5,6,7,8,0]", "1 2 3 4 5 6 7 8 null", "1 ".repeat(3000)]) expect(parsePuzzleText(3, text).ok).toBe(false);
    const impossible = parsePuzzleText(3, "2 1 3 4 5 6 7 8 0");
    expect(impossible.ok).toBe(true); // Manual syntax validation must not silently fix parity.
  });
  test("round-trips target layouts for all sizes without treating ID 63 as text digits", () => {
    for (const size of PUZZLE_SIZES) {
      const goal = createPuzzleGoal(size);
      const formatted = formatPuzzleBoard(goal);
      expect(formatted.split("\n")).toHaveLength(size);
      const parsed = parsePuzzleText(size, formatted);
      expect(parsed.ok && parsed.board.cells).toEqual(goal.cells);
    }
  });
});

describe("one-move-at-a-time playback", () => {
  for (const size of PUZZLE_SIZES) test(`${size}x${size} traverses every move forwards and backwards and keeps boundary actions inert`, () => {
    let initial = createPuzzleGoal(size);
    for (let i = 0; i < 150; i++) {
      const choices = getPuzzleMoves(initial);
      initial = applyPuzzleMove(initial, choices[(i * 13 + Math.floor(i / 7)) % choices.length]!);
    }
    const result = solvePuzzle(initial);
    if (result.status !== "solved") throw new Error("Fixture did not solve");
    let cursor = createPuzzlePlayback(initial, result.moves);
    expect(cursor.board).toBe(initial);
    expect(stepPuzzlePlayback(cursor, "previous")).toBe(cursor);
    const visited = [initial.cells];
    for (const move of result.moves) {
      const before = cursor;
      cursor = stepPuzzlePlayback(cursor, "next");
      expect(cursor.position).toBe(before.position + 1);
      expect(cursor.board.cells[move.toIndex]).toBe(move.tileId);
      expect(cursor.board.cells[move.fromIndex]).toBe(0);
      expect(before.position).toBe(visited.length - 1);
      visited.push(cursor.board.cells);
    }
    expect(isPuzzleSolved(cursor.board)).toBe(true);
    expect(stepPuzzlePlayback(cursor, "next")).toBe(cursor);
    const reset = resetPuzzlePlayback(cursor);
    expect(reset.position).toBe(0);
    expect(reset.board).toBe(initial);
    while (cursor.position > 0) {
      cursor = stepPuzzlePlayback(cursor, "previous");
      expect(cursor.board.cells).toEqual(visited[cursor.position]);
    }
    expect(cursor.board.cells).toEqual(initial.cells);
    expect(Object.isFrozen(cursor)).toBe(true);
  });
  test("supports zero steps, rejects incomplete paths and snapshots caller-owned moves", () => {
    const goal = createPuzzleGoal(3);
    const zero = createPuzzlePlayback(goal, []);
    expect(stepPuzzlePlayback(zero, "next")).toBe(zero);
    expect(stepPuzzlePlayback(zero, "previous")).toBe(zero);
    const initial = createPuzzleBoard(3, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
    expect(() => createPuzzlePlayback(initial, [])).toThrow();
    const moves = [{ tileId: 8, fromIndex: 8, toIndex: 7 }];
    const cursor = createPuzzlePlayback(initial, moves);
    moves[0]!.tileId = 7;
    moves.length = 0;
    expect(isPuzzleSolved(stepPuzzlePlayback(cursor, "next").board)).toBe(true);
    expect(cursor.position).toBe(0);
    expect(Object.isFrozen(cursor.moves[0])).toBe(true);
  });
});

import { describe, expect, test } from "bun:test";
import {
  PUZZLE_SIZES, PuzzleInputError, analyzePuzzleBoard, applyPuzzleMove, createPuzzleBoard, createPuzzleGoal,
  getPuzzleMoves, isPuzzleSize, isPuzzleSolved, parsePuzzleBoard, replayPuzzleMoves,
  type PuzzleMove, type PuzzleSize,
} from "../src/lib/sliding-puzzle/model";

const withBlank = (size: PuzzleSize, index: number) => {
  const cells = [...createPuzzleGoal(size).cells];
  [cells[index], cells[cells.length - 1]] = [cells[cells.length - 1]!, cells[index]!];
  return createPuzzleBoard(size, cells);
};

describe("puzzle input boundary", () => {
  test("accepts exactly the six supported numeric sizes", () => {
    expect(PUZZLE_SIZES).toEqual([3, 4, 5, 6, 7, 8]);
    for (const size of PUZZLE_SIZES) expect(isPuzzleSize(size)).toBe(true);
    for (const size of [null, undefined, "3", 2, 9, 3.5, NaN, Infinity]) {
      expect(isPuzzleSize(size)).toBe(false);
      expect(parsePuzzleBoard(size, [])).toEqual({ ok: false, issue: { code: "invalidSize" } });
    }
  });

  test("does not coerce malformed arrays or unknown recognition cells", () => {
    for (const cells of [null, undefined, "123456780", { length: 9 }, new Uint8Array(9)]) {
      expect(parsePuzzleBoard(3, cells)).toEqual({ ok: false, issue: { code: "invalidCells" } });
    }
    for (const cells of [[], [1, 2, 3], [1, 2, 3, 4, 5, 6, 7, 8, 0, 9]]) {
      expect(parsePuzzleBoard(3, cells)).toEqual({ ok: false, issue: { code: "invalidLength" } });
    }
    for (const value of [null, undefined, "8", false, -1, 9, 1.5, NaN, Infinity]) {
      expect(parsePuzzleBoard(3, [1, 2, 3, 4, 5, 6, 7, value, 0]))
        .toEqual({ ok: false, issue: { code: "invalidTile", index: 7 } });
    }
    expect(parsePuzzleBoard(3, new Array(9)))
      .toEqual({ ok: false, issue: { code: "invalidTile", index: 0 } });
  });

  test("rejects duplicate tiles, missing blank and multiple blanks", () => {
    for (const cells of [[1, 2, 3, 4, 5, 6, 7, 7, 0], [1, 2, 3, 4, 5, 6, 7, 8, 8], [1, 2, 3, 4, 5, 6, 7, 0, 0]]) {
      const result = parsePuzzleBoard(3, cells);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.issue.code).toBe("duplicateTile");
    }
    expect(() => createPuzzleBoard(3, [])).toThrow(PuzzleInputError);
    expect(() => createPuzzleGoal(9 as PuzzleSize)).toThrow(PuzzleInputError);
  });

  test("snapshots and freezes input without rejecting valid unsolvable permutations", () => {
    const input = [2, 1, 3, 4, 5, 6, 7, 8, 0];
    const result = parsePuzzleBoard(3, input);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid permutation");
    input[0] = 8;
    expect(result.board.cells[0]).toBe(2);
    expect(Object.isFrozen(result.board)).toBe(true);
    expect(Object.isFrozen(result.board.cells)).toBe(true);
    expect(analyzePuzzleBoard(result.board).solvable).toBe(false);
  });
});

for (const size of PUZZLE_SIZES) {
  describe(`${size}x${size} board`, () => {
    test("numbers the complete goal, including ID 63 on the largest board", () => {
      const goal = createPuzzleGoal(size);
      expect(goal.cells).toEqual([...Array.from({ length: size * size - 1 }, (_, i) => i + 1), 0]);
      expect(analyzePuzzleBoard(goal)).toEqual({
        blankIndex: size * size - 1, blankRowFromBottom: 1, inversions: 0, solvable: true, solved: true,
      });
    });

    test("distinguishes solved state from a solvable one-move state", () => {
      const goal = createPuzzleGoal(size);
      const move = getPuzzleMoves(goal)[0]!;
      const next = applyPuzzleMove(goal, move);
      expect(isPuzzleSolved(next)).toBe(false);
      expect(analyzePuzzleBoard(next).solvable).toBe(true);
      expect(next.cells[move.fromIndex]).toBe(0);
      expect(next.cells[move.toIndex]).toBe(move.tileId);
      expect(goal.cells[goal.cells.length - 1]).toBe(0);
      expect(applyPuzzleMove(next, { ...move, fromIndex: move.toIndex, toIndex: move.fromIndex })).toEqual(goal);
    });

    test("only exposes adjacent clicks at every blank position", () => {
      for (let blank = 0; blank < size * size; blank += 1) {
        const board = withBlank(size, blank);
        const row = Math.floor(blank / size), column = blank % size;
        const moves = getPuzzleMoves(board);
        expect(moves.length).toBe((row > 0 ? 1 : 0) + (row < size - 1 ? 1 : 0)
          + (column > 0 ? 1 : 0) + (column < size - 1 ? 1 : 0));
        expect(new Set(moves.map(move => move.fromIndex)).size).toBe(moves.length);
        for (const move of moves) {
          expect(move.toIndex).toBe(blank);
          expect(Math.abs(Math.floor(move.fromIndex / size) - row) + Math.abs(move.fromIndex % size - column)).toBe(1);
          expect(move.tileId).toBe(board.cells[move.fromIndex]!);
          expect(parsePuzzleBoard(size, applyPuzzleMove(board, move).cells).ok).toBe(true);
        }
      }
    });

    test("preserves solvability along a deterministic legal scramble", () => {
      let board = createPuzzleGoal(size);
      let seed = size;
      for (let step = 0; step < 500; step += 1) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        const moves = getPuzzleMoves(board);
        board = applyPuzzleMove(board, moves[seed % moves.length]!);
        expect(analyzePuzzleBoard(board).solvable).toBe(true);
      }
      const cells = [...board.cells];
      const occupied = cells.flatMap((tile, index) => tile ? [index] : []);
      const [first, second] = [occupied[0]!, occupied[1]!];
      [cells[first], cells[second]] = [cells[second]!, cells[first]!];
      expect(analyzePuzzleBoard(createPuzzleBoard(size, cells)).solvable).toBe(false);
    });
  });
}

describe("move validation and replay", () => {
  test("rejects row wrapping, diagonal moves, blank moves and stale coordinates", () => {
    const board = createPuzzleBoard(3, [1, 2, 0, 3, 4, 5, 6, 7, 8]);
    const invalid: PuzzleMove[] = [
      { tileId: 3, fromIndex: 3, toIndex: 2 },
      { tileId: 4, fromIndex: 4, toIndex: 2 },
      { tileId: 0, fromIndex: 2, toIndex: 2 },
      { tileId: 1, fromIndex: 1, toIndex: 2 },
      { tileId: 2, fromIndex: 1, toIndex: 0 },
      { tileId: 2, fromIndex: -1, toIndex: 2 },
      { tileId: 2, fromIndex: 1.5, toIndex: 2 },
      { tileId: 2, fromIndex: 1, toIndex: 9 },
      { tileId: NaN, fromIndex: 1, toIndex: 2 },
    ];
    for (const move of invalid) expect(() => applyPuzzleMove(board, move)).toThrow(RangeError);
    const move = { tileId: 2, fromIndex: 1, toIndex: 2 };
    const moved = applyPuzzleMove(board, move);
    expect(() => applyPuzzleMove(moved, move)).toThrow(RangeError);
    expect(() => replayPuzzleMoves(board, [move, move])).toThrow(RangeError);
    expect(board.cells).toEqual([1, 2, 0, 3, 4, 5, 6, 7, 8]);
  });

  test("replays and reverses the independently solved real screenshot fixture", () => {
    const initial = createPuzzleBoard(3, [5, 4, 3, 0, 8, 2, 6, 7, 1]);
    const clickedIds = [8, 7, 6, 8, 7, 2, 1, 6, 8, 7, 5, 4, 2, 1, 3, 2, 1, 5, 4, 1, 2, 3, 6];
    let board = initial;
    const moves = clickedIds.map(tileId => {
      const move = { tileId, fromIndex: board.cells.indexOf(tileId), toIndex: board.cells.indexOf(0) };
      board = applyPuzzleMove(board, move);
      return move;
    });
    expect(analyzePuzzleBoard(initial).solvable).toBe(true);
    expect(replayPuzzleMoves(initial, moves)).toEqual(createPuzzleGoal(3));
    const reversed = [...moves].reverse().map(move => ({ ...move, fromIndex: move.toIndex, toIndex: move.fromIndex }));
    expect(replayPuzzleMoves(board, reversed)).toEqual(initial);
    expect(replayPuzzleMoves(initial, [])).toBe(initial);
  });

  test("matches solvability to an independent exhaustive 3x3 reachability oracle", () => {
    // Raw string BFS deliberately uses neither production moves nor production parity to find reachable states.
    const queue = ["123456780"];
    const reachable = new Set(queue);
    for (let head = 0; head < queue.length; head += 1) {
      const state = queue[head]!;
      const blank = state.indexOf("0");
      for (let cell = 0; cell < 9; cell += 1) {
        if (Math.abs(cell % 3 - blank % 3) + Math.abs(Math.floor(cell / 3) - Math.floor(blank / 3)) !== 1) continue;
        const next = state.split("");
        [next[cell], next[blank]] = [next[blank]!, next[cell]!];
        const key = next.join("");
        if (!reachable.has(key)) { reachable.add(key); queue.push(key); }
      }
    }
    expect(reachable.size).toBe(181440);
    let examined = 0;
    const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    const enumerate = (start: number) => {
      if (start === cells.length) {
        const actual = analyzePuzzleBoard(createPuzzleBoard(3, cells)).solvable;
        if (actual !== reachable.has(cells.join(""))) throw new Error(`Parity mismatch: ${cells}`);
        examined += 1;
        return;
      }
      for (let next = start; next < cells.length; next += 1) {
        [cells[start], cells[next]] = [cells[next]!, cells[start]!];
        enumerate(start + 1);
        [cells[start], cells[next]] = [cells[next]!, cells[start]!];
      }
    };
    enumerate(0);
    expect(examined).toBe(362880);
  }, 15000);
});

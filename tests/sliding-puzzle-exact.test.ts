import { describe, expect, test } from "bun:test";
import { getExactPuzzleSolver } from "../src/lib/sliding-puzzle/exact";
import { createPuzzleBoard, createPuzzleGoal, replayPuzzleMoves, type PuzzleBoard } from "../src/lib/sliding-puzzle/model";

let oracle: Map<string, number> | undefined;

/** Independent string BFS: no production ranking, encoding, neighbor or move functions. */
function referenceDistances(): Map<string, number> {
  if (oracle) return oracle;
  const distances = new Map([["123456780", 0]]);
  const queue = ["123456780"];
  for (let head = 0; head < queue.length; head += 1) {
    const state = queue[head]!;
    const blank = state.indexOf("0");
    const depth = distances.get(state)!;
    for (let cell = 0; cell < 9; cell += 1) {
      if (Math.abs(cell % 3 - blank % 3) + Math.abs(Math.floor(cell / 3) - Math.floor(blank / 3)) !== 1) continue;
      const chars = state.split("");
      [chars[cell], chars[blank]] = [chars[blank]!, chars[cell]!];
      const next = chars.join("");
      if (!distances.has(next)) { distances.set(next, depth + 1); queue.push(next); }
    }
  }
  oracle = distances;
  return distances;
}

function verifySolution(board: PuzzleBoard, expectedDistance: number): void {
  const initial = [...board.cells];
  const result = getExactPuzzleSolver().solve(board);
  expect(result.status).toBe("solved");
  if (result.status !== "solved") throw new Error("Expected solution");
  expect(result.optimal).toBe(true);
  expect(result.distance).toBe(expectedDistance);
  expect(result.moves).toHaveLength(expectedDistance);
  expect(replayPuzzleMoves(board, result.moves)).toEqual(createPuzzleGoal(3));
  expect(board.cells).toEqual(initial);
}

describe("3x3 exact solver", () => {
  test("builds one private complete distance table and reuses its immutable API", () => {
    const solver = getExactPuzzleSolver();
    expect(solver).toBe(getExactPuzzleSolver());
    expect(solver.stats).toEqual({ reachableStates: 181440, maxDistance: 31, tableBytes: 362880 });
    expect(Object.isFrozen(solver)).toBe(true);
    expect(Object.isFrozen(solver.stats)).toBe(true);
  });

  test("returns an empty optimal solution for the goal and one move for its neighbor", () => {
    verifySolution(createPuzzleGoal(3), 0);
    verifySolution(createPuzzleBoard(3, [1, 2, 3, 4, 5, 6, 7, 0, 8]), 1);
    verifySolution(createPuzzleBoard(3, [1, 2, 3, 4, 5, 0, 7, 8, 6]), 1);
  });

  test("solves the real screenshot in 23 moves and a deepest board in 31 moves", () => {
    verifySolution(createPuzzleBoard(3, [5, 4, 3, 0, 8, 2, 6, 7, 1]), 23);
    verifySolution(createPuzzleBoard(3, [8, 6, 7, 2, 5, 4, 3, 0, 1]), 31);
  });

  test("distinguishes unreachable permutations from solved and unsupported boards", () => {
    const solver = getExactPuzzleSolver();
    for (const cells of [[2, 1, 3, 4, 5, 6, 7, 8, 0], [1, 2, 3, 4, 5, 6, 8, 7, 0]]) {
      const board = createPuzzleBoard(3, cells);
      expect(solver.distance(board)).toBeNull();
      expect(solver.solve(board)).toEqual({ status: "unsolvable" });
    }
    for (const size of [4, 5, 6, 7, 8] as const) {
      expect(() => solver.distance(createPuzzleGoal(size))).toThrow(RangeError);
      expect(() => solver.solve(createPuzzleGoal(size))).toThrow(RangeError);
    }
  });

  test("keeps result moves immutable and does not let one caller corrupt later solutions", () => {
    const board = createPuzzleBoard(3, [1, 2, 3, 4, 5, 6, 7, 0, 8]);
    const result = getExactPuzzleSolver().solve(board);
    if (result.status !== "solved") throw new Error("Expected solution");
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.moves)).toBe(true);
    expect(Object.isFrozen(result.moves[0])).toBe(true);
    expect(result.moves[0]).toEqual({ tileId: 8, fromIndex: 8, toIndex: 7 });
    verifySolution(board, 1);
  });

  test("matches every permutation against independent BFS distances, including unreachable states", () => {
    const expected = referenceDistances();
    expect(expected.size).toBe(181440);
    const solver = getExactPuzzleSolver();
    const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];
    let examined = 0, unreachable = 0, maxDistance = 0;
    const enumerate = (start: number) => {
      if (start === 9) {
        const reference = expected.get(cells.join("")) ?? null;
        const actual = solver.distance(createPuzzleBoard(3, cells));
        if (actual !== reference) throw new Error(`Distance mismatch: ${cells}; ${actual} != ${reference}`);
        if (actual === null) unreachable += 1;
        else maxDistance = Math.max(maxDistance, actual);
        examined += 1;
        return;
      }
      for (let next = start; next < 9; next += 1) {
        [cells[start], cells[next]] = [cells[next]!, cells[start]!];
        enumerate(start + 1);
        [cells[start], cells[next]] = [cells[next]!, cells[start]!];
      }
    };
    enumerate(0);
    expect(examined).toBe(362880);
    expect(unreachable).toBe(181440);
    expect(maxDistance).toBe(31);
  }, 15000);

  test("replays a shortest path at every depth and a deterministic spread of reachable boards", () => {
    const expected = referenceDistances();
    const testedDepths = new Set<number>();
    const testedBlanks = new Set<number>();
    let index = 0, tested = 0;
    for (const [state, depth] of expected) {
      index += 1;
      if (testedDepths.has(depth) && index % 701 !== 0) continue;
      const board = createPuzzleBoard(3, [...state].map(Number));
      const result = getExactPuzzleSolver().solve(board);
      verifySolution(board, depth);
      if (result.status !== "solved") throw new Error("Expected solution");
      // Every intermediate state must descend the independent oracle by exactly one.
      let current = board;
      for (const [step, move] of result.moves.entries()) {
        current = replayPuzzleMoves(current, [move]);
        expect(expected.get(current.cells.join(""))).toBe(depth - step - 1);
      }
      testedDepths.add(depth);
      testedBlanks.add(state.indexOf("0"));
      tested += 1;
    }
    expect(testedDepths.size).toBe(32);
    expect(testedBlanks.size).toBe(9);
    expect(tested).toBeGreaterThan(250);
  }, 15000);
});

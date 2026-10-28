import { describe, expect, test } from "bun:test";
import { getExactPuzzleSolver } from "../src/lib/sliding-puzzle/exact";
import { PUZZLE_SIZES, analyzePuzzleBoard, createPuzzleBoard, createPuzzleGoal, type PuzzleBoard, type PuzzleSize } from "../src/lib/sliding-puzzle/model";
import { solvePuzzle, type PuzzleSolveResult } from "../src/lib/sliding-puzzle/solver";

function generator(seed: number): () => number {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
}

function shuffled(size: PuzzleSize, seed: number): PuzzleBoard {
  const random = generator(seed);
  const cells = [...createPuzzleGoal(size).cells];
  for (let index = cells.length - 1; index > 0; index -= 1) {
    const other = random() % (index + 1);
    [cells[index], cells[other]] = [cells[other]!, cells[index]!];
  }
  // Independent invariant: permutation parity including zero must equal the blank's distance parity to its goal.
  const goalOrder = cells.map(tile => tile === 0 ? cells.length - 1 : tile - 1);
  let transpositions = 0;
  const visited = new Set<number>();
  for (let index = 0; index < cells.length; index += 1) {
    if (visited.has(index)) continue;
    let length = 0;
    for (let at = index; !visited.has(at); at = goalOrder[at]!) { visited.add(at); length += 1; }
    transpositions += length - 1;
  }
  const blank = cells.indexOf(0);
  const blankDistance = size - 1 - Math.floor(blank / size) + size - 1 - blank % size;
  if (transpositions % 2 !== blankDistance % 2) {
    const occupied = cells.flatMap((tile, index) => tile ? [index] : []);
    const [first, second] = [occupied[0]!, occupied[1]!];
    [cells[first], cells[second]] = [cells[second]!, cells[first]!];
  }
  return createPuzzleBoard(size, cells);
}

function scrambled(size: PuzzleSize, seed: number): PuzzleBoard {
  const random = generator(seed);
  const cells = [...createPuzzleGoal(size).cells];
  let blank = cells.length - 1, previous = -1;
  for (let step = 0; step < 1000; step += 1) {
    const choices = cells.flatMap((_, index) => index !== previous
      && Math.abs(index % size - blank % size) + Math.abs(Math.floor(index / size) - Math.floor(blank / size)) === 1 ? [index] : []);
    const source = choices[random() % choices.length]!;
    [cells[blank], cells[source]] = [cells[source]!, cells[blank]!];
    previous = blank;
    blank = source;
  }
  return createPuzzleBoard(size, cells);
}

/** Independent numerical replay, never using production apply/replay or string IDs for larger boards. */
function verifySolution(board: PuzzleBoard, result: PuzzleSolveResult) {
  expect(result.status).toBe("solved");
  if (result.status !== "solved") throw new Error(`Expected solution: ${JSON.stringify(result)}`);
  const cells = [...board.cells];
  expect(result.steps).toBe(result.moves.length);
  for (const move of result.moves) {
    expect(Number.isInteger(move.tileId) && move.tileId > 0 && move.tileId < cells.length).toBe(true);
    expect(Number.isInteger(move.fromIndex) && move.fromIndex >= 0 && move.fromIndex < cells.length).toBe(true);
    expect(Number.isInteger(move.toIndex) && move.toIndex >= 0 && move.toIndex < cells.length).toBe(true);
    expect(cells[move.fromIndex]).toBe(move.tileId);
    expect(cells[move.toIndex]).toBe(0);
    expect(Math.abs(move.fromIndex % board.size - move.toIndex % board.size)
      + Math.abs(Math.floor(move.fromIndex / board.size) - Math.floor(move.toIndex / board.size))).toBe(1);
    [cells[move.fromIndex], cells[move.toIndex]] = [cells[move.toIndex]!, cells[move.fromIndex]!];
  }
  expect(cells).toEqual([...Array.from({ length: board.size * board.size - 1 }, (_, index) => index + 1), 0]);
  expect(result.optimal).toBe(board.size === 3 || result.steps === 0);
  expect(result.stats.peakStateCapacity).toBeLessThanOrEqual(64 ** 3);
  return result;
}

for (const size of PUZZLE_SIZES) {
  describe(`${size}x${size} complete solver`, () => {
    test("short-circuits the goal with an immutable zero-step proof", () => {
      const board = createPuzzleGoal(size);
      const result = verifySolution(board, solvePuzzle(board));
      expect(result.method).toBe("alreadySolved");
      expect(result.stats).toEqual({ layers: 0, placements: 0, expandedStates: 0, peakStateCapacity: 0, tailDistance: null });
      expect(Object.isFrozen(result)).toBe(true);
      expect(Object.isFrozen(result.moves)).toBe(true);
      expect(Object.isFrozen(result.stats)).toBe(true);
    });

    test("solves both neighbors of the goal in one move using full-board coordinates", () => {
      for (const source of [size * size - 2, size * size - size - 1]) {
        const cells = [...createPuzzleGoal(size).cells];
        [cells[source], cells[cells.length - 1]] = [0, cells[source]!];
        const board = createPuzzleBoard(size, cells);
        const result = verifySolution(board, solvePuzzle(board));
        expect(result.steps).toBe(1);
        expect(result.moves[0]).toEqual({ tileId: source + 1, fromIndex: cells.length - 1, toIndex: source });
        expect(result.stats.layers).toBe(size - 3);
        expect(result.stats.tailDistance).toBe(1);
      }
    });

    test("rejects opposite parity before constructing a partial path", () => {
      const cells = [...createPuzzleGoal(size).cells];
      [cells[0], cells[1]] = [cells[1]!, cells[0]!];
      const board = createPuzzleBoard(size, cells);
      expect(solvePuzzle(board)).toEqual({ status: "unsolvable" });
      expect(board.cells).toEqual(cells);
    });

    test("solves deterministic shuffled permutations with independently corrected parity", () => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const board = shuffled(size, size * 7919 + seed * 1337);
        const initial = [...board.cells];
        expect(analyzePuzzleBoard(board).solvable).toBe(true);
        const result = verifySolution(board, solvePuzzle(board));
        expect(board.cells).toEqual(initial);
        expect(result.method).toBe(size === 3 ? "exact3x3" : "layered");
        expect(result.stats.layers).toBe(size - 3);
      }
    }, 15000);

    test("solves independent thousand-move scrambles including displaced edge tiles", () => {
      for (let seed = 1; seed <= 20; seed += 1) {
        const board = scrambled(size, seed * 97 + size * 131);
        verifySolution(board, solvePuzzle(board));
      }
    }, 15000);

    test("maps a deepest 3x3 tail without disturbing the already solved outer region", () => {
      const offset = size - 3;
      const indices = Array.from({ length: 9 }, (_, index) =>
        (offset + Math.floor(index / 3)) * size + offset + index % 3);
      const localToGlobal = [0, ...indices.slice(0, -1).map(index => index + 1)];
      const cells = [...createPuzzleGoal(size).cells];
      const deepest = [8, 6, 7, 2, 5, 4, 3, 0, 1];
      indices.forEach((index, local) => { cells[index] = localToGlobal[deepest[local]!]!; });
      const board = createPuzzleBoard(size, cells);
      const result = verifySolution(board, solvePuzzle(board));
      expect(result.steps).toBe(31);
      expect(result.stats.expandedStates).toBe(0);
      expect(result.stats.tailDistance).toBe(31);
      for (const move of result.moves) {
        expect(indices.includes(move.fromIndex) && indices.includes(move.toIndex)).toBe(true);
        expect(localToGlobal.includes(move.tileId)).toBe(true);
        expect(Object.isFrozen(move)).toBe(true);
      }
    });
  });
}

describe("complete solver regressions", () => {
  test("retains the exact 23-move solution for the user's screenshot", () => {
    const board = createPuzzleBoard(3, [5, 4, 3, 0, 8, 2, 6, 7, 1]);
    const result = verifySolution(board, solvePuzzle(board));
    expect(result.steps).toBe(23);
    const exact = getExactPuzzleSolver().solve(board);
    if (exact.status !== "solved") throw new Error("Expected exact solution");
    expect(result.moves).toEqual(exact.moves);
  });

  test("solves reversed row and column ends with a parity-preserving second transposition", () => {
    for (const size of [4, 5, 6, 7, 8] as const) {
      for (const pair of [[size - 2, size - 1], [(size - 2) * size, (size - 1) * size]]) {
        const cells = [...createPuzzleGoal(size).cells];
        [cells[pair[0]!], cells[pair[1]!]] = [cells[pair[1]!]!, cells[pair[0]!]!];
        [cells[size + 1], cells[size + 2]] = [cells[size + 2]!, cells[size + 1]!];
        const board = createPuzzleBoard(size, cells);
        expect(analyzePuzzleBoard(board).solvable).toBe(true);
        verifySolution(board, solvePuzzle(board));
      }
    }
  });
});

import { describe, expect, test } from "bun:test";
import {
  PuzzlePlacementError, placePuzzleColumnEnd, placePuzzleRowEnd, placePuzzleTile, type PuzzlePlacementResult,
} from "../src/lib/sliding-puzzle/constructive";
import { analyzePuzzleBoard, createPuzzleBoard, createPuzzleGoal, type PuzzleBoard, type PuzzleSize } from "../src/lib/sliding-puzzle/model";

/** Generate legal scrambles without the production move generator, retaining every lock at every step. */
function scramble(size: PuzzleSize, locked: readonly number[], seed: number): PuzzleBoard {
  const cells = [...createPuzzleGoal(size).cells];
  let blank = cells.length - 1, previous = -1;
  for (let step = 0; step < 600; step += 1) {
    const choices = cells.flatMap((_, index) => index !== previous && !locked.includes(index)
      && Math.abs(index % size - blank % size) + Math.abs(Math.floor(index / size) - Math.floor(blank / size)) === 1 ? [index] : []);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const source = choices[seed % choices.length]!;
    cells[blank] = cells[source]!;
    cells[source] = 0;
    previous = blank;
    blank = source;
  }
  return createPuzzleBoard(size, cells);
}

function verifyPlacement(board: PuzzleBoard, locked: readonly number[], targets: readonly number[], result: PuzzlePlacementResult) {
  expect(result.status).toBe("placed");
  if (result.status !== "placed") throw new Error("Expected placement");
  const cells = [...board.cells];
  for (const move of result.moves) {
    expect(locked.includes(move.fromIndex) || locked.includes(move.toIndex)).toBe(false);
    expect(cells[move.fromIndex]).toBe(move.tileId);
    expect(cells[move.toIndex]).toBe(0);
    expect(Math.abs(move.fromIndex % board.size - move.toIndex % board.size)
      + Math.abs(Math.floor(move.fromIndex / board.size) - Math.floor(move.toIndex / board.size))).toBe(1);
    [cells[move.fromIndex], cells[move.toIndex]] = [cells[move.toIndex]!, cells[move.fromIndex]!];
    for (const index of locked) expect(cells[index]).toBe(index + 1);
  }
  expect(cells).toEqual(result.board.cells);
  for (const tileId of targets) expect(cells[tileId - 1]).toBe(tileId);
  expect(result.lockedIndices).toEqual([...new Set([...locked, ...targets.map(id => id - 1)])].sort((a, b) => a - b));
  expect(result.stats.discoveredStates).toBeLessThanOrEqual(result.stats.stateCapacity);
  expect(result.stats.expandedStates).toBeLessThanOrEqual(result.stats.discoveredStates);
  expect(result.stats.stateCapacity).toBeLessThanOrEqual(64 ** 3);
  return result;
}

/** Full-board 3x3 BFS independently checks the projected planner's reachability and local path length. */
function referenceDistance(board: PuzzleBoard, locked: readonly number[], targets: readonly number[]): number | null {
  const start = board.cells.join("");
  const queue = [{ state: start, depth: 0 }];
  const visited = new Set([start]);
  for (let head = 0; head < queue.length; head += 1) {
    const { state, depth } = queue[head]!;
    if (targets.every(id => Number(state[id - 1]) === id)) return depth;
    const blank = state.indexOf("0");
    for (let source = 0; source < 9; source += 1) {
      if (locked.includes(source) || Math.abs(source % 3 - blank % 3)
        + Math.abs(Math.floor(source / 3) - Math.floor(blank / 3)) !== 1) continue;
      const next = [...state];
      [next[source], next[blank]] = [next[blank]!, next[source]!];
      const key = next.join("");
      if (!visited.has(key)) { visited.add(key); queue.push({ state: key, depth: depth + 1 }); }
    }
  }
  return null;
}

for (const size of [4, 5, 6, 7, 8] as const) {
  describe(`${size}x${size} constrained placements`, () => {
    test("places a single tile without touching an existing corner", () => {
      const locked = [0, 1, size];
      const board = scramble(size, locked, size * 19);
      const initial = [...board.cells];
      verifyPlacement(board, locked, [3], placePuzzleTile(board, 3, locked));
      expect(board.cells).toEqual(initial);
    });

    test("finishes a row from legal scrambles and a reversed end pair", () => {
      const locked = Array.from({ length: size - 2 }, (_, index) => index);
      for (const seed of [5, 37, 101]) {
        const board = scramble(size, locked, seed);
        verifyPlacement(board, locked, [size - 1, size], placePuzzleRowEnd(board, 0, locked));
      }
      const cells = [...createPuzzleGoal(size).cells];
      [cells[size - 2], cells[size - 1]] = [cells[size - 1]!, cells[size - 2]!];
      const board = createPuzzleBoard(size, cells);
      verifyPlacement(board, locked, [size - 1, size], placePuzzleRowEnd(board, 0, locked));
    });

    test("finishes a column while retaining a completed top row and column prefix", () => {
      const locked = Array.from({ length: size }, (_, index) => index);
      for (let row = 1; row < size - 2; row += 1) locked.push(row * size);
      const targets = [(size - 2) * size + 1, (size - 1) * size + 1];
      for (const seed of [7, 29, 83]) {
        const board = scramble(size, locked, seed);
        verifyPlacement(board, locked, targets, placePuzzleColumnEnd(board, 0, locked));
      }
      const cells = [...createPuzzleGoal(size).cells];
      [cells[targets[0]! - 1], cells[targets[1]! - 1]] = [cells[targets[1]! - 1]!, cells[targets[0]! - 1]!];
      const board = createPuzzleBoard(size, cells);
      verifyPlacement(board, locked, targets, placePuzzleColumnEnd(board, 0, locked));
    });

    test("places end pairs inside a reduced four-by-four active region", () => {
      const layer = size - 4;
      const base = Array.from({ length: size * size }, (_, index) => index)
        .filter(index => Math.floor(index / size) < layer || index % size < layer);
      const rowLocks = [...base];
      for (let column = layer; column < size - 2; column += 1) rowLocks.push(layer * size + column);
      const board = scramble(size, rowLocks, size * 73);
      const rowTargets = [layer * size + size - 1, layer * size + size];
      verifyPlacement(board, rowLocks, rowTargets, placePuzzleRowEnd(board, layer, rowLocks));

      const columnLocks = [...base];
      for (let column = layer; column < size; column += 1) columnLocks.push(layer * size + column);
      for (let row = layer + 1; row < size - 2; row += 1) columnLocks.push(row * size + layer);
      const columnBoard = scramble(size, columnLocks, size * 97);
      const columnTargets = [(size - 2) * size + layer + 1, (size - 1) * size + layer + 1];
      verifyPlacement(columnBoard, columnLocks, columnTargets, placePuzzleColumnEnd(columnBoard, layer, columnLocks));
    });

    test("composes single placements and paired endings to fix the first row and column", () => {
      let board = scramble(size, [], size * 193);
      let locked: readonly number[] = [];
      const adopt = (targets: readonly number[], result: PuzzlePlacementResult) => {
        const placed = verifyPlacement(board, locked, targets, result);
        board = placed.board;
        locked = placed.lockedIndices;
      };
      for (let tileId = 1; tileId <= size - 2; tileId += 1) {
        adopt([tileId], placePuzzleTile(board, tileId, locked));
      }
      adopt([size - 1, size], placePuzzleRowEnd(board, 0, locked));
      for (let row = 1; row < size - 2; row += 1) {
        const tileId = row * size + 1;
        adopt([tileId], placePuzzleTile(board, tileId, locked));
      }
      adopt([(size - 2) * size + 1, (size - 1) * size + 1], placePuzzleColumnEnd(board, 0, locked));
      expect(locked).toHaveLength(size * 2 - 1);
      for (const index of locked) {
        expect(Math.floor(index / size) === 0 || index % size === 0).toBe(true);
        expect(board.cells[index]).toBe(index + 1);
      }
      expect(analyzePuzzleBoard(board).solvable).toBe(true);
    });
  });
}

describe("placement traps and boundaries", () => {
  test("uses the full 64-cubed encoding safely with tile 63 and no locked cells", () => {
    const cells = [...createPuzzleGoal(8).cells];
    [cells[0], cells[54], cells[62]] = [cells[54]!, cells[62]!, cells[0]!];
    const board = createPuzzleBoard(8, cells);
    const result = verifyPlacement(board, [], [55, 63], placePuzzleColumnEnd(board, 6));
    expect(result.stats.stateCapacity).toBe(64 ** 3);
    expect(result.moves.length).toBeGreaterThan(0);
    expect(Object.isFrozen(result.moves[0])).toBe(true);
  });

  test("solves row and column traps by moving the two end tiles together", () => {
    const row = createPuzzleBoard(3, [1, 2, 6, 4, 5, 8, 7, 3, 0]);
    expect(analyzePuzzleBoard(row).solvable).toBe(true);
    expect(placePuzzleRowEnd(row, 0, [0, 1]).status).toBe("blocked");
    verifyPlacement(row, [0], [2, 3], placePuzzleRowEnd(row, 0, [0]));

    const column = createPuzzleBoard(3, [1, 2, 3, 4, 5, 7, 8, 6, 0]);
    expect(analyzePuzzleBoard(column).solvable).toBe(true);
    expect(placePuzzleColumnEnd(column, 0, [0, 3]).status).toBe("blocked");
    verifyPlacement(column, [0], [4, 7], placePuzzleColumnEnd(column, 0, [0]));
  });

  test("reports blocked locks without declaring a globally solvable board unsolvable", () => {
    const board = createPuzzleBoard(4, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 13, 0]);
    const locked = Array.from({ length: 12 }, (_, index) => index);
    const initial = [...board.cells];
    expect(analyzePuzzleBoard(board).solvable).toBe(true);
    const result = placePuzzleTile(board, 13, locked);
    expect(result.status).toBe("blocked");
    expect(result.stats.expandedStates).toBe(result.stats.discoveredStates);
    expect(board.cells).toEqual(initial);
    expect("moves" in result).toBe(false);
  });

  test("no-ops solved targets, extends immutable locks and preserves the input", () => {
    const board = createPuzzleGoal(4);
    const locks = [1, 0];
    const result = verifyPlacement(board, locks, [3, 4], placePuzzleRowEnd(board, 0, locks));
    expect(result.board).toBe(board);
    expect(result.moves).toHaveLength(0);
    expect(result.stats).toEqual({ expandedStates: 0, discoveredStates: 0, stateCapacity: 0 });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.moves)).toBe(true);
    expect(Object.isFrozen(result.lockedIndices)).toBe(true);
    expect(Object.isFrozen(result.stats)).toBe(true);
    expect(locks).toEqual([1, 0]);
    verifyPlacement(board, [2], [3], placePuzzleTile(board, 3, [2]));
  });

  test("rejects invalid IDs, terminal lines, bad locks and locks on misplaced tiles", () => {
    const board = createPuzzleGoal(4);
    for (const id of [0, -1, 16, 2.5, NaN, Infinity]) expect(() => placePuzzleTile(board, id)).toThrow(PuzzlePlacementError);
    for (const line of [-1, 3, 4, 1.5, NaN, Infinity]) {
      expect(() => placePuzzleRowEnd(board, line)).toThrow("invalidLine");
      expect(() => placePuzzleColumnEnd(board, line)).toThrow("invalidLine");
    }
    for (const locks of [[0, 0], [-1], [15], [16], [0.5], [NaN]]) {
      expect(() => placePuzzleTile(board, 3, locks)).toThrow("invalidLocks");
    }
    const displaced = createPuzzleBoard(3, [5, 4, 3, 0, 8, 2, 6, 7, 1]);
    expect(() => placePuzzleTile(displaced, 1, [0])).toThrow("lockedTileMismatch");
  });

  test("matches independent full-state BFS for both single and paired partial goals", () => {
    const starts = [
      createPuzzleBoard(3, [5, 4, 3, 0, 8, 2, 6, 7, 1]),
      createPuzzleBoard(3, [8, 6, 7, 2, 5, 4, 3, 0, 1]),
      scramble(3, [0], 43),
    ];
    for (const board of starts) {
      const locks = board.cells[0] === 1 ? [0] : [];
      const cases = [
        { ids: [2], result: placePuzzleTile(board, 2, locks) },
        { ids: [2, 3], result: placePuzzleRowEnd(board, 0, locks) },
        { ids: [4, 7], result: placePuzzleColumnEnd(board, 0, locks) },
      ];
      for (const { ids, result } of cases) {
        const expected = referenceDistance(board, locks, ids);
        expect(expected).not.toBeNull();
        const placed = verifyPlacement(board, locks, ids, result);
        expect(placed.moves.length).toBe(expected!);
      }
    }
    const trapped = createPuzzleBoard(3, [1, 2, 6, 4, 5, 8, 7, 3, 0]);
    expect(referenceDistance(trapped, [0, 1], [2, 3])).toBeNull();
    expect(placePuzzleRowEnd(trapped, 0, [0, 1]).status).toBe("blocked");
  });
});

import { describe, expect, test } from "bun:test";
import { minimumPuzzleAssignment } from "../src/lib/sliding-puzzle/assignment";

function brute(costs: number[][], blocked?: { row: number; column: number }): number | null {
  let best = Infinity;
  const visit = (row: number, used: Set<number>, sum: number) => {
    if (row === costs.length) { best = Math.min(best, sum); return; }
    for (let column = 0; column < costs.length; column++) if (!used.has(column) && !(blocked?.row === row && blocked.column === column)) {
      used.add(column); visit(row + 1, used, sum + costs[row]![column]!); used.delete(column);
    }
  };
  visit(0, new Set(), 0);
  return Number.isFinite(best) ? best : null;
}

describe("global puzzle assignment", () => {
  test("beats duplicate local winners and greedy row-by-row choices", () => {
    const costs = [[0, 0.1, 9], [0.01, 8, 9], [9, 9, 0]];
    const result = minimumPuzzleAssignment(costs)!;
    expect(result.columns).toEqual([1, 0, 2]);
    expect(result.cost).toBeCloseTo(0.11, 12);
    expect(new Set(result.columns).size).toBe(3);
    expect(costs[0]).toEqual([0, 0.1, 9]);
  });
  test("matches an independent exhaustive oracle, including forbidden edges and negative costs", () => {
    let seed = 531;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed; };
    for (let size = 1; size <= 7; size++) for (let sample = 0; sample < 10; sample++) {
      const costs = Array.from({ length: size }, () => Array.from({ length: size }, () => (random() % 1000 - 300) / 127));
      const result = minimumPuzzleAssignment(costs)!;
      expect(result.cost).toBeCloseTo(brute(costs)!, 10);
      expect(new Set(result.columns).size).toBe(size);
      const blocked = { row: random() % size, column: random() % size };
      const expected = brute(costs, blocked), alternative = minimumPuzzleAssignment(costs, blocked);
      if (expected === null) expect(alternative).toBeNull();
      else { expect(alternative!.cost).toBeCloseTo(expected, 10); expect(alternative!.columns[blocked.row]).not.toBe(blocked.column); }
    }
  });
  test("keeps tie results deterministic and supports all 64 columns", () => {
    const tied = Array.from({ length: 9 }, () => Array(9).fill(1));
    expect(minimumPuzzleAssignment(tied)).toEqual(minimumPuzzleAssignment(tied));
    const costs = Array.from({ length: 64 }, (_, row) => Array.from({ length: 64 }, (_, column) => column === (row * 17 + 3) % 64 ? 0 : 1));
    const result = minimumPuzzleAssignment(costs)!;
    expect(result.cost).toBe(0);
    expect(result.columns).toEqual(Array.from({ length: 64 }, (_, row) => (row * 17 + 3) % 64));
    expect(Object.isFrozen(result.columns)).toBe(true);
    expect(minimumPuzzleAssignment(costs, { row: 0, column: 3 })!.cost).toBe(2);
  });
  test("rejects malformed, sparse, non-finite and unbounded matrices", () => {
    for (const value of [[], [[1, 2]], [[NaN]], [[Infinity]], [[1e308]], Array(3), [[1, , 3], [2, 3, 4], [1, 2, 3]], Array.from({ length: 65 }, () => Array(65).fill(0))]) {
      expect(() => minimumPuzzleAssignment(value as number[][])).toThrow(RangeError);
    }
    expect(() => minimumPuzzleAssignment([[0]], { row: 1, column: 0 })).toThrow(RangeError);
    expect(minimumPuzzleAssignment([[0]], { row: 0, column: 0 })).toBeNull();
  });
});

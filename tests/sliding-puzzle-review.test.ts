import { describe, expect, test } from "bun:test";
import { inspectPuzzleReview } from "../src/lib/sliding-puzzle/review";
import { createPuzzleGoal, PUZZLE_SIZES } from "../src/lib/sliding-puzzle/model";

describe("puzzle review approval", () => {
  test("requires explicit acknowledgement even when every recognized ID is complete", () => {
    for (const size of PUZZLE_SIZES) {
      const cells = createPuzzleGoal(size).cells;
      expect(inspectPuzzleReview(size, cells, false)).toEqual({ status: "unchecked" });
      const approved = inspectPuzzleReview(size, cells, true);
      expect(approved.status).toBe("ready");
      if (approved.status !== "ready") throw new Error("Expected reviewed board");
      expect(approved.board.cells).toEqual(cells);
      expect(Object.isFrozen(approved.board.cells)).toBe(true);
    }
  });

  test("never converts unknown image fragments into the blank, even after acknowledgement", () => {
    const cells = [1, 2, null, 4, 5, 6, null, 8, 0];
    expect(inspectPuzzleReview(3, cells, false)).toEqual({ status: "unknown", count: 2 });
    expect(inspectPuzzleReview(3, cells, true)).toEqual({ status: "unknown", count: 2 });
    expect(cells).toEqual([1, 2, null, 4, 5, 6, null, 8, 0]);
  });

  test("blocks duplicate IDs, missing blank, out-of-range IDs and incomplete boards", () => {
    for (const cells of [[1, 2, 3, 4, 5, 6, 7, 7, 0], [1, 2, 3, 4, 5, 6, 7, 8, 8],
      [1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3]]) {
      expect(inspectPuzzleReview(3, cells, true).status).toBe("invalid");
    }
  });

  test("blocks opposite parity without changing the supplied IDs and snapshots approved edits", () => {
    const cells = [2, 1, 3, 4, 5, 6, 7, 8, 0];
    expect(inspectPuzzleReview(3, cells, true)).toEqual({ status: "unsolvable" });
    expect(cells).toEqual([2, 1, 3, 4, 5, 6, 7, 8, 0]);
    [cells[0], cells[1]] = [cells[1]!, cells[0]!];
    const approved = inspectPuzzleReview(3, cells, true);
    if (approved.status !== "ready") throw new Error("Expected corrected board");
    cells[0] = 8;
    expect(approved.board.cells).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 0]);
    expect(inspectPuzzleReview(3, approved.board.cells, false).status).toBe("unchecked");
  });
});

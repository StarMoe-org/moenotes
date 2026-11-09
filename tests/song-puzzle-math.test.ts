import { describe, expect, test } from "bun:test";
import {
  findBlankPosition,
  getBoardAtStep,
  getTileBackgroundPosition,
  getTileImageCoords,
  getTilePositionsMap,
  isBoardEqual,
  isPuzzleSolved,
} from "../src/lib/song-puzzle/math";
import type { SlidePuzzleSolution } from "../src/lib/song-puzzle/types";

describe("song-puzzle math and coordinate transforms", () => {
  test("translates tile index to screen image row and col correctly for 3x3", () => {
    // 3x3: v = y * 3 + x, origin bottom-left (y up), screen origin top-left (row down)
    // v = 0 -> x=0, y=0 -> row=2, col=0 (bottom-left tile)
    expect(getTileImageCoords(0, 3)).toEqual({ row: 2, col: 0 });
    // v = 1 -> x=1, y=0 -> row=2, col=1
    expect(getTileImageCoords(1, 3)).toEqual({ row: 2, col: 1 });
    // v = 3 -> x=0, y=1 -> row=1, col=0
    expect(getTileImageCoords(3, 3)).toEqual({ row: 1, col: 0 });
    // v = 6 -> x=0, y=2 -> row=0, col=0 (top-left tile)
    expect(getTileImageCoords(6, 3)).toEqual({ row: 0, col: 0 });
    // v = 8 -> x=2, y=2 -> row=0, col=2 (top-right tile)
    expect(getTileImageCoords(8, 3)).toEqual({ row: 0, col: 2 });
    // blank slot
    expect(getTileImageCoords(-1, 3)).toEqual({ row: -1, col: -1 });
  });

  test("computes accurate CSS background-position percentages", () => {
    // 3x3 grid:
    // v = 6 (top-left): col=0, row=0 -> 0% 0%
    expect(getTileBackgroundPosition(6, 3).css).toBe("0.0000% 0.0000%");
    // v = 8 (top-right): col=2, row=0 -> 100% 0%
    expect(getTileBackgroundPosition(8, 3).css).toBe("100.0000% 0.0000%");
    // v = 0 (bottom-left): col=0, row=2 -> 0% 100%
    expect(getTileBackgroundPosition(0, 3).css).toBe("0.0000% 100.0000%");
    // v = 4 (center): col=1, row=1 -> 50% 50%
    expect(getTileBackgroundPosition(4, 3).css).toBe("50.0000% 50.0000%");
  });

  test("correctly checks solved state and step boards", () => {
    const fixtureSolution: SlidePuzzleSolution = {
      meta: {
        type: "meta",
        schema: 1,
        musicId: 100001,
        grid: 3,
        jacket: "jkt_001_100001",
        initial: [
          [3, 8, 7],
          [-1, 4, 6],
          [0, 5, 1],
        ],
        goal: [
          [6, 7, 8],
          [3, 4, 5],
          [0, 1, -1],
        ],
        solutionLength: 2,
        solver: "exact-astar",
        quality: "optimal",
        elapsedMs: 0,
      },
      steps: [
        {
          type: "step",
          index: 1,
          move: "D",
          tile: 0,
          from: [2, 0],
          to: [1, 0],
          board: [
            [3, 8, 7],
            [0, 4, 6],
            [-1, 5, 1],
          ],
        },
        {
          type: "step",
          index: 2,
          move: "R",
          tile: 5,
          from: [2, 1],
          to: [2, 0],
          board: [
            [6, 7, 8],
            [3, 4, 5],
            [0, 1, -1],
          ],
        },
      ],
    };

    // Step 0 is initial
    const step0 = getBoardAtStep(fixtureSolution, 0);
    expect(step0).toEqual(fixtureSolution.meta.initial);
    expect(isPuzzleSolved(step0, fixtureSolution.meta.goal)).toBe(false);

    // Step 1
    const step1 = getBoardAtStep(fixtureSolution, 1);
    expect(step1).toEqual(fixtureSolution.steps[0]!.board);
    expect(isPuzzleSolved(step1, fixtureSolution.meta.goal)).toBe(false);

    // Step 2 is goal
    const step2 = getBoardAtStep(fixtureSolution, 2);
    expect(step2).toEqual(fixtureSolution.meta.goal);
    expect(isPuzzleSolved(step2, fixtureSolution.meta.goal)).toBe(true);

    // Blank position lookup
    expect(findBlankPosition(step0)).toEqual({ row: 1, col: 0 });
    expect(findBlankPosition(step1)).toEqual({ row: 2, col: 0 });
    expect(findBlankPosition(step2)).toEqual({ row: 2, col: 2 });

    // Tile map test
    const map = getTilePositionsMap(step1);
    expect(map.get(0)).toEqual({ row: 1, col: 0 });
    expect(map.get(3)).toEqual({ row: 0, col: 0 });
    expect(map.has(-1)).toBe(false);
  });
});

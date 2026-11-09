import { describe, expect, test } from "bun:test";
import { getTileDirection, getTileDisplayNumber } from "../src/lib/song-puzzle/math";
import type { SlidePuzzleStep } from "../src/lib/song-puzzle/types";

describe("PuzzleStepList direction calculations", () => {
  test("accurately determines movement direction from tile [from] to [to]", () => {
    // Tile moved from [2, 0] to [1, 0] -> dr = -1 -> Up
    const stepUp: SlidePuzzleStep = {
      type: "step",
      index: 1,
      move: "D", // blank slot moves down
      tile: 0,
      from: [2, 0],
      to: [1, 0],
      board: [],
    };
    expect(getTileDirection(stepUp)).toEqual({
      arrow: "↑",
      dirKey: "songPuzzle.dirUp",
      dir: "up",
    });

    // Tile moved from [0, 1] to [1, 1] -> dr = 1 -> Down
    const stepDown: SlidePuzzleStep = {
      type: "step",
      index: 2,
      move: "U", // blank slot moves up
      tile: 4,
      from: [0, 1],
      to: [1, 1],
      board: [],
    };
    expect(getTileDirection(stepDown)).toEqual({
      arrow: "↓",
      dirKey: "songPuzzle.dirDown",
      dir: "down",
    });

    // Tile moved from [1, 2] to [1, 1] -> dc = -1 -> Left
    const stepLeft: SlidePuzzleStep = {
      type: "step",
      index: 3,
      move: "R", // blank slot moves right
      tile: 2,
      from: [1, 2],
      to: [1, 1],
      board: [],
    };
    expect(getTileDirection(stepLeft)).toEqual({
      arrow: "←",
      dirKey: "songPuzzle.dirLeft",
      dir: "left",
    });

    // Tile moved from [1, 0] to [1, 1] -> dc = 1 -> Right
    const stepRight: SlidePuzzleStep = {
      type: "step",
      index: 4,
      move: "L", // blank slot moves left
      tile: 3,
      from: [1, 0],
      to: [1, 1],
      board: [],
    };
    expect(getTileDirection(stepRight)).toEqual({
      arrow: "→",
      dirKey: "songPuzzle.dirRight",
      dir: "right",
    });
  });

  test("calculates intuitive 1-indexed screen reading order numbers for tiles", () => {
    // 3x3 grid:
    // v = 6 (target top-left: row 0, col 0) -> screen reading number = 1
    expect(getTileDisplayNumber(6, 3)).toBe(1);
    // v = 7 (target top-center: row 0, col 1) -> screen reading number = 2
    expect(getTileDisplayNumber(7, 3)).toBe(2);
    // v = 8 (target top-right: row 0, col 2) -> screen reading number = 3
    expect(getTileDisplayNumber(8, 3)).toBe(3);
    // v = 3 (target mid-left: row 1, col 0) -> screen reading number = 4
    expect(getTileDisplayNumber(3, 3)).toBe(4);
    // v = 4 (target center: row 1, col 1) -> screen reading number = 5
    expect(getTileDisplayNumber(4, 3)).toBe(5);
    // v = 5 (target mid-right: row 1, col 2) -> screen reading number = 6
    expect(getTileDisplayNumber(5, 3)).toBe(6);
    // v = 0 (target bot-left: row 2, col 0) -> screen reading number = 7
    expect(getTileDisplayNumber(0, 3)).toBe(7);
    // v = 1 (target bot-center: row 2, col 1) -> screen reading number = 8
    expect(getTileDisplayNumber(1, 3)).toBe(8);
    // v = -1 (blank) -> 0
    expect(getTileDisplayNumber(-1, 3)).toBe(0);
  });
});

import { describe, expect, test } from "bun:test";
import type { SlidePuzzleStep } from "../src/lib/song-puzzle/types";

function getTileDirection(step: SlidePuzzleStep): { arrow: string; dir: "up" | "down" | "left" | "right" } {
  const dr = step.to[0] - step.from[0];
  const dc = step.to[1] - step.from[1];

  if (dr < 0) return { arrow: "↑", dir: "up" };
  if (dr > 0) return { arrow: "↓", dir: "down" };
  if (dc < 0) return { arrow: "←", dir: "left" };
  return { arrow: "→", dir: "right" };
}

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
    expect(getTileDirection(stepUp)).toEqual({ arrow: "↑", dir: "up" });

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
    expect(getTileDirection(stepDown)).toEqual({ arrow: "↓", dir: "down" });

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
    expect(getTileDirection(stepLeft)).toEqual({ arrow: "←", dir: "left" });

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
    expect(getTileDirection(stepRight)).toEqual({ arrow: "→", dir: "right" });
  });
});

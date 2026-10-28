import { describe, expect, test } from "bun:test";
import { confirmPuzzleObservation, puzzleCropFields } from "../src/lib/sliding-puzzle/crop";
import { suggestPuzzleRegions } from "../src/lib/sliding-puzzle/detection";
import { matchPuzzleFragments } from "../src/lib/sliding-puzzle/matching";
import {
  applyPuzzleMove, createPuzzleBoard, createPuzzleGoal, parsePuzzleBoard,
} from "../src/lib/sliding-puzzle/model";
import type { PixelRect } from "../src/lib/sliding-puzzle/sampling";
import { solvePuzzle } from "../src/lib/sliding-puzzle/solver";
import type { PuzzleSize } from "../src/lib/sliding-puzzle/model";

const ARTWORK = 768, PAGE_WIDTH = 900, PAGE_HEIGHT = 700;
const BOARD: PixelRect = Object.freeze({ x: 90, y: 50, width: 640, height: 640 });

const hue = (id: number) => (id * 137.508) % 360;
function paint(id: number): readonly [number, number, number] {
  const h = hue(id) / 60, sector = Math.floor(h) % 6, fraction = h - Math.floor(h);
  const x = 0.62 * (1 - Math.abs(2 * 0.5 - 1)), y = x * (1 - fraction), z = x * fraction;
  const [r, g, b] = [[x, z, 0], [y, x, 0], [0, x, z], [0, y, x], [z, 0, x], [x, 0, y]][sector]!;
  return [Math.round((r + 0.5) * 178 + 38), Math.round((g + 0.5) * 178 + 38), Math.round((b + 0.5) * 178 + 38)];
}
/** Smooth, tile-unique texture keeps cross-tile correlation low without relying on printed labels. */
function texture(id: number, u: number, v: number): readonly [number, number, number] {
  const base = paint(id), fx = 1 + id % 3, fy = 1 + Math.floor(id / 3) % 3, phase = (id * 0.37) % 1;
  const wave = 0.22 * Math.sin(Math.PI * 2 * (fx * u + fy * v + phase)) + 0.1 * Math.cos(Math.PI * 2 * ((id % 4) + 1) * (u - v));
  const channel = (value: number) => Math.max(0, Math.min(255, Math.round(value * (1 + wave))));
  return [channel(base[0]), channel(base[1]), channel(base[2])];
}
function artworkImage(size: PuzzleSize) {
  const rgba = new Uint8Array(ARTWORK * ARTWORK * 4), cell = ARTWORK / size;
  for (let y = 0; y < ARTWORK; y++) for (let x = 0; x < ARTWORK; x++) {
    const column = Math.min(size - 1, Math.floor(x / cell)), row = Math.min(size - 1, Math.floor(y / cell));
    const id = row * size + column, color = texture(id, (x - column * cell) / cell, (y - row * cell) / cell);
    const offset = (y * ARTWORK + x) * 4;
    rgba[offset] = color[0]; rgba[offset + 1] = color[1]; rgba[offset + 2] = color[2]; rgba[offset + 3] = 255;
  }
  return { width: ARTWORK, height: ARTWORK, rgba };
}
function screenshotImage(size: PuzzleSize, cells: readonly number[], artwork: { width: number; height: number; rgba: Uint8Array }) {
  const rgba = new Uint8Array(PAGE_WIDTH * PAGE_HEIGHT * 4), cell = BOARD.width / size;
  let random = 987654321;
  for (let y = 0; y < PAGE_HEIGHT; y++) for (let x = 0; x < PAGE_WIDTH; x++) {
    random = (Math.imul(random, 1664525) + 1013904223) >>> 0;
    const offset = (y * PAGE_WIDTH + x) * 4, shade = 30 + random % 16;
    rgba[offset] = shade; rgba[offset + 1] = shade + 8; rgba[offset + 2] = shade + 22; rgba[offset + 3] = 255;
  }
  for (let index = 0; index < cells.length; index++) {
    const id = cells[index]!, row = Math.floor(index / size), column = index % size;
    const left = BOARD.x + Math.round(column * cell), top = BOARD.y + Math.round(row * cell);
    const right = BOARD.x + Math.round((column + 1) * cell), bottom = BOARD.y + Math.round((row + 1) * cell);
    for (let y = top; y < bottom; y++) for (let x = left; x < right; x++) {
      const offset = (y * PAGE_WIDTH + x) * 4;
      if (id === 0) { rgba[offset] = 30; rgba[offset + 1] = 31; rgba[offset + 2] = 42; rgba[offset + 3] = 255; continue; }
      const artCell = artwork.width / size, artColumn = (id - 1) % size, artRow = Math.floor((id - 1) / size);
      const u = (x - left + 0.5) / (right - left), v = (y - top + 0.5) / (bottom - top);
      const sx = Math.min(artwork.width - 1, Math.floor(artColumn * artCell + u * artCell)), sy = Math.min(artwork.height - 1, Math.floor(artRow * artCell + v * artCell));
      const source = (sy * artwork.width + sx) * 4;
      rgba[offset] = artwork.rgba[source]!; rgba[offset + 1] = artwork.rgba[source + 1]!; rgba[offset + 2] = artwork.rgba[source + 2]!; rgba[offset + 3] = 255;
    }
    for (const [sx, sy, ex, ey] of [[left, top, right, top + 2], [left, bottom - 2, right, bottom], [left, top, left + 2, bottom], [right - 2, top, right, bottom]] as const) {
      for (let y = Math.max(0, sy); y < Math.min(PAGE_HEIGHT, ey); y++) for (let x = Math.max(0, sx); x < Math.min(PAGE_WIDTH, ex); x++) {
        const offset = (y * PAGE_WIDTH + x) * 4; rgba[offset] = 12; rgba[offset + 1] = 13; rgba[offset + 2] = 20;
      }
    }
  }
  return { width: PAGE_WIDTH, height: PAGE_HEIGHT, rgba };
}
function scramble(size: PuzzleSize, steps: number, seed: number): number[] {
  const cells = [...createPuzzleGoal(size).cells];
  let blank = cells.length - 1, previous = -1;
  for (let step = 0; step < steps; step++) {
    const choices = cells.flatMap((_, index) => index !== previous
      && Math.abs(index % size - blank % size) + Math.abs(Math.floor(index / size) - Math.floor(blank / size)) === 1 ? [index] : []);
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const source = choices[seed % choices.length]!;
    cells[blank] = cells[source]!; cells[source] = 0; previous = blank; blank = source;
  }
  return cells;
}
function overlap(a: PixelRect, b: PixelRect): number {
  const width = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const height = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  const intersection = width * height;
  return intersection / (a.width * a.height + b.width * b.height - intersection);
}
function replay(cells: readonly number[], size: PuzzleSize, moves: readonly { tileId: number; fromIndex: number; toIndex: number }[]) {
  let board = createPuzzleBoard(size, cells);
  for (const move of moves) board = applyPuzzleMove(board, move);
  return board;
}

function fullChain(size: PuzzleSize, cells: readonly number[]) {
  const artwork = artworkImage(size), screenshot = screenshotImage(size, cells, artwork);
  const best = suggestPuzzleRegions(screenshot, size, artwork).candidates[0];
  if (!best) throw new Error(`${size}x${size}: no board region`);
  const truthIoU = overlap(best.crop, BOARD);
  const observation = confirmPuzzleObservation("chain-screenshot", size, screenshot, puzzleCropFields(best.crop), null);
  const match = matchPuzzleFragments({ artworkSourceId: "chain-artwork", artwork, screenshot, observation });
  expect(match.reviewRequired).toBe(true);
  expect(match.cells.flatMap(cell => cell.draftTileId !== null && cell.draftTileId !== cells[cell.index] ? [cell.index] : [])).toEqual([]);
  if (!match.complete) throw new Error(`${size}x${size}: matching left ${match.draftCells.filter(tile => tile === null).length} cells unassigned`);
  expect(match.blank.status).toBe("inferred");
  const parsed = parsePuzzleBoard(size, match.draftCells);
  if (!parsed.ok) throw new Error(`${size}x${size}: reviewed draft is invalid`);
  const started = performance.now(), result = solvePuzzle(parsed.board), solveMs = performance.now() - started;
  expect(result.status).toBe("solved");
  if (result.status !== "solved") throw new Error("Expected solution");
  expect(replay(parsed.board.cells, size, result.moves).cells).toEqual(createPuzzleGoal(size).cells);
  return { truthIoU, steps: result.steps, method: result.method, optimal: result.optimal, solveMs, stats: result.stats };
}

describe("puzzle full chain", () => {
  test("detects, matches and solves every board size from shipped artwork", () => {
    const measurements: string[] = [];
    for (const size of [3, 4, 5, 6, 7, 8] as const) {
      const seed = size * 7919;
      for (const [kind, cells] of [["shuffled", scramble(size, 300, seed)], ["oneMove", (() => { const goal = [...createPuzzleGoal(size).cells]; const blank = goal.length - 1; [goal[blank - 1], goal[blank]] = [goal[blank]!, goal[blank - 1]!]; return goal; })()]] as const) {
        const result = fullChain(size, cells);
        expect(result.truthIoU).toBeGreaterThan(0.9);
        expect(result.steps).toBeGreaterThan(0);
        if (kind === "oneMove") expect(result.steps).toBe(1);
        measurements.push(`${size}x${size}:${kind} seed=${kind === "shuffled" ? seed : 0} steps=${result.steps} solver=${result.solveMs.toFixed(1)}ms expanded=${result.stats.expandedStates} capacity=${result.stats.peakStateCapacity}`);
      }
    }
    console.log(`P6 chain ${measurements.join(" | ")}`);
  }, 120000);

  test("4x4 construction paths are legal and never shorter than independent BFS", () => {
    const size = 4 as const, goal = createPuzzleGoal(size).cells, goalKey = goal.join(",");
    const distance = new Map<string, number>([[goalKey, 0]]);
    let frontier = [goalKey];
    for (let depth = 1; depth <= 4; depth++) {
      const next: string[] = [];
      for (const key of frontier) {
        const cells = key.split(",").map(Number), blank = cells.indexOf(0);
        for (let source = 0; source < cells.length; source++) {
          if (Math.abs(source % size - blank % size) + Math.abs(Math.floor(source / size) - Math.floor(blank / size)) !== 1) continue;
          const moved = [...cells]; [moved[source], moved[blank]] = [moved[blank]!, moved[source]!];
          const movedKey = moved.join(",");
          if (!distance.has(movedKey)) { distance.set(movedKey, depth); next.push(movedKey); }
        }
      }
      frontier = next;
    }
    const observed: string[] = [];
    for (const depth of [1, 2, 3, 4]) {
      const states = [...distance.entries()].filter(([, value]) => value === depth).slice(0, 4);
      expect(states.length).toBeGreaterThan(0);
      for (const [key, optimal] of states) {
        const cells = key.split(",").map(Number), result = solvePuzzle(createPuzzleBoard(size, cells));
        expect(result.status).toBe("solved");
        if (result.status !== "solved") throw new Error("Expected solution");
        expect(result.steps).toBeGreaterThanOrEqual(optimal);
        expect(replay(cells, size, result.moves).cells).toEqual(goal);
        observed.push(`depth${optimal}->${result.steps}`);
      }
    }
    console.log(`P6 4x4 BFS ${observed.join(" ")}`);
  }, 60000);
});

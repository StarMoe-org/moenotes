import { analyzePuzzleBoard, parsePuzzleBoard, type PuzzleBoard, type PuzzleSize, type PuzzleValidationIssue } from "./model";

export type PuzzleReviewState = { readonly status: "unknown"; readonly count: number }
  | { readonly status: "invalid"; readonly issue: PuzzleValidationIssue }
  | { readonly status: "unsolvable" | "unchecked" } | { readonly status: "ready"; readonly board: PuzzleBoard };

/** A complete recognition draft still needs explicit review; parity never repairs the image assignment. */
export function inspectPuzzleReview(size: PuzzleSize, cells: readonly (number | null)[], acknowledged: boolean): PuzzleReviewState {
  const count = cells.filter(cell => cell === null).length;
  if (count) return { status: "unknown", count };
  const parsed = parsePuzzleBoard(size, cells);
  if (!parsed.ok) return { status: "invalid", issue: parsed.issue };
  if (!analyzePuzzleBoard(parsed.board).solvable) return { status: "unsolvable" };
  return acknowledged ? { status: "ready", board: parsed.board } : { status: "unchecked" };
}

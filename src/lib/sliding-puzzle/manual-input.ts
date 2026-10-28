import { parsePuzzleBoard, type PuzzleBoard, type PuzzleSize, type PuzzleValidationIssue } from "./model";

export type PuzzleTextResult = { readonly ok: true; readonly board: PuzzleBoard }
  | { readonly ok: false; readonly issue: PuzzleValidationIssue | { readonly code: "invalidText" } };

/** Manual review accepts decimal IDs separated by whitespace or commas, never numeric coercion of missing cells. */
export function parsePuzzleText(size: PuzzleSize, text: string): PuzzleTextResult {
  if (text.length > 4096 || !/^\s*\d+(?:[\s,，]+\d+)*\s*$/.test(text)) return { ok: false, issue: { code: "invalidText" } };
  return parsePuzzleBoard(size, text.trim().split(/[\s,，]+/).map(Number));
}

export function formatPuzzleBoard(board: PuzzleBoard): string {
  return Array.from({ length: board.size }, (_, row) => board.cells.slice(row * board.size, (row + 1) * board.size).join(" ")).join("\n");
}

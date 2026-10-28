import { minimumPuzzleAssignment } from "./assignment";
import { comparePuzzleFeatures, extractPuzzleFeature, puzzlePixelBytes, type PuzzlePairMeasure, type PuzzlePixelImage } from "./features";
import { confirmPuzzleObservation, puzzleCropFields, type PuzzleObservation } from "./crop";
import { createPuzzleReferenceSamples, type PixelRect } from "./sampling";

export interface PuzzleMatchPolicy {
  readonly maxPairCost: number;
  readonly minRowMargin: number;
  readonly minAssignmentMargin: number;
  readonly minContrast: number;
  readonly minCoverage: number;
  readonly minBlankMargin: number;
  readonly maxBlankContrast: number;
}
/** Conservative review heuristics; these thresholds are not calibrated confidence or a correctness guarantee. */
export const DEFAULT_PUZZLE_MATCH_POLICY: PuzzleMatchPolicy = Object.freeze({
  maxPairCost: 0.22, minRowMargin: 0.025, minAssignmentMargin: 0.02, minContrast: 0.015,
  minCoverage: 0.95, minBlankMargin: 0.04, maxBlankContrast: 0.05,
});
export type PuzzleMatchIssue = "weakMatch" | "ambiguousMatch" | "assignmentConflict" | "lowTexture" | "transparent" | "blankUncertain";
export interface PuzzleMatchCandidate extends PuzzlePairMeasure { readonly tileId: number }
export interface PuzzleCellMatch {
  readonly index: number;
  readonly proposedTileId: number;
  readonly draftTileId: number | null;
  readonly assigned: PuzzleMatchCandidate | null;
  readonly candidates: readonly PuzzleMatchCandidate[];
  readonly rowMargin: number | null;
  readonly assignmentMargin: number;
  readonly issues: readonly PuzzleMatchIssue[];
}
export interface PuzzleFragmentMatch {
  readonly reviewRequired: true;
  readonly artworkSourceId: string;
  readonly artworkCrop: PixelRect;
  readonly observation: PuzzleObservation;
  readonly policy: PuzzleMatchPolicy;
  readonly assignmentCost: number;
  readonly blank: { readonly index: number | null; readonly proposedIndex: number; readonly status: "provided" | "inferred" | "uncertain"; readonly assignmentMargin: number | null };
  readonly cells: readonly PuzzleCellMatch[];
  readonly draftCells: readonly (number | null)[];
  readonly complete: boolean;
}

export interface PuzzleFragmentMatchInput {
  readonly artworkSourceId: string;
  readonly artwork: PuzzlePixelImage;
  readonly screenshot: PuzzlePixelImage;
  readonly observation: PuzzleObservation;
  readonly artworkCrop?: PixelRect;
  readonly policy?: Partial<PuzzleMatchPolicy>;
}

/** Pure pixel matching: caller must bind the reviewed result before handing a numeric board to a solver. */
export function matchPuzzleFragments(input: PuzzleFragmentMatchInput): PuzzleFragmentMatch {
  if (typeof input.artworkSourceId !== "string" || !input.artworkSourceId || input.artworkSourceId.length > 1024) throw new RangeError("Invalid puzzle artwork binding");
  puzzlePixelBytes(input.artwork); puzzlePixelBytes(input.screenshot);
  const source = input.observation;
  if (typeof source.sourceId !== "string") throw new RangeError("Invalid puzzle screenshot binding");
  if (source.image.width !== input.screenshot.width || source.image.height !== input.screenshot.height) throw new RangeError("Puzzle screenshot dimensions changed");
  // Recompute the grid after transport rather than trusting caller-provided rectangles or tile IDs.
  const observation = confirmPuzzleObservation(source.sourceId, source.size, source.image, puzzleCropFields(source.crop), source.blankIndex);
  const policy = Object.freeze({ ...DEFAULT_PUZZLE_MATCH_POLICY, ...input.policy });
  if (Object.values(policy).some(value => typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1)) throw new RangeError("Invalid puzzle match policy");
  const artworkCrop = Object.freeze({ ...(input.artworkCrop ?? { x: 0, y: 0, width: input.artwork.width, height: input.artwork.height }) });
  const samples = createPuzzleReferenceSamples(observation.size, input.artwork, { crop: artworkCrop });
  const reference = samples.map(sample => extractPuzzleFeature(input.artwork, sample.sampleRect));
  const observed = observation.cells.map(cell => extractPuzzleFeature(input.screenshot, cell.sampleRect));
  const measures = observed.map(feature => reference.map(target => comparePuzzleFeatures(feature, target)));
  const freeRows = observation.cells.map(cell => cell.index).filter(index => index !== observation.blankIndex);
  const inferBlank = observation.blankIndex === null, blankColumn = samples.length;
  const costs = freeRows.map(index => [...measures[index]!.map(pair => pair.cost), ...(inferBlank ? [0] : [])]);
  const best = minimumPuzzleAssignment(costs);
  if (!best) throw new Error("Puzzle assignment unexpectedly infeasible");
  const margins = freeRows.map((_, row) => {
    const alternative = minimumPuzzleAssignment(costs, { row, column: best.columns[row]! });
    return alternative ? Math.max(0, alternative.cost - best.cost) : Infinity;
  });
  const proposedBlank = inferBlank ? freeRows[best.columns.indexOf(blankColumn)]! : observation.blankIndex!;
  const blankMargin = inferBlank ? margins[freeRows.indexOf(proposedBlank)]! : null;
  const blankAccepted = !inferBlank || (blankMargin! > Math.max(1e-9, policy.minBlankMargin)
    && observed[proposedBlank]!.contrast <= policy.maxBlankContrast && observed[proposedBlank]!.coverage >= policy.minCoverage);
  const cells = observation.cells.map((cell): PuzzleCellMatch => {
    const index = cell.index, row = freeRows.indexOf(index);
    const isBlank = index === proposedBlank;
    const proposedTileId = isBlank ? 0 : best.columns[row]! + 1;
    const candidates = measures[index]!.map((pair, column) => Object.freeze({ tileId: column + 1, ...pair }))
      .sort((a, b) => a.cost - b.cost || a.tileId - b.tileId);
    const assigned = isBlank ? null : candidates.find(candidate => candidate.tileId === proposedTileId)!;
    const rowMargin = assigned ? candidates.find(candidate => candidate.tileId !== proposedTileId)!.cost - assigned.cost : null;
    const assignmentMargin = row === -1 ? 0 : margins[row]!;
    const issues: PuzzleMatchIssue[] = [];
    if (isBlank) { if (!blankAccepted) issues.push("blankUncertain"); }
    else {
      if (assigned!.cost > policy.maxPairCost) issues.push("weakMatch");
      if (rowMargin! <= Math.max(1e-9, policy.minRowMargin) || assignmentMargin <= Math.max(1e-9, policy.minAssignmentMargin)) issues.push("ambiguousMatch");
      if (rowMargin! < -1e-9) issues.push("assignmentConflict");
      if (Math.min(observed[index]!.contrast, reference[proposedTileId - 1]!.contrast) < policy.minContrast) issues.push("lowTexture");
      if (Math.min(observed[index]!.coverage, reference[proposedTileId - 1]!.coverage) < policy.minCoverage) issues.push("transparent");
    }
    return Object.freeze({ index, proposedTileId, draftTileId: issues.length ? null : proposedTileId, assigned,
      candidates: Object.freeze(candidates.slice(0, 3)), rowMargin, assignmentMargin, issues: Object.freeze(issues) });
  });
  const draftCells = Object.freeze(cells.map(cell => cell.draftTileId));
  return Object.freeze({ reviewRequired: true, artworkSourceId: input.artworkSourceId, artworkCrop, observation, policy,
    assignmentCost: best.cost, blank: Object.freeze({ index: blankAccepted ? proposedBlank : null, proposedIndex: proposedBlank,
      status: inferBlank ? blankAccepted ? "inferred" : "uncertain" : "provided", assignmentMargin: blankMargin }),
    cells: Object.freeze(cells), draftCells, complete: draftCells.every(tile => tile !== null) });
}

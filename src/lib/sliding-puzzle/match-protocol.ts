import { confirmPuzzleObservation, puzzleCropFields, type PuzzleObservation } from "./crop";
import { puzzlePixelBytes, type PuzzlePixelImage } from "./features";
import { DEFAULT_PUZZLE_MATCH_POLICY, type PuzzleCellMatch, type PuzzleFragmentMatch, type PuzzleFragmentMatchInput, type PuzzleMatchCandidate, type PuzzleMatchIssue, type PuzzleMatchPolicy } from "./matching";
import { createPuzzleReferenceSamples, type PixelRect, type PixelSize } from "./sampling";
import { isPuzzleRecord, parsePuzzleBinding, PUZZLE_WORKER_PROTOCOL, PuzzleProtocolError, samePuzzleBinding, validPuzzleBudget, type PuzzleTaskBinding, type PuzzleWorkerFailureCode } from "./worker-protocol";

export type PuzzleMatchWorkerResult = { readonly status: "review"; readonly match: PuzzleFragmentMatch } | { readonly status: "invalid" }
  | { readonly status: "failed"; readonly code: PuzzleWorkerFailureCode } | { readonly status: "timeLimit" };
export interface PuzzleMatchContext {
  readonly artworkSourceId: string; readonly artwork: PixelSize; readonly artworkCrop: PixelRect;
  readonly observation: PuzzleObservation; readonly policy: PuzzleMatchPolicy;
}
export interface PuzzleMatchRequest {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL; readonly type: "match"; readonly requestId: number;
  readonly binding: PuzzleTaskBinding; readonly input: PuzzleFragmentMatchInput; readonly timeLimitMs: number;
}
export interface PuzzleMatchReply {
  readonly protocol: typeof PUZZLE_WORKER_PROTOCOL; readonly type: "matchResult"; readonly requestId: number;
  readonly binding: PuzzleTaskBinding; readonly result: PuzzleMatchWorkerResult;
}

/** Snapshot metadata and copy only owned pixel views. Only these copies may be transferred to a Worker. */
export function preparePuzzleMatch(input: PuzzleFragmentMatchInput, copyPixels = true): { context: PuzzleMatchContext; input: PuzzleFragmentMatchInput; transfer: Transferable[] } {
  if (typeof input.artworkSourceId !== "string" || !input.artworkSourceId || input.artworkSourceId.length > 1024) throw new RangeError("Invalid artwork source");
  const source = input.observation;
  if (typeof source.sourceId !== "string" || source.image.width !== input.screenshot.width || source.image.height !== input.screenshot.height) throw new RangeError("Invalid screenshot source");
  const observation = confirmPuzzleObservation(source.sourceId, source.size, source.image, puzzleCropFields(source.crop), source.blankIndex);
  const artworkCrop = Object.freeze({ ...(input.artworkCrop ?? { x: 0, y: 0, width: input.artwork.width, height: input.artwork.height }) });
  createPuzzleReferenceSamples(observation.size, input.artwork, { crop: artworkCrop });
  const policy = Object.freeze(Object.fromEntries(Object.keys(DEFAULT_PUZZLE_MATCH_POLICY).map(key => {
    const value = input.policy?.[key as keyof PuzzleMatchPolicy] ?? DEFAULT_PUZZLE_MATCH_POLICY[key as keyof PuzzleMatchPolicy];
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new RangeError("Invalid matching policy");
    return [key, value];
  })) as unknown as PuzzleMatchPolicy);
  const pixels = (image: PuzzlePixelImage) => Object.freeze({ width: image.width, height: image.height, rgba: copyPixels ? puzzlePixelBytes(image).slice().buffer : puzzlePixelBytes(image) });
  const artwork = pixels(input.artwork), screenshot = pixels(input.screenshot);
  const context = Object.freeze({ artworkSourceId: input.artworkSourceId, artwork: Object.freeze({ width: artwork.width, height: artwork.height }), artworkCrop, observation, policy });
  return { context, input: Object.freeze({ artworkSourceId: input.artworkSourceId, artwork, screenshot, artworkCrop, observation, policy }),
    transfer: copyPixels ? [artwork.rgba as ArrayBuffer, screenshot.rgba as ArrayBuffer] : [] };
}

export function readPuzzleMatchRequest(value: unknown): PuzzleMatchRequest | null {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "match" || !Number.isSafeInteger(value.requestId)
    || (value.requestId as number) <= 0 || !validPuzzleBudget(value.timeLimitMs) || !isPuzzleRecord(value.input)) return null;
  const binding = parsePuzzleBinding(value.binding);
  if (!binding) return null;
  return { protocol: PUZZLE_WORKER_PROTOCOL, type: "match", requestId: value.requestId as number, binding, input: value.input as unknown as PuzzleFragmentMatchInput, timeLimitMs: value.timeLimitMs };
}

const fail = (): never => { throw new PuzzleProtocolError(); };
const numeric = (value: unknown, min: number, max: number): value is number => typeof value === "number" && Number.isFinite(value) && value >= min - 1e-8 && value <= max + 1e-8;
const id = (value: unknown, max: number): value is number => Number.isInteger(value) && numeric(value, 0, max);
const near = (a: number, b: number) => Math.abs(a - b) < 1e-8;
const sameFields = (value: unknown, expected: object) => isPuzzleRecord(value) && Object.entries(expected).every(([key, part]) => value[key] === part);
function candidate(value: unknown, max: number): PuzzleMatchCandidate {
  if (!isPuzzleRecord(value) || !id(value.tileId, max) || value.tileId === 0 || !numeric(value.cost, 0, 1)
    || !numeric(value.textureCorrelation, -1, 1) || !numeric(value.edgeCorrelation, -1, 1) || !numeric(value.colorDistance, 0, 1)) return fail();
  const expected = 0.75 * (1 - value.textureCorrelation) / 2 + 0.15 * (1 - value.edgeCorrelation) / 2 + 0.1 * value.colorDistance;
  if (!near(value.cost, Math.max(0, Math.min(1, expected)))) return fail();
  return Object.freeze({ tileId: value.tileId, cost: value.cost, textureCorrelation: value.textureCorrelation, edgeCorrelation: value.edgeCorrelation, colorDistance: value.colorDistance });
}

/** Receiving-realm validation is bounded to the small result; it never extracts features or runs an assignment. */
export function validatePuzzleMatchReply(value: unknown, requestId: number, binding: PuzzleTaskBinding, context: PuzzleMatchContext): PuzzleMatchWorkerResult {
  if (!isPuzzleRecord(value) || value.protocol !== PUZZLE_WORKER_PROTOCOL || value.type !== "matchResult" || value.requestId !== requestId) return fail();
  const received = parsePuzzleBinding(value.binding);
  if (!received || !samePuzzleBinding(received, binding) || !isPuzzleRecord(value.result)) return fail();
  const result = value.result;
  if (result.status === "invalid") return Object.freeze({ status: "invalid" });
  if (result.status === "timeLimit") return Object.freeze({ status: "timeLimit" });
  if (result.status === "failed") {
    if (!["protocol", "worker", "message", "runtime", "scope"].includes(String(result.code))) return fail();
    return Object.freeze({ status: "failed", code: result.code as PuzzleWorkerFailureCode });
  }
  if (result.status !== "review" || !isPuzzleRecord(result.match)) return fail();
  const match = result.match, observation = context.observation, count = observation.size ** 2, max = count - 1;
  if (match.reviewRequired !== true || match.artworkSourceId !== context.artworkSourceId || !sameFields(match.artworkCrop, context.artworkCrop)
    || !sameFields(match.policy, context.policy) || !numeric(match.assignmentCost, 0, count) || !isPuzzleRecord(match.observation)) return fail();
  const observed = match.observation;
  if (observed.sourceId !== observation.sourceId || observed.size !== observation.size || observed.blankIndex !== observation.blankIndex
    || !sameFields(observed.image, observation.image) || !sameFields(observed.crop, observation.crop) || !Array.isArray(observed.cells) || observed.cells.length !== count) return fail();
  for (let i = 0; i < count; i++) {
    const raw = observed.cells[i], expected = observation.cells[i]!;
    if (!isPuzzleRecord(raw) || raw.index !== i || raw.row !== expected.row || raw.column !== expected.column || !sameFields(raw.rect, expected.rect) || !sameFields(raw.sampleRect, expected.sampleRect)) return fail();
  }
  if (!isPuzzleRecord(match.blank) || !id(match.blank.proposedIndex, max) || (match.blank.index !== null && !id(match.blank.index, max))) return fail();
  const blank = match.blank;
  if (observation.blankIndex !== null) {
    if (blank.status !== "provided" || blank.index !== observation.blankIndex || blank.proposedIndex !== observation.blankIndex || blank.assignmentMargin !== null) return fail();
  } else if (!numeric(blank.assignmentMargin, 0, count) || (blank.status === "inferred"
    ? blank.index !== blank.proposedIndex || blank.assignmentMargin <= Math.max(1e-9, context.policy.minBlankMargin)
    : blank.status !== "uncertain" || blank.index !== null)) return fail();
  if (!Array.isArray(match.cells) || match.cells.length !== count || !Array.isArray(match.draftCells) || match.draftCells.length !== count) return fail();
  const receivedDraft = match.draftCells;
  const allowed = ["weakMatch", "ambiguousMatch", "assignmentConflict", "lowTexture", "transparent", "blankUncertain"];
  const cells: PuzzleCellMatch[] = match.cells.map((raw, index) => {
    if (!isPuzzleRecord(raw) || raw.index !== index || !id(raw.proposedTileId, max) || !numeric(raw.assignmentMargin, 0, count)
      || !Array.isArray(raw.issues) || raw.issues.length > allowed.length || new Set(raw.issues).size !== raw.issues.length || raw.issues.some(issue => typeof issue !== "string" || !allowed.includes(issue))
      || !Array.isArray(raw.candidates) || raw.candidates.length !== 3) return fail();
    const candidates = raw.candidates.map(item => candidate(item, max));
    if (new Set(candidates.map(item => item.tileId)).size !== 3 || candidates.some((item, i) => i > 0 && (item.cost < candidates[i - 1]!.cost || (item.cost === candidates[i - 1]!.cost && item.tileId < candidates[i - 1]!.tileId)))) return fail();
    const isBlank = raw.proposedTileId === 0;
    if (isBlank !== (index === blank.proposedIndex)) return fail();
    const assigned = isBlank ? null : candidate(raw.assigned, max);
    if (isBlank) {
      if (raw.assigned !== null || raw.rowMargin !== null || (blank.status === "uncertain" ? raw.issues.length !== 1 || raw.issues[0] !== "blankUncertain" : raw.issues.length !== 0)) return fail();
      if (observation.blankIndex === null && !near(raw.assignmentMargin, blank.assignmentMargin as number)) return fail();
    } else {
      if (assigned!.tileId !== raw.proposedTileId || !numeric(raw.rowMargin, -1, 1)
        || !near(raw.rowMargin, candidates.find(item => item.tileId !== assigned!.tileId)!.cost - assigned!.cost)) return fail();
      const listed = candidates.find(item => item.tileId === assigned!.tileId);
      if (listed && !sameFields(listed, assigned!)) return fail();
      if ((assigned!.cost > context.policy.maxPairCost && !raw.issues.includes("weakMatch"))
        || ((raw.rowMargin <= Math.max(1e-9, context.policy.minRowMargin) || raw.assignmentMargin <= Math.max(1e-9, context.policy.minAssignmentMargin)) && !raw.issues.includes("ambiguousMatch"))
        || (raw.rowMargin < -1e-9 && !raw.issues.includes("assignmentConflict")) || raw.issues.includes("blankUncertain")) return fail();
    }
    const draftTileId = raw.issues.length ? null : raw.proposedTileId;
    if (raw.draftTileId !== draftTileId || receivedDraft[index] !== draftTileId) return fail();
    return Object.freeze({ index, proposedTileId: raw.proposedTileId, draftTileId, assigned, candidates: Object.freeze(candidates), rowMargin: raw.rowMargin as number | null,
      assignmentMargin: raw.assignmentMargin, issues: Object.freeze(raw.issues.slice() as PuzzleMatchIssue[]) });
  });
  if (new Set(cells.map(cell => cell.proposedTileId)).size !== count || !near(cells.reduce((sum, cell) => sum + (cell.assigned?.cost ?? 0), 0), match.assignmentCost)) return fail();
  const draftCells = Object.freeze(cells.map(cell => cell.draftTileId)), complete = draftCells.every(tile => tile !== null);
  if (match.complete !== complete) return fail();
  return Object.freeze({ status: "review", match: Object.freeze({ reviewRequired: true, artworkSourceId: context.artworkSourceId, artworkCrop: context.artworkCrop, observation, policy: context.policy,
    assignmentCost: match.assignmentCost, blank: Object.freeze({ index: blank.index as number | null, proposedIndex: blank.proposedIndex as number, status: blank.status as "provided" | "inferred" | "uncertain", assignmentMargin: blank.assignmentMargin as number | null }),
    cells: Object.freeze(cells), draftCells, complete }) });
}

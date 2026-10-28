import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Accordion from "@mui/material/Accordion";
import AccordionSummary from "@mui/material/AccordionSummary";
import AccordionDetails from "@mui/material/AccordionDetails";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleBoard, PuzzleSize } from "@/lib/sliding-puzzle/model";
import type { PuzzleArtwork } from "@/lib/sliding-puzzle/image-client";
import type { PuzzleFragmentMatch } from "@/lib/sliding-puzzle/matching";
import type { PuzzleRegionCandidate } from "@/lib/sliding-puzzle/detection";
import { PUZZLE_NO_ARTWORK } from "@/lib/sliding-puzzle/detect-protocol";
import type { PuzzleWorkerClient } from "@/lib/sliding-puzzle/worker-client";
import { RecognitionError } from "@/lib/recognition/errors";
import { clipboardImageFiles } from "@/lib/browser/image-input";
import { decodePuzzleScreenshot, type PuzzleScreenshot } from "@/lib/sliding-puzzle/screenshot-client";
import { confirmPuzzleObservation, fullPuzzleCropFields, puzzleCropFields, readPuzzleCrop, type PuzzleCropFields, type PuzzleObservation } from "@/lib/sliding-puzzle/crop";
import PuzzleCropEditor from "./PuzzleCropEditor";
import PuzzleReview from "./PuzzleReview";

interface Props {
  locale: AppLocale; size: PuzzleSize; artwork: PuzzleArtwork | null; artworkSourceId: string; revision: number;
  getRevision: () => number; getClient: () => PuzzleWorkerClient; onInvalidate: () => number; onReviewed: (board: PuzzleBoard) => number;
}
export default function PuzzleScreenshotInput({ locale, size, artwork, artworkSourceId, revision, getRevision, getClient, onInvalidate, onReviewed }: Props) {
  const [image, setImage] = useState<PuzzleScreenshot | null>(null);
  const [fields, setFields] = useState<PuzzleCropFields | null>(null);
  const [blank, setBlank] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState<PuzzleObservation | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const current = useRef<PuzzleScreenshot | null>(null);
  const active = useRef<AbortController | null>(null);
  const sequence = useRef(0);
  const matchRevision = useRef(-1);
  const matchSequence = useRef(0);
  const mounted = useRef(false);
  const [matching, setMatching] = useState(false);
  const [matchStatus, setMatchStatus] = useState<string | null>(null);
  const [match, setMatch] = useState<PuzzleFragmentMatch | null>(null);
  const [reviewCells, setReviewCells] = useState<readonly (number | null)[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);
  const [approved, setApproved] = useState(false);
  const [edited, setEdited] = useState(false);
  const [detecting, setDetecting] = useState(false);
  const [detectStatus, setDetectStatus] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<readonly PuzzleRegionCandidate[]>([]);
  const detectSequence = useRef(0);
  const resetReview = useCallback(() => {
    matchSequence.current++; setMatching(false); setMatchStatus(null); setMatch(null); setReviewCells([]); setAcknowledged(false); setApproved(false); setEdited(false);
  }, []);
  const resetDetect = useCallback(() => { detectSequence.current++; setDetecting(false); setDetectStatus(null); setSuggestions([]); }, []);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => { if (matchRevision.current !== revision) resetReview(); }, [revision, resetReview]);
  // A new revision cancels an in-flight detection; the suggestions still describe this screenshot.
  useEffect(() => { detectSequence.current++; setDetecting(false); }, [revision]);
  const invalidateReview = useCallback(() => { resetReview(); matchRevision.current = onInvalidate(); }, [resetReview, onInvalidate]);
  const parsed = useMemo(() => image && fields ? readPuzzleCrop(size, image, fields) : null, [image, fields, size]);
  const clear = useCallback(() => {
    sequence.current++; active.current?.abort(); active.current = null;
    current.current?.dispose(); current.current = null;
    setImage(null); setFields(null); setBlank(null); setConfirmed(null); setError(null); setBusy(false);
    resetDetect();
    invalidateReview();
  }, [invalidateReview, resetDetect]);
  const receive = useCallback(async (files: readonly File[]) => {
    if (!files.length) return;
    clear();
    if (files.length !== 1) { setError("oneImage"); return; }
    const controller = new AbortController(); active.current = controller;
    const version = sequence.current;
    setBusy(true);
    try {
      const loaded = await decodePuzzleScreenshot(files[0]!, controller.signal);
      if (controller.signal.aborted || version !== sequence.current) { loaded.dispose(); return; }
      current.current = loaded;
      setImage(loaded); setFields(fullPuzzleCropFields(loaded));
    } catch (issue) {
      if (!controller.signal.aborted && version === sequence.current) setError(issue instanceof RecognitionError && (issue.code === "imageType" || issue.code === "imageDecode") ? issue.code : "imageDecode");
    } finally { if (version === sequence.current) { active.current = null; setBusy(false); } }
  }, [clear]);

  useEffect(() => () => { sequence.current++; active.current?.abort(); current.current?.dispose(); }, []);
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || event.target instanceof Element && event.target.closest('input, textarea, [contenteditable]:not([contenteditable="false"])')) return;
      const files = clipboardImageFiles(event.clipboardData);
      if (files.length) { event.preventDefault(); void receive(files); }
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [receive]);

  const edit = (next: PuzzleCropFields) => { setFields(next); setBlank(null); setConfirmed(null); invalidateReview(); };
  const startMatch = async () => {
    if (!image || !confirmed || !artwork || matching) return;
    invalidateReview();
    const token = matchRevision.current, job = ++matchSequence.current;
    const isCurrent = () => mounted.current && getRevision() === token && matchSequence.current === job;
    setMatching(true);
    try {
      const outcome = await getClient().match({ binding: { jobId: `match:${job}`, inputRevision: String(token), artworkSourceId },
        input: { artworkSourceId, artwork, screenshot: image, observation: confirmed }, timeLimitMs: 15000, isCurrent });
      if (!isCurrent()) return;
      if (outcome.result.status === "review") { setMatch(outcome.result.match); setReviewCells(outcome.result.match.draftCells); }
      else setMatchStatus(outcome.result.status);
    } catch { if (isCurrent()) setMatchStatus("failed"); }
    finally { if (isCurrent()) setMatching(false); }
  };
  const startDetect = async () => {
    if (!image || detecting || matching || busy) return;
    const token = getRevision(), job = ++detectSequence.current;
    const isCurrent = () => mounted.current && getRevision() === token && detectSequence.current === job;
    const source = artwork ? artworkSourceId : PUZZLE_NO_ARTWORK;
    setDetecting(true); setDetectStatus(null); setSuggestions([]);
    try {
      const outcome = await getClient().detect({
        binding: { jobId: `detect:${job}`, inputRevision: String(token), artworkSourceId: source },
        input: { size, screenshot: image, artworkSourceId: source, artwork: artwork ? { width: artwork.width, height: artwork.height, rgba: artwork.rgba } : null },
        timeLimitMs: 15000, isCurrent,
      });
      if (!isCurrent()) return;
      if (outcome.result.status === "suggestions") {
        setSuggestions(outcome.result.suggestions.candidates);
        if (!outcome.result.suggestions.candidates.length) setDetectStatus("empty");
      } else setDetectStatus(outcome.result.status);
    } catch { if (isCurrent()) setDetectStatus("failed"); }
    finally { if (isCurrent()) setDetecting(false); }
  };
  const cancelDetect = () => {
    detectSequence.current++; getClient().cancel("stale");
    setDetecting(false); setDetectStatus("cancelled");
  };
  // Applying a suggestion only fills the crop; the user still confirms the board and blank.
  const applyCandidate = (candidate: PuzzleRegionCandidate) => {
    edit(puzzleCropFields(candidate.crop));
    setDetectStatus("applied");
  };
  return (
    <section aria-labelledby="puzzle-screenshot-heading" className={`md3-surface min-w-0 space-y-4 p-4 sm:p-5 ${dragging ? "puzzle-drop-active" : ""}`}
      onDragOver={event => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDragging(true); } }}
      onDragLeave={event => { if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false); }}
      onDrop={event => { setDragging(false); if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); void receive(Array.from(event.dataTransfer.files)); } }}>
      <h2 id="puzzle-screenshot-heading" className="text-title-large">{t(locale, "slidingPuzzle.screenshot.title")}</h2>
      <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.screenshot.importHint")}</p>
      <div className="flex flex-wrap gap-2">
        <Button component="label" variant="outlined">{t(locale, "slidingPuzzle.screenshot.choose")}
          <input className="sr-only" type="file" accept="image/png,image/jpeg,image/webp" aria-label={t(locale, "slidingPuzzle.screenshot.choose")} onChange={event => { const files = Array.from(event.target.files ?? []); event.target.value = ""; void receive(files); }} />
        </Button>
        {(image || busy || error) && <Button onClick={clear}>{t(locale, busy ? "slidingPuzzle.cancel" : "slidingPuzzle.screenshot.clear")}</Button>}
      </div>
      {busy && <div role="status"><p className="mb-2 text-body-medium">{t(locale, "slidingPuzzle.screenshot.loading")}</p><LinearProgress /></div>}
      {error && <Alert severity="error">{t(locale, `slidingPuzzle.screenshot.${error}`)}</Alert>}
      {image && fields && <>
        <p className="text-body-small text-on-surface-variant">{t(locale, "slidingPuzzle.screenshot.dimensions", { width: image.width, height: image.height })}</p>
        <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.detect.hint")}</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outlined" disabled={busy || detecting || matching} onClick={() => void startDetect()}>{t(locale, detecting ? "slidingPuzzle.detect.busy" : "slidingPuzzle.detect.start")}</Button>
          {detecting && <Button variant="outlined" onClick={cancelDetect}>{t(locale, "slidingPuzzle.cancel")}</Button>}
        </div>
        {detecting && <LinearProgress aria-label={t(locale, "slidingPuzzle.detect.busy")} />}
        {detectStatus && <Alert severity={detectStatus === "failed" || detectStatus === "invalid" ? "error" : detectStatus === "applied" ? "success" : "info"}>{t(locale, `slidingPuzzle.detect.results.${detectStatus}`)}</Alert>}
        <PuzzleCropEditor locale={locale} image={image} size={size} fields={fields} onChange={edit} />
        {suggestions.length > 0 && <div className="space-y-3">
          <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.detect.review")}</p>
          <ol className="puzzle-detection-list" aria-label={t(locale, "slidingPuzzle.detect.list")}>
            {suggestions.map((candidate, index) => <li key={`${candidate.crop.x}:${candidate.crop.y}:${candidate.crop.width}:${candidate.crop.height}`}>
              <div className="puzzle-detection-image" style={{ aspectRatio: `${candidate.crop.width} / ${candidate.crop.height}` }}>
                <img src={image.url} alt="" draggable={false} style={{ width: `${image.width / candidate.crop.width * 100}%`, height: `${image.height / candidate.crop.height * 100}%`, left: `${-candidate.crop.x / candidate.crop.width * 100}%`, top: `${-candidate.crop.y / candidate.crop.height * 100}%` }} />
              </div>
              <p className="text-label-small">{t(locale, "slidingPuzzle.detect.candidate", { index: index + 1 })} · {t(locale, `slidingPuzzle.detect.evidence.${candidate.evidence}`)}</p>
              <p className="text-label-small text-on-surface-variant">{t(locale, "slidingPuzzle.detect.signal", { score: candidate.score.toFixed(2) })}</p>
              <p className="text-label-small text-on-surface-variant">{candidate.crop.width} × {candidate.crop.height} · {candidate.crop.x}, {candidate.crop.y}</p>
              <Button size="small" variant="outlined" onClick={() => applyCandidate(candidate)}>{t(locale, "slidingPuzzle.detect.use")}</Button>
            </li>)}
          </ol>
        </div>}
        <TextField select fullWidth label={t(locale, "slidingPuzzle.screenshot.blankPosition")} value={blank ?? -1} onChange={event => {
          const value = Number(event.target.value); setBlank(value === -1 ? null : value); setConfirmed(null); invalidateReview();
        }}>
          <MenuItem value={-1}>{t(locale, "slidingPuzzle.screenshot.unknownBlank")}</MenuItem>
          {Array.from({ length: size * size }, (_, index) => <MenuItem key={index} value={index}>{t(locale, "slidingPuzzle.screenshot.position", { row: Math.floor(index / size) + 1, column: index % size + 1 })}</MenuItem>)}
        </TextField>
        <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.screenshot.blankHint")}</p>
        <Button variant="contained" disabled={!parsed?.ok} onClick={() => {
          if (parsed?.ok) { invalidateReview(); setConfirmed(confirmPuzzleObservation(image.sourceId, size, image, fields, blank)); }
        }}>{t(locale, "slidingPuzzle.screenshot.confirm")}</Button>
        {confirmed && <>
          <Alert severity="success">{t(locale, "slidingPuzzle.screenshot.confirmed", { count: confirmed.cells.length })}</Alert>
          <div className="flex flex-wrap gap-2">
            <Button variant="contained" disabled={!artwork || matching || detecting} onClick={() => void startMatch()}>{t(locale, matching ? "slidingPuzzle.matching.busy" : "slidingPuzzle.matching.start")}</Button>
            {matching && <Button variant="outlined" onClick={() => { invalidateReview(); setMatchStatus("cancelled"); }}>{t(locale, "slidingPuzzle.cancel")}</Button>}
          </div>
          {matching && <LinearProgress aria-label={t(locale, "slidingPuzzle.matching.busy")} />}
          {matchStatus && <Alert severity={matchStatus === "failed" || matchStatus === "invalid" ? "error" : "info"}>{t(locale, `slidingPuzzle.matching.results.${matchStatus}`)}</Alert>}
          {match && artwork && <PuzzleReview locale={locale} match={match} image={image} artwork={artwork} cells={reviewCells} acknowledged={acknowledged} approved={approved} edited={edited}
            onEdit={(index, tile) => {
              matchRevision.current = onInvalidate(); setApproved(false); setAcknowledged(false); setEdited(true);
              setReviewCells(previous => previous.map((value, i) => i === index ? tile : value));
            }} onAcknowledge={value => { matchRevision.current = onInvalidate(); setApproved(false); setAcknowledged(value); }}
            onConfirm={board => { matchRevision.current = onReviewed(board); setApproved(true); }} />}
          <Accordion defaultExpanded disableGutters>
            <AccordionSummary><span className="text-title-medium">{t(locale, "slidingPuzzle.screenshot.pieces")}</span></AccordionSummary>
            <AccordionDetails>
              <p className="mb-3 text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.screenshot.piecesHint")}</p>
              <ol className="puzzle-observations" aria-label={t(locale, "slidingPuzzle.screenshot.pieces")}>
                {confirmed.cells.map(cell => <li key={cell.index} className={cell.index === confirmed.blankIndex ? "puzzle-observation--blank" : ""}>
                  <div className="puzzle-observation-image" style={{ aspectRatio: `${cell.rect.width} / ${cell.rect.height}` }}>
                    <img src={image.url} alt="" draggable={false} style={{ width: `${image.width / cell.rect.width * 100}%`, height: `${image.height / cell.rect.height * 100}%`, left: `${-cell.rect.x / cell.rect.width * 100}%`, top: `${-cell.rect.y / cell.rect.height * 100}%` }} />
                  </div>
                  <p className="text-label-small">{t(locale, "slidingPuzzle.screenshot.position", { row: cell.row + 1, column: cell.column + 1 })}{cell.index === confirmed.blankIndex ? ` · ${t(locale, "slidingPuzzle.blank")}` : ""}</p>
                </li>)}
              </ol>
            </AccordionDetails>
          </Accordion>
        </>}
      </>}
    </section>
  );
}

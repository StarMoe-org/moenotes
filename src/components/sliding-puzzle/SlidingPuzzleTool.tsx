import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Button from "@mui/material/Button";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { AppLocale } from "@/config/locales";
import { isGameServer, type GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { withMd3 } from "@/components/md3/Md3Provider";
import type { MusicViewModel } from "@/lib/music/data";
import { useSongTitle } from "@/lib/music/title-preference";
import { serverAssetUrl } from "@/lib/assets/release";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";
import { isSpoiler, useSpoilerSetting } from "@/lib/settings/spoiler";
import { analyzePuzzleBoard, createPuzzleGoal, PUZZLE_SIZES, type PuzzleBoard, type PuzzleSize } from "@/lib/sliding-puzzle/model";
import { formatPuzzleBoard, parsePuzzleText } from "@/lib/sliding-puzzle/manual-input";
import { loadPuzzleArtwork, type PuzzleArtwork } from "@/lib/sliding-puzzle/image-client";
import { createPuzzlePlayback, type PuzzlePlayback as Playback } from "@/lib/sliding-puzzle/playback";
import { PuzzleWorkerClient } from "@/lib/sliding-puzzle/worker-client";
import type { PuzzleJobResult } from "@/lib/sliding-puzzle/worker-protocol";
import PuzzleBoardView from "./PuzzleBoardView";
import PuzzlePlayback from "./PuzzlePlayback";
import PuzzleScreenshotInput from "./PuzzleScreenshotInput";

interface Props { locale: AppLocale; songs: ServerFaceted<MusicViewModel>[]; servers: GameServer[] }

function SlidingPuzzleTool({ locale, songs, servers }: Props) {
  const { server, pickServer, items } = useServerList(locale, servers, songs);
  const { showSpoiler, now } = useSpoilerSetting();
  const available = useMemo(() => items.filter(song => showSpoiler || now === null || !isSpoiler(song.startAt, now)), [items, showSpoiler, now]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [size, setSize] = useState<PuzzleSize>(3);
  const songTitle = useSongTitle();
  const song = available.find(entry => entry.id === selectedId) ?? null;
  const sourceUrl = song ? serverAssetUrl(song.jacketUrl, server) : "";
  return (
    <div className="space-y-5">
      <section className="md3-surface space-y-4 p-4 sm:p-5" aria-labelledby="puzzle-setup-heading">
        <h2 id="puzzle-setup-heading" className="text-title-large">{t(locale, "slidingPuzzle.setup")}</h2>
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          <TextField select fullWidth label={t(locale, "gameServer.label")} value={server} onChange={event => { if (isGameServer(event.target.value)) pickServer(event.target.value); }}>
            {servers.map(entry => <MenuItem key={entry} value={entry}>{t(locale, `gameServer.names.${entry}`)}</MenuItem>)}
          </TextField>
          <TextField select fullWidth label={t(locale, "slidingPuzzle.size")} value={size} onChange={event => {
            const next = Number(event.target.value);
            if (PUZZLE_SIZES.some(value => value === next)) setSize(next as PuzzleSize);
          }}>
            {PUZZLE_SIZES.map(entry => <MenuItem key={entry} value={entry}>{entry} × {entry}</MenuItem>)}
          </TextField>
        </div>
        <Autocomplete options={available} value={song} onChange={(_, value) => setSelectedId(value?.id ?? null)}
          getOptionLabel={entry => `${songTitle(entry)} · ${entry.bandName}`}
          isOptionEqualToValue={(a, b) => a.id === b.id}
          noOptionsText={t(locale, "slidingPuzzle.noSongs")}
          openText={t(locale, "slidingPuzzle.openSongs")} closeText={t(locale, "actions.close")} clearText={t(locale, "slidingPuzzle.clearSong")}
          renderInput={params => <TextField {...params} label={t(locale, "slidingPuzzle.song")} />} />
        <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.manualHint")}</p>
      </section>
      {song ? <PuzzleWorkspace key={`${server}:${song.id}:${sourceUrl}:${size}`} locale={locale} server={server} songId={song.id} size={size} sourceUrl={sourceUrl} />
        : <Alert severity="info">{t(locale, "slidingPuzzle.chooseSong")}</Alert>}
    </div>
  );
}

type ArtworkState = { status: "loading" | "failed" } | { status: "ready"; artwork: PuzzleArtwork };

/** A new scope remounts the workspace, so no song/server/size can inherit another input or solution. */
function PuzzleWorkspace({ locale, server, songId, size, sourceUrl }: { locale: AppLocale; server: GameServer; songId: number; size: PuzzleSize; sourceUrl: string }) {
  const [artState, setArtState] = useState<ArtworkState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<PuzzleJobResult | null>(null);
  const [playback, setPlayback] = useState<Playback | null>(null);
  const client = useRef<PuzzleWorkerClient | null>(null);
  const revision = useRef(0);
  const [inputRevision, setInputRevision] = useState(0);
  const draftOrigin = useRef<"manual" | "review">("manual");
  const solveSequence = useRef(0);
  const mounted = useRef(false);
  const parsed = useMemo(() => parsePuzzleText(size, draft), [size, draft]);
  const goal = useMemo(() => createPuzzleGoal(size), [size]);
  const solvable = parsed.ok && analyzePuzzleBoard(parsed.board).solvable;
  const artwork = artState.status === "ready" ? artState.artwork : null;

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; revision.current++; client.current?.dispose(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setArtState({ status: "loading" });
    void loadPuzzleArtwork(sourceUrl, size, controller.signal).then(loaded => {
      if (!controller.signal.aborted) setArtState({ status: "ready", artwork: loaded });
    }).catch(() => { if (!controller.signal.aborted) setArtState({ status: "failed" }); });
    return () => controller.abort();
  }, [sourceUrl, size, attempt]);

  const invalidate = useCallback(() => {
    revision.current++;
    setInputRevision(revision.current);
    client.current?.cancel("stale");
    setBusy(false); setResult(null); setPlayback(null);
    if (draftOrigin.current === "review") { setDraft(""); draftOrigin.current = "manual"; }
    return revision.current;
  }, []);
  const getRevision = useCallback(() => revision.current, []);
  const getClient = useCallback(() => client.current ??= new PuzzleWorkerClient(), []);
  const solveBoard = async (board: PuzzleBoard) => {
    const current = revision.current;
    const sequence = ++solveSequence.current;
    const isCurrent = () => mounted.current && revision.current === current && solveSequence.current === sequence;
    setBusy(true); setResult(null); setPlayback(null);
    try {
      const outcome = await getClient().run({
        binding: { jobId: `solve:${songId}:${sequence}`, inputRevision: String(current), artworkSourceId: `${server}:${songId}:${sourceUrl}` },
        input: { size, cells: board.cells }, timeLimitMs: 30000, isCurrent,
      });
      if (!isCurrent()) return;
      if (outcome.result.status === "solved") setPlayback(createPuzzlePlayback(board, outcome.result.moves));
      setResult(outcome.result);
    } catch { if (isCurrent()) setResult({ status: "failed", code: "runtime" }); }
    finally { if (isCurrent()) setBusy(false); }
  };

  return (
    <div className="space-y-5">
      <PuzzleScreenshotInput locale={locale} size={size} artwork={artwork} artworkSourceId={`${server}:${songId}:${sourceUrl}`}
        revision={inputRevision} getRevision={getRevision} getClient={getClient} onInvalidate={invalidate}
        onReviewed={board => {
          const current = invalidate();
          draftOrigin.current = "review"; setDraft(formatPuzzleBoard(board));
          void solveBoard(board);
          return current;
        }} />
      <div className="grid items-start gap-5 xl:grid-cols-2">
        <section className="md3-surface min-w-0 space-y-4 p-4 sm:p-5" aria-labelledby="puzzle-reference-heading">
          <h2 id="puzzle-reference-heading" className="text-title-large">{t(locale, "slidingPuzzle.reference")}</h2>
          <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.referenceHint", { max: size * size - 1 })}</p>
          {artState.status === "loading" ? <div role="status"><p className="mb-2 text-body-medium">{t(locale, "slidingPuzzle.loadingArtwork")}</p><LinearProgress /></div>
            : artState.status === "failed" ? <Alert severity="error" action={<Button color="inherit" onClick={() => { invalidate(); setAttempt(previous => previous + 1); }}>{t(locale, "slidingPuzzle.retry")}</Button>}>{t(locale, "slidingPuzzle.artworkFailed")}</Alert>
              : <PuzzleBoardView locale={locale} board={goal} artwork={artwork} label={t(locale, "slidingPuzzle.reference")} />}
        </section>
        <section className="md3-surface min-w-0 space-y-4 p-4 sm:p-5" aria-labelledby="puzzle-input-heading">
          <h2 id="puzzle-input-heading" className="text-title-large">{t(locale, "slidingPuzzle.input")}</h2>
          <TextField fullWidth multiline minRows={size} maxRows={8} label={t(locale, "slidingPuzzle.cells")}
            value={draft} placeholder={formatPuzzleBoard(goal)}
            onChange={event => { invalidate(); setDraft(event.target.value); }}
            error={draft.trim().length > 0 && !parsed.ok}
            helperText={!parsed.ok && draft.trim() ? t(locale, `slidingPuzzle.validation.${parsed.issue.code}`, { count: size * size, max: size * size - 1 }) : t(locale, "slidingPuzzle.inputHint", { count: size * size, max: size * size - 1 })}
            slotProps={{ htmlInput: { maxLength: 4096, spellCheck: false } }} />
          <Button variant="outlined" onClick={() => { invalidate(); setDraft(formatPuzzleBoard(goal)); }}>{t(locale, "slidingPuzzle.fillGoal")}</Button>
          {parsed.ok && <PuzzleBoardView locale={locale} board={parsed.board} artwork={artwork} label={t(locale, "slidingPuzzle.input")} />}
          {parsed.ok && !solvable && <Alert severity="warning">{t(locale, "slidingPuzzle.unsolvable")}</Alert>}
          <div className="flex flex-wrap gap-2">
            <Button variant="contained" disabled={!parsed.ok || !solvable || busy} onClick={() => { if (parsed.ok) void solveBoard(parsed.board); }}>{t(locale, busy ? "slidingPuzzle.solving" : "slidingPuzzle.solve")}</Button>
            {busy && <Button variant="outlined" onClick={() => {
              solveSequence.current++; client.current?.cancel();
              setBusy(false); setPlayback(null); setResult({ status: "cancelled" });
            }}>{t(locale, "slidingPuzzle.cancel")}</Button>}
          </div>
          {busy && <LinearProgress aria-label={t(locale, "slidingPuzzle.solving")} />}
          {result && <Alert severity={result.status === "solved" ? "success" : result.status === "failed" || result.status === "invalid" ? "error" : "info"}>
            {result.status === "solved" ? t(locale, result.optimal ? "slidingPuzzle.solvedOptimal" : "slidingPuzzle.solved", { steps: result.steps }) : t(locale, `slidingPuzzle.results.${result.status}`)}
          </Alert>}
        </section>
      </div>
      {playback && <PuzzlePlayback locale={locale} state={playback} artwork={artwork} onChange={update => setPlayback(previous => previous ? update(previous) : null)} />}
    </div>
  );
}

export default withMd3(SlidingPuzzleTool);

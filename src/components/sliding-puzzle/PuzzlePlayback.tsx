import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleArtwork } from "@/lib/sliding-puzzle/image-client";
import { resetPuzzlePlayback, stepPuzzlePlayback, type PuzzlePlayback as Playback } from "@/lib/sliding-puzzle/playback";
import PuzzleBoardView from "./PuzzleBoardView";

export default function PuzzlePlayback({ locale, state, artwork, onChange }: {
  locale: AppLocale; state: Playback; artwork: PuzzleArtwork | null; onChange: (update: (previous: Playback) => Playback) => void;
}) {
  const next = state.moves[state.position];
  return (
    <section className="md3-surface space-y-4 p-4 sm:p-5" aria-labelledby="puzzle-playback-heading">
      <h2 id="puzzle-playback-heading" className="text-title-large">{t(locale, "slidingPuzzle.playback")}</h2>
      <p className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.playbackHint")}</p>
      <PuzzleBoardView locale={locale} board={state.board} artwork={artwork} label={t(locale, "slidingPuzzle.playback")} nextTile={next?.tileId} />
      <div className="space-y-2" aria-live="polite" aria-atomic="true">
        <p className="text-title-medium">{t(locale, "slidingPuzzle.step", { current: state.position, total: state.moves.length })}</p>
        <p className="text-body-medium text-on-surface-variant">{next
          ? t(locale, "slidingPuzzle.moveHint", { id: next.tileId, fromRow: Math.floor(next.fromIndex / state.board.size) + 1, fromColumn: next.fromIndex % state.board.size + 1, toRow: Math.floor(next.toIndex / state.board.size) + 1, toColumn: next.toIndex % state.board.size + 1 })
          : t(locale, "slidingPuzzle.complete")}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outlined" disabled={state.position === 0} onClick={() => onChange(previous => stepPuzzlePlayback(previous, "previous"))}>{t(locale, "slidingPuzzle.previous")}</Button>
        <Button variant="contained" disabled={state.position === state.moves.length} onClick={() => onChange(previous => stepPuzzlePlayback(previous, "next"))}>{t(locale, "slidingPuzzle.next")}</Button>
        <Button disabled={state.position === 0} onClick={() => onChange(resetPuzzlePlayback)}>{t(locale, "slidingPuzzle.restart")}</Button>
      </div>
    </section>
  );
}

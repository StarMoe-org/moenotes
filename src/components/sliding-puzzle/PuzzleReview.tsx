import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleArtwork } from "@/lib/sliding-puzzle/image-client";
import type { PuzzleScreenshot } from "@/lib/sliding-puzzle/screenshot-client";
import type { PuzzleFragmentMatch } from "@/lib/sliding-puzzle/matching";
import type { PuzzleBoard } from "@/lib/sliding-puzzle/model";
import { inspectPuzzleReview } from "@/lib/sliding-puzzle/review";

interface Props {
  locale: AppLocale; match: PuzzleFragmentMatch; image: PuzzleScreenshot; artwork: PuzzleArtwork;
  cells: readonly (number | null)[]; acknowledged: boolean; approved: boolean; edited: boolean;
  onEdit: (index: number, tile: number | null) => void; onAcknowledge: (value: boolean) => void; onConfirm: (board: PuzzleBoard) => void;
}

export default function PuzzleReview({ locale, match, image, artwork, cells, acknowledged, approved, edited, onEdit, onAcknowledge, onConfirm }: Props) {
  const size = match.observation.size, max = size * size - 1;
  const state = inspectPuzzleReview(size, cells, acknowledged);
  const tileLabel = (id: number | null) => id === null ? t(locale, "slidingPuzzle.review.unknown") : id === 0 ? t(locale, "slidingPuzzle.blank") : String(id);
  return <section className="space-y-4" aria-labelledby="puzzle-review-heading">
    <h3 id="puzzle-review-heading" className="text-title-large">{t(locale, "slidingPuzzle.review.title")}</h3>
    <Alert severity="info">{t(locale, "slidingPuzzle.review.hint")}</Alert>
    <p className="text-body-medium text-on-surface-variant">{t(locale, `slidingPuzzle.review.blank.${edited ? "edited" : match.blank.status}`)}</p>
    <ol className="puzzle-review-grid">
      {match.cells.map(cell => {
        const observed = match.observation.cells[cell.index]!, selected = cells[cell.index] ?? null;
        const source = artwork.tiles.find(tile => tile.tileId === selected);
        const position = t(locale, "slidingPuzzle.screenshot.position", { row: observed.row + 1, column: observed.column + 1 });
        return <li key={cell.index} className="md3-card-filled space-y-3 p-3" data-puzzle-review-cell={cell.index}>
          <h4 className="text-title-small">{position}</h4>
          <div className="grid grid-cols-2 gap-2">
            <figure><div className="puzzle-observation-image aspect-square">
              <img src={image.url} alt="" draggable={false} style={{ width: `${image.width / observed.rect.width * 100}%`, height: `${image.height / observed.rect.height * 100}%`, left: `${-observed.rect.x / observed.rect.width * 100}%`, top: `${-observed.rect.y / observed.rect.height * 100}%` }} />
            </div><figcaption className="text-label-small">{t(locale, "slidingPuzzle.review.observed")}</figcaption></figure>
            <figure><div className="puzzle-review-reference aspect-square">
              {source ? <img src={source.url} alt="" draggable={false} /> : <span className="text-body-small">{tileLabel(selected)}</span>}
            </div><figcaption className="text-label-small">{t(locale, "slidingPuzzle.review.selected")}</figcaption></figure>
          </div>
          <TextField select fullWidth size="small" label={t(locale, "slidingPuzzle.review.tileId")} value={selected ?? -1}
            slotProps={{ select: { MenuProps: { slotProps: { paper: { sx: { maxHeight: 320 } } } } } }}
            onChange={event => { const value = Number(event.target.value); onEdit(cell.index, value === -1 ? null : value); }}>
            <MenuItem value={-1}>{tileLabel(null)}</MenuItem><MenuItem value={0}>{t(locale, "slidingPuzzle.review.blankId")}</MenuItem>
            {artwork.tiles.map(tile => <MenuItem key={tile.tileId} value={tile.tileId}>{tile.tileId}</MenuItem>)}
          </TextField>
          {cell.issues.length > 0 && <p className="text-body-small text-on-surface-variant">{t(locale, "slidingPuzzle.review.matchNotes", { issues: cell.issues.map(issue => t(locale, `slidingPuzzle.review.issues.${issue}`)).join(" · ") })}</p>}
          <p className="text-label-small">{t(locale, "slidingPuzzle.review.candidates")}</p>
          <div className="flex flex-wrap gap-1" role="group" aria-label={`${position} · ${t(locale, "slidingPuzzle.review.candidates")}`}>
            {cell.candidates.map(candidate => <Button key={candidate.tileId} size="small" variant={selected === candidate.tileId ? "contained" : "outlined"}
              aria-label={t(locale, "slidingPuzzle.review.useCandidate", { id: candidate.tileId })} onClick={() => onEdit(cell.index, candidate.tileId)}>
              <img className="puzzle-candidate-image" src={artwork.tiles[candidate.tileId - 1]!.url} alt="" draggable={false} />{candidate.tileId}
            </Button>)}
          </div>
        </li>;
      })}
    </ol>
    {state.status === "unknown" && <Alert severity="warning">{t(locale, "slidingPuzzle.review.remaining", { count: state.count })}</Alert>}
    {state.status === "invalid" && <Alert severity="error">{t(locale, `slidingPuzzle.validation.${state.issue.code}`, { count: size * size, max })}</Alert>}
    {state.status === "unsolvable" && <Alert severity="warning">{t(locale, "slidingPuzzle.unsolvable")}</Alert>}
    <FormControlLabel control={<Checkbox checked={acknowledged} onChange={event => onAcknowledge(event.target.checked)} />} label={t(locale, "slidingPuzzle.review.acknowledge")} />
    <div><Button variant="contained" disabled={state.status !== "ready" || approved} onClick={() => { if (state.status === "ready") onConfirm(state.board); }}>{t(locale, "slidingPuzzle.review.confirm")}</Button></div>
    {approved && <Alert severity="success">{t(locale, "slidingPuzzle.review.approved")}</Alert>}
  </section>;
}

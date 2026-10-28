import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleBoard } from "@/lib/sliding-puzzle/model";
import type { PuzzleArtwork } from "@/lib/sliding-puzzle/image-client";

export default function PuzzleBoardView({ locale, board, artwork, label, nextTile }: {
  locale: AppLocale;
  board: PuzzleBoard;
  artwork: PuzzleArtwork | null;
  label: string;
  nextTile?: number | undefined;
}) {
  return (
    <ol aria-label={label} className="puzzle-board" style={{ gridTemplateColumns: `repeat(${board.size}, minmax(0, 1fr))`, aspectRatio: artwork ? `${artwork.width} / ${artwork.height}` : "1" }}>
      {board.cells.map((id, index) => (
        <li key={index} className={`puzzle-cell ${id === 0 ? "puzzle-cell--blank" : ""} ${id === nextTile ? "puzzle-cell--next" : ""}`}
          aria-label={t(locale, id === 0 ? "slidingPuzzle.blankCell" : "slidingPuzzle.tileCell", { row: Math.floor(index / board.size) + 1, column: index % board.size + 1, id })}>
          {id !== 0 && artwork?.tiles[id - 1] && <img src={artwork.tiles[id - 1]!.url} alt="" draggable={false} />}
          <span className="puzzle-tile-id text-label-small" aria-hidden="true">{id === 0 ? t(locale, "slidingPuzzle.blank") : id}</span>
        </li>
      ))}
    </ol>
  );
}

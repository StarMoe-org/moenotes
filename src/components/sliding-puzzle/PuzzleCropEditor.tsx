import { useRef, type PointerEvent } from "react";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import TextField from "@mui/material/TextField";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { PuzzleSize } from "@/lib/sliding-puzzle/model";
import type { PuzzleScreenshot } from "@/lib/sliding-puzzle/screenshot-client";
import { fullPuzzleCropFields, movePuzzleCrop, puzzleCropFromPoints, puzzleImagePoint, readPuzzleCrop, type PuzzleCropFields, type PuzzlePoint } from "@/lib/sliding-puzzle/crop";

export default function PuzzleCropEditor({ locale, image, size, fields, onChange }: {
  locale: AppLocale; image: PuzzleScreenshot; size: PuzzleSize; fields: PuzzleCropFields; onChange: (fields: PuzzleCropFields) => void;
}) {
  const selection = readPuzzleCrop(size, image, fields);
  const drag = useRef<{ pointerId: number; start: PuzzlePoint; before: PuzzleCropFields } | null>(null);
  const point = (event: PointerEvent<HTMLElement>) => puzzleImagePoint({ x: event.clientX, y: event.clientY }, event.currentTarget.getBoundingClientRect(), image);
  const down = (event: PointerEvent<HTMLElement>) => {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    event.preventDefault(); event.currentTarget.focus();
    const start = point(event);
    drag.current = { pointerId: event.pointerId, start, before: fields };
    event.currentTarget.setPointerCapture(event.pointerId);
    onChange(puzzleCropFromPoints(image, start, start));
  };
  const finish = (event: PointerEvent<HTMLElement>, cancel = false) => {
    const active = drag.current;
    if (!active || active.pointerId !== event.pointerId) return;
    drag.current = null;
    onChange(cancel ? active.before : puzzleCropFromPoints(image, active.start, point(event)));
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const crop = selection.ok ? selection.crop : null;
  return (
    <div className="min-w-0 space-y-4">
      <p id="puzzle-crop-help" className="text-body-medium text-on-surface-variant">{t(locale, "slidingPuzzle.screenshot.cropHint")}</p>
      <ButtonBase component="div" role="group" tabIndex={0} className="puzzle-crop-stage"
        aria-label={t(locale, "slidingPuzzle.screenshot.cropArea")} aria-describedby="puzzle-crop-help"
        style={{ aspectRatio: `${image.width} / ${image.height}` }}
        onPointerDown={down} onPointerMove={event => {
          if (drag.current?.pointerId === event.pointerId) onChange(puzzleCropFromPoints(image, drag.current.start, point(event)));
        }} onPointerUp={event => finish(event)} onPointerCancel={event => finish(event, true)}
        onLostPointerCapture={() => { drag.current = null; }}
        onKeyDown={event => {
          if (event.key === "Escape" && drag.current) { const before = drag.current.before; drag.current = null; onChange(before); event.preventDefault(); return; }
          if (!crop || drag.current || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
          event.preventDefault();
          const distance = event.shiftKey ? 10 : 1;
          onChange(movePuzzleCrop(image, crop, { x: event.key === "ArrowLeft" ? -distance : event.key === "ArrowRight" ? distance : 0, y: event.key === "ArrowUp" ? -distance : event.key === "ArrowDown" ? distance : 0 }));
        }}>
        <img src={image.url} alt={t(locale, "slidingPuzzle.screenshot.original")} draggable={false} />
        {crop && <svg className="puzzle-crop-overlay" viewBox={`0 0 ${image.width} ${image.height}`} aria-hidden="true" preserveAspectRatio="none">
          <path className="puzzle-crop-mask" fillRule="evenodd" d={`M0 0H${image.width}V${image.height}H0Z M${crop.x} ${crop.y}h${crop.width}v${crop.height}h${-crop.width}Z`} />
          <rect className="puzzle-crop-outline" x={crop.x} y={crop.y} width={crop.width} height={crop.height} vectorEffect="non-scaling-stroke" />
          {Array.from({ length: size - 1 }, (_, index) => {
            const column = selection.ok ? selection.cells[index + 1]!.rect.x : 0;
            const row = selection.ok ? selection.cells[(index + 1) * size]!.rect.y : 0;
            return <g key={index} className="puzzle-crop-grid"><line x1={column} y1={crop.y} x2={column} y2={crop.y + crop.height} vectorEffect="non-scaling-stroke" /><line x1={crop.x} y1={row} x2={crop.x + crop.width} y2={row} vectorEffect="non-scaling-stroke" /></g>;
          })}
        </svg>}
      </ButtonBase>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(["x", "y", "width", "height"] as const).map(key => <TextField key={key} fullWidth label={t(locale, `slidingPuzzle.screenshot.coordinates.${key}`)}
          value={fields[key]} onChange={event => onChange({ ...fields, [key]: event.target.value })}
          error={!selection.ok} slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 8 } }} />)}
      </div>
      {!selection.ok && <p role="alert" className="text-body-medium text-error">{t(locale, `slidingPuzzle.screenshot.${selection.code}`, { size })}</p>}
      <Button variant="outlined" onClick={() => onChange(fullPuzzleCropFields(image))}>{t(locale, "slidingPuzzle.screenshot.fullImage")}</Button>
    </div>
  );
}

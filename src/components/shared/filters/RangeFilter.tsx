import { useState } from "react";
import { FilterSection } from "@/components/shared/BaseFilters";

/** Keep in sync with `.mn-range-thumb` in components.css. */
const THUMB_SIZE = 18;

export type RangeValue = [number | null, number | null];

export interface RangeFilterProps {
  title?: string;
  /** Ends of the slider. */
  min: number;
  max: number;
  step?: number;
  /** Selected bounds; null leaves that side open, drawn at the slider's end. */
  value: readonly [number | null, number | null];
  /** Reports a bound dragged back to the slider's end as null. */
  onChange: (value: RangeValue) => void;
  /** Accessible names of the lower and the upper thumb. */
  minLabel: string;
  maxLabel: string;
  formatValue?: (value: number) => string;
  /** Title-row summary of the selection. */
  formatRange?: (low: string, high: string) => string;
  className?: string;
}

/** Two-thumb slider. The thumbs may pass each other; the range always reads from the lower to the higher one. */
export function RangeFilter({
  title,
  min,
  max,
  step = 1,
  value,
  onChange,
  minLabel,
  maxLabel,
  formatValue = String,
  formatRange = (low, high) => `${low} – ${high}`,
  className,
}: RangeFilterProps) {
  const clamp = (next: number) => Math.min(Math.max(next, min), max);
  const [a, b] = [clamp(value[0] ?? min), clamp(value[1] ?? max)];
  const [low, high] = a <= b ? [a, b] : [b, a];

  // Thumbs keep their identity while one is dragged past the other, so the positions live here.
  const [thumbs, setThumbs] = useState<[number, number]>([low, high]);
  const [synced, setSynced] = useState<[number, number]>([low, high]);
  let current = thumbs;
  if (synced[0] !== low || synced[1] !== high) {
    setSynced([low, high]);
    // Only an outside change (reset, restored filters) moves the thumbs; our own drags already match.
    if (Math.min(...thumbs) !== low || Math.max(...thumbs) !== high) {
      current = [low, high];
      setThumbs(current);
    }
  }

  const move = (index: 0 | 1, next: number) => {
    const moved: [number, number] = index === 0 ? [next, current[1]] : [current[0], next];
    setThumbs(moved);
    const [from, to] = [Math.min(...moved), Math.max(...moved)];
    onChange([from > min ? from : null, to < max ? to : null]);
  };

  // Native thumbs travel between half a thumb in from either edge.
  const fraction = (position: number) => (max > min ? (position - min) / (max - min) : 0);
  const fill = {
    left: `calc(${THUMB_SIZE / 2}px + (100% - ${THUMB_SIZE}px) * ${fraction(low)})`,
    width: `calc((100% - ${THUMB_SIZE}px) * ${fraction(high) - fraction(low)})`,
  };

  const slider = (
    <div className={`relative h-[18px] ${className ?? ""}`}>
      <div aria-hidden="true" className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--mn-cream-deep)]" />
      <div aria-hidden="true" className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-[var(--mn-accent)]" style={fill} />
      {current.map((position, index) => {
        const other = current[1 - index] ?? position;
        const isLower = position < other || (position === other && index === 0);
        return (
          <input
            key={index}
            type="range"
            min={min}
            max={max}
            step={step}
            value={position}
            onChange={(event) => move(index as 0 | 1, Number(event.target.value))}
            aria-label={isLower ? minLabel : maxLabel}
            aria-valuetext={formatValue(position)}
            className="mn-range-thumb"
          />
        );
      })}
    </div>
  );

  if (!title) return slider;

  return (
    <FilterSection
      title={title}
      aside={<span className="font-mono text-xs font-bold text-[var(--mn-text)]">{formatRange(formatValue(low), formatValue(high))}</span>}
    >
      {slider}
    </FilterSection>
  );
}

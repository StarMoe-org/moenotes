import Slider from "@mui/material/Slider";
import { FilterSection } from "@/components/shared/BaseFilters";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

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

/** Two-thumb range slider; a bound dragged back to the slider's end reads as null (open). */
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

  const slider = (
    <MdMuiProvider>
      <Slider
        className={className}
        value={[low, high]}
        min={min}
        max={max}
        step={step}
        onChange={(_event, next) => {
          const pair = Array.isArray(next) ? next : [next, next];
          const [from, to] = [Math.min(...pair), Math.max(...pair)];
          onChange([from > min ? from : null, to < max ? to : null]);
        }}
        getAriaLabel={(index: number) => (index === 0 ? minLabel : maxLabel)}
        getAriaValueText={(thumbValue: number) => formatValue(thumbValue)}
      />
    </MdMuiProvider>
  );

  if (!title) return slider;

  return (
    <FilterSection
      title={title}
      aside={<span className="font-mono text-xs font-bold text-[var(--md-sys-color-on-surface)]">{formatRange(formatValue(low), formatValue(high))}</span>}
    >
      {slider}
    </FilterSection>
  );
}

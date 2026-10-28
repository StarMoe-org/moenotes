"use client";

import { useId, type ReactNode } from "react";

export interface LevelSwitchProps {
  /** Visible label; also the group's / slider's accessible name. */
  label: string;
  value: number;
  /** Selectable values in order (levels, ranks, custom steps like [1, 10, 20, 50]). */
  options: readonly number[];
  /** Text of an option (default its number). */
  formatOption?: (option: number, index: number) => string;
  onChange: (value: number) => void;
  /**
   * - `segmented` (default): one button per option, for a few steps (training, awaken, skill level).
   * - `slider`: −/+ step buttons around a slider over the options, with the current value and an optional MAX button.
   */
  variant?: "segmented" | "slider";
  /** Slider only: value text at the end of the label row (default the formatted option). */
  formatValue?: (value: number, index: number) => ReactNode;
  /** Slider only: names of the step buttons. */
  decreaseLabel?: string;
  increaseLabel?: string;
  /** Slider only: text of a jump-to-last button; omitted when not given. */
  maxLabel?: string;
}

/** Index of `value` among `options`, or of the closest option when it is not one of them. */
export function levelIndex(options: readonly number[], value: number): number {
  const exact = options.indexOf(value);
  if (exact >= 0 || options.length === 0) return exact < 0 ? 0 : exact;
  let best = 0;
  options.forEach((option, index) => {
    if (Math.abs(option - value) < Math.abs((options[best] ?? option) - value)) best = index;
  });
  return best;
}

/** A tier switch over a list of values: M3 segmented buttons, or step buttons around an M3 slider. */
export default function LevelSwitch(props: LevelSwitchProps) {
  return props.variant === "slider" ? <SliderSwitch {...props} /> : <SegmentedSwitch {...props} />;
}

function SegmentedSwitch({ label, value, options, formatOption = String, onChange }: LevelSwitchProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-title-small text-on-surface-variant">{label}</span>
      <div role="group" aria-label={label} className="mn-level-switch md3-segmented">
        {options.map((option, index) => (
          <button key={option} type="button" onClick={() => onChange(option)} aria-pressed={value === option} className="md3-segment md3-state tabular-nums">
            {formatOption(option, index)}
          </button>
        ))}
      </div>
    </div>
  );
}

function SliderSwitch({ label, value, options, formatOption = String, formatValue, onChange, decreaseLabel, increaseLabel, maxLabel }: LevelSwitchProps) {
  const labelId = useId();
  const last = options.length - 1;
  const index = levelIndex(options, value);
  const progress = last > 0 ? (index / last) * 100 : 100;
  const pick = (next: number) => {
    const option = options[Math.min(Math.max(next, 0), last)];
    if (option !== undefined && option !== value) onChange(option);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span id={labelId} className="text-title-small text-on-surface-variant">{label}</span>
        <span className="text-label-large tabular-nums text-on-surface">{formatValue ? formatValue(value, index) : formatOption(options[index] ?? value, index)}</span>
      </div>
      <div className="flex items-center gap-2">
        <RoundButton label={decreaseLabel ?? ""} disabled={index <= 0} onClick={() => pick(index - 1)}>
          <path d="M5 12h14" />
        </RoundButton>
        <input
          type="range"
          min={0}
          max={Math.max(last, 0)}
          step={1}
          value={index}
          onChange={(event) => pick(Number(event.target.value))}
          aria-labelledby={labelId}
          aria-valuetext={formatOption(options[index] ?? value, index)}
          className="md3-range min-w-0 flex-1"
          style={{ "--md3-range-progress": `${progress}%` } as React.CSSProperties}
        />
        <RoundButton label={increaseLabel ?? ""} disabled={index >= last} onClick={() => pick(index + 1)}>
          <path d="M12 5v14M5 12h14" />
        </RoundButton>
        {maxLabel ? (
          <button type="button" disabled={index >= last} onClick={() => pick(last)} className="md3-button md3-button--text">
            {maxLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** M3 tonal icon button (40dp) for step controls. */
export function RoundButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="md3-icon-button md3-icon-button--tonal"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

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

/** A tier switch over a list of values: segmented buttons, or step buttons with a slider. */
export default function LevelSwitch(props: LevelSwitchProps) {
  return props.variant === "slider" ? <SliderSwitch {...props} /> : <SegmentedSwitch {...props} />;
}

function SegmentedSwitch({ label, value, options, formatOption = String, onChange }: LevelSwitchProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
      <span className="text-sm font-semibold text-[var(--mn-text-muted)]">{label}</span>
      <div role="group" aria-label={label} className="mn-level-switch flex flex-wrap gap-1 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-surface-strong)] p-1 shadow-[var(--mn-shadow-stamp-sm)]">
        {options.map((option, index) => (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            aria-pressed={value === option}
            className={`mn-focus min-w-9 rounded-xl px-2.5 py-1 font-mono text-xs font-medium transition ${
              value === option
                ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
                : "text-[var(--mn-text-muted)] hover:bg-[var(--mn-cream-deep)]"
            }`}
          >
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
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3 text-sm font-semibold">
        <span id={labelId} className="text-[var(--mn-text-muted)]">{label}</span>
        <span className="font-mono text-[var(--mn-text)]">{formatValue ? formatValue(value, index) : formatOption(options[index] ?? value, index)}</span>
      </div>
      <div className="flex items-center gap-2.5">
        <RoundButton label={decreaseLabel ?? ""} disabled={index <= 0} onClick={() => pick(index - 1)}>
          <path strokeLinecap="round" d="M5 12h14" />
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
          className="mn-focus h-1.5 min-w-0 flex-1 cursor-pointer appearance-none rounded-lg accent-[var(--mn-accent)]"
          style={{
            background: `linear-gradient(to right, var(--mn-accent) 0%, var(--mn-accent) ${progress}%, var(--mn-cream-deep) ${progress}%, var(--mn-cream-deep) 100%)`,
          }}
        />
        <RoundButton label={increaseLabel ?? ""} disabled={index >= last} onClick={() => pick(index + 1)}>
          <path strokeLinecap="round" d="M12 5v14M5 12h14" />
        </RoundButton>
        {maxLabel ? (
          <button
            type="button"
            disabled={index >= last}
            onClick={() => pick(last)}
            className="mn-focus shrink-0 rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-1 text-xs font-bold text-[var(--mn-accent-deep)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:bg-[var(--mn-accent-soft)] disabled:cursor-default disabled:opacity-40 disabled:hover:bg-[var(--mn-paper)]"
          >
            {maxLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function RoundButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="mn-focus grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:cursor-default disabled:opacity-40"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
        {children}
      </svg>
    </button>
  );
}

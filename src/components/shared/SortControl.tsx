import { useId } from "react";

export interface SortFieldOption {
  value: string;
  reverseValue: string;
  label: string;
  initialDirection: "asc" | "desc";
}

export interface SortControlProps {
  label: string;
  value: string;
  defaultOption: { value: string; label: string };
  options: readonly SortFieldOption[];
  ascendingLabel: string;
  descendingLabel: string;
  onChange: (value: string) => void;
}

export default function SortControl({ label, value, defaultOption, options, ascendingLabel, descendingLabel, onChange }: SortControlProps) {
  const id = useId();
  return <div className="mn-sort-control">
    <div id={id} className="mb-2 text-xs font-bold tracking-wider text-[var(--mn-text-muted)]">{label}</div>
    <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
      <button type="button" aria-pressed={value === defaultOption.value} onClick={() => onChange(defaultOption.value)} className="mn-focus mn-stamp-press mn-filter-chip border border-[var(--mn-border)] bg-[var(--mn-glass)] px-3 py-2 text-sm font-semibold text-[var(--mn-text)] transition-colors hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]">
        {defaultOption.label}
      </button>
      {options.map((option) => {
        const active = value === option.value || value === option.reverseValue;
        const direction = value === option.reverseValue
          ? option.initialDirection === "asc" ? "desc" : "asc"
          : option.initialDirection;
        const directionLabel = direction === "asc" ? ascendingLabel : descendingLabel;
        return <button key={option.value} type="button" aria-pressed={active} aria-label={active ? `${option.label}: ${directionLabel}` : option.label} onClick={() => onChange(value === option.value ? option.reverseValue : option.value)} className="mn-focus mn-stamp-press mn-filter-chip inline-flex items-center gap-1.5 border border-[var(--mn-border)] bg-[var(--mn-glass)] px-3 py-2 text-sm font-semibold text-[var(--mn-text)] transition-colors hover:border-[var(--mn-accent)] hover:bg-[var(--mn-accent-soft)]">
          <span>{option.label}</span>
          {active && <span aria-hidden="true" className="text-base leading-none text-[var(--mn-accent-deep)]">{direction === "asc" ? "↑" : "↓"}</span>}
        </button>;
      })}
    </div>
  </div>;
}

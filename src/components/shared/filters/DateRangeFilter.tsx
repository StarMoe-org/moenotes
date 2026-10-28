"use client";

import { useId } from "react";
import { FilterSection } from "@/components/shared/BaseFilters";
import type { DateRange } from "@/lib/filter/date-range";

export type { DateRange } from "@/lib/filter/date-range";

export interface DateRangeFilterProps {
  /** Section title; without one the bare inputs render (for custom layouts). */
  title?: string;
  value: DateRange;
  onChange: (value: DateRange) => void;
  /** Labels of the two inputs, e.g. t(locale, "filter.dateFrom") / t(locale, "filter.dateTo"). */
  fromLabel: string;
  toLabel: string;
  /** Clear button label; the button only shows while a side is set. */
  clearLabel?: string;
  /** Bounds of the pickers (`YYYY-MM-DD`). */
  min?: string;
  max?: string;
  className?: string;
}

const inputClass = "md3-text-field !h-12 !px-3 tabular-nums";

/** From/to day pickers as M3 outlined fields; filter entries with `inDateRange` from lib/filter/date-range. */
export function DateRangeFilter({ title, value, onChange, fromLabel, toLabel, clearLabel, min, max, className }: DateRangeFilterProps) {
  const id = useId();
  const from = value.from ?? "";
  const to = value.to ?? "";
  const active = Boolean(from || to);

  const inputs = (
    <div className={`grid grid-cols-2 gap-2 ${className ?? ""}`}>
      <label htmlFor={`${id}-from`} className="min-w-0">
        <span className="mb-1 block text-body-small text-on-surface-variant">{fromLabel}</span>
        <input id={`${id}-from`} type="date" value={from} min={min} max={to || max} onChange={(event) => onChange({ ...value, from: event.target.value || null })} className={inputClass} />
      </label>
      <label htmlFor={`${id}-to`} className="min-w-0">
        <span className="mb-1 block text-body-small text-on-surface-variant">{toLabel}</span>
        <input id={`${id}-to`} type="date" value={to} min={from || min} max={max} onChange={(event) => onChange({ ...value, to: event.target.value || null })} className={inputClass} />
      </label>
    </div>
  );

  if (!title) return inputs;

  return (
    <FilterSection
      title={title}
      aside={active && clearLabel ? (
        <button type="button" onClick={() => onChange({ from: null, to: null })} className="md3-button md3-button--text md3-button--small">
          {clearLabel}
        </button>
      ) : undefined}
    >
      {inputs}
    </FilterSection>
  );
}

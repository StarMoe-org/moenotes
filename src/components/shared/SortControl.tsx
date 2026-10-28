"use client";

import { useId } from "react";
import { Icon } from "@/components/shared/icons";

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

/**
 * Sort order as M3 filter chips: one chip per field; choosing the selected chip again flips its direction, shown by
 * the trailing arrow.
 */
export default function SortControl({ label, value, defaultOption, options, ascendingLabel, descendingLabel, onChange }: SortControlProps) {
  const id = useId();
  return (
    <div className="mn-sort-control">
      <div id={id} className="mb-2 text-title-small text-on-surface-variant">{label}</div>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={value === defaultOption.value} onClick={() => onChange(defaultOption.value)} className="md3-filter-chip md3-state">
          {value === defaultOption.value && <Icon name="check" className="h-[18px] w-[18px] shrink-0" />}
          {defaultOption.label}
        </button>
        {options.map((option) => {
          const active = value === option.value || value === option.reverseValue;
          const direction = value === option.reverseValue
            ? option.initialDirection === "asc" ? "desc" : "asc"
            : option.initialDirection;
          const directionLabel = direction === "asc" ? ascendingLabel : descendingLabel;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              aria-label={active ? `${option.label}: ${directionLabel}` : option.label}
              onClick={() => onChange(value === option.value ? option.reverseValue : option.value)}
              className="md3-filter-chip md3-state"
            >
              <span>{option.label}</span>
              {active && <Icon name="arrowUp" className={`h-[18px] w-[18px] shrink-0 transition-transform ${direction === "desc" ? "rotate-180" : ""}`} />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

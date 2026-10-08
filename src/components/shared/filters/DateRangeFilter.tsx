import { useId } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import { FilterSection } from "@/components/shared/BaseFilters";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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

/** From/to day pickers in the filter drawer's style; filter entries with `inDateRange` from lib/filter/date-range. */
export function DateRangeFilter({ title, value, onChange, fromLabel, toLabel, clearLabel, min, max, className }: DateRangeFilterProps) {
  const id = useId();
  const from = value.from ?? "";
  const to = value.to ?? "";
  const active = Boolean(from || to);

  const inputs = (
    <MdMuiProvider>
      <Box className={className} sx={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 1 }}>
        <Box component="label" htmlFor={`${id}-from`} sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ mb: 0.5, display: "block", fontSize: 11, fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>
            {fromLabel}
          </Box>
          <TextField
            id={`${id}-from`}
            type="date"
            size="small"
            fullWidth
            value={from}
            onChange={(event) => onChange({ ...value, from: event.target.value || null })}
            slotProps={{ htmlInput: { min, max: to || max } }}
          />
        </Box>
        <Box component="label" htmlFor={`${id}-to`} sx={{ minWidth: 0 }}>
          <Box component="span" sx={{ mb: 0.5, display: "block", fontSize: 11, fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>
            {toLabel}
          </Box>
          <TextField
            id={`${id}-to`}
            type="date"
            size="small"
            fullWidth
            value={to}
            onChange={(event) => onChange({ ...value, to: event.target.value || null })}
            slotProps={{ htmlInput: { min: from || min, max } }}
          />
        </Box>
      </Box>
    </MdMuiProvider>
  );

  if (!title) return inputs;

  return (
    <FilterSection
      title={title}
      aside={active && clearLabel ? (
        <Button size="small" onClick={() => onChange({ from: null, to: null })} sx={{ fontWeight: 700 }}>
          {clearLabel}
        </Button>
      ) : undefined}
    >
      {inputs}
    </FilterSection>
  );
}

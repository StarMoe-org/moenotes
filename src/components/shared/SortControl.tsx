import { useId } from "react";
import Box from "@mui/material/Box";
import ToggleButton from "@mui/material/ToggleButton";
import type { SxProps, Theme } from "@mui/material/styles";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

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

const chipSx: SxProps<Theme> = {
  borderRadius: 2,
  textTransform: "none",
  fontSize: 14,
  fontWeight: 600,
  gap: 0.75,
  px: 1.5,
  py: 1,
  border: "1px solid var(--md-sys-color-outline-variant)",
  color: "var(--md-sys-color-on-surface)",
  "&.Mui-selected": {
    bgcolor: "var(--md-sys-color-secondary-container)",
    color: "var(--md-sys-color-on-secondary-container)",
  },
  "&.Mui-selected:hover": {
    bgcolor: "var(--md-sys-color-secondary-container)",
  },
};

export default function SortControl({ label, value, defaultOption, options, ascendingLabel, descendingLabel, onChange }: SortControlProps) {
  const id = useId();
  return (
    <MdMuiProvider>
      <Box>
        <Box id={id} sx={{ mb: 1, fontSize: 12, fontWeight: 700, letterSpacing: "0.05em", color: "var(--md-sys-color-on-surface-variant)" }}>
          {label}
        </Box>
        <Box role="group" aria-labelledby={id} sx={{ display: "flex", flexWrap: "wrap", gap: 1 }}>
          <ToggleButton value={defaultOption.value} selected={value === defaultOption.value} onChange={() => onChange(defaultOption.value)} sx={chipSx}>
            {defaultOption.label}
          </ToggleButton>
          {options.map((option) => {
            const active = value === option.value || value === option.reverseValue;
            const direction = value === option.reverseValue
              ? option.initialDirection === "asc" ? "desc" : "asc"
              : option.initialDirection;
            const directionLabel = direction === "asc" ? ascendingLabel : descendingLabel;
            return (
              <ToggleButton
                key={option.value}
                value={option.value}
                selected={active}
                aria-label={active ? `${option.label}: ${directionLabel}` : option.label}
                onChange={() => onChange(value === option.value ? option.reverseValue : option.value)}
                sx={chipSx}
              >
                <span>{option.label}</span>
                {active && (direction === "asc"
                  ? <ArrowUpwardIcon fontSize="small" aria-hidden="true" />
                  : <ArrowDownwardIcon fontSize="small" aria-hidden="true" />)}
              </ToggleButton>
            );
          })}
        </Box>
      </Box>
    </MdMuiProvider>
  );
}

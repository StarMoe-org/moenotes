import { useId, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Slider from "@mui/material/Slider";
import ToggleButton from "@mui/material/ToggleButton";
import Typography from "@mui/material/Typography";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

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

const segmentSx: SxProps<Theme> = {
  borderRadius: 2,
  textTransform: "none",
  fontSize: 12,
  fontWeight: 700,
  fontVariantNumeric: "tabular-nums",
  minWidth: 36,
  px: 1.25,
  py: 0.5,
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
    <MdMuiProvider>
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", columnGap: 2, rowGap: 1 }}>
        <Typography variant="body2" sx={{ fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>{label}</Typography>
        <Box role="group" aria-label={label} sx={{ display: "flex", gap: 0.5 }}>
          {options.map((option, index) => (
            <ToggleButton
              key={option}
              value={option}
              selected={value === option}
              onChange={() => onChange(option)}
              sx={segmentSx}
            >
              {formatOption(option, index)}
            </ToggleButton>
          ))}
        </Box>
      </Box>
    </MdMuiProvider>
  );
}

function SliderSwitch({ label, value, options, formatOption = String, formatValue, onChange, decreaseLabel, increaseLabel, maxLabel }: LevelSwitchProps) {
  const labelId = useId();
  const last = options.length - 1;
  const index = levelIndex(options, value);
  const pick = (next: number) => {
    const option = options[Math.min(Math.max(next, 0), last)];
    if (option !== undefined && option !== value) onChange(option);
  };

  return (
    <MdMuiProvider>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5 }}>
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
          <Typography id={labelId} variant="body2" sx={{ fontWeight: 600, color: "var(--md-sys-color-on-surface-variant)" }}>{label}</Typography>
          <Typography variant="body2" sx={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "var(--md-sys-color-on-surface)" }}>{formatValue ? formatValue(value, index) : formatOption(options[index] ?? value, index)}</Typography>
        </Box>
        <Box sx={{ display: "flex", alignItems: "center", gap: 1.25 }}>
          <RoundButton label={decreaseLabel ?? ""} disabled={index <= 0} onClick={() => pick(index - 1)}>
            <path strokeLinecap="round" d="M5 12h14" />
          </RoundButton>
          <Slider
            min={0}
            max={Math.max(last, 0)}
            step={1}
            value={index}
            onChange={(_event, next) => pick(Array.isArray(next) ? next[0] ?? 0 : next)}
            aria-labelledby={labelId}
            getAriaValueText={(thumbValue) => formatOption(options[thumbValue] ?? value, thumbValue)}
            sx={{ flex: 1, minWidth: 0 }}
          />
          <RoundButton label={increaseLabel ?? ""} disabled={index >= last} onClick={() => pick(index + 1)}>
            <path strokeLinecap="round" d="M12 5v14M5 12h14" />
          </RoundButton>
          {maxLabel ? (
            <Button variant="outlined" size="small" disabled={index >= last} onClick={() => pick(last)} sx={{ flexShrink: 0 }}>
              {maxLabel}
            </Button>
          ) : null}
        </Box>
      </Box>
    </MdMuiProvider>
  );
}

export function RoundButton({ label, disabled, onClick, children }: { label: string; disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <MdMuiProvider>
      <IconButton
        aria-label={label}
        disabled={disabled}
        onClick={onClick}
        sx={{
          width: 32,
          height: 32,
          flexShrink: 0,
          borderRadius: 3,
          border: "1px solid var(--md-sys-color-outline-variant)",
          color: "var(--md-sys-color-on-surface-variant)",
        }}
      >
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
          {children}
        </svg>
      </IconButton>
    </MdMuiProvider>
  );
}

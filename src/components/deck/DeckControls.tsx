"use client";

import { useId, type ReactNode } from "react";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import { Icon } from "@/components/shared/icons";

const FIELD_SX = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "var(--md-sys-shape-corner-small)",
    backgroundColor: "var(--md-sys-color-surface)",
    fontSize: "var(--md-sys-typescale-body-medium-size)",
    lineHeight: "var(--md-sys-typescale-body-medium-line-height)",
    letterSpacing: "var(--md-sys-typescale-body-medium-tracking)",
  },
  "&& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    minHeight: 0,
    height: 40,
    boxSizing: "border-box",
    paddingBlock: 0,
    paddingLeft: "12px",
    paddingRight: "34px",
  },
  "& input[type=number]": {
    MozAppearance: "textfield",
  },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

const COMPACT_SELECT_SX = {
  "& .MuiOutlinedInput-root": {
    borderRadius: "var(--md-sys-shape-corner-small)",
    backgroundColor: "var(--md-sys-color-surface)",
    fontSize: "var(--md-sys-typescale-label-medium-size)",
    lineHeight: "var(--md-sys-typescale-label-medium-line-height)",
    fontWeight: 500,
  },
  "&& .MuiSelect-select": {
    display: "flex",
    alignItems: "center",
    minHeight: 0,
    height: 32,
    boxSizing: "border-box",
    paddingBlock: 0,
    paddingLeft: "10px",
    paddingRight: "28px",
  },
} as const;

const COMPACT_NUMBER_SX = {
  width: 128,
  maxWidth: "100%",
  "& .MuiOutlinedInput-root": {
    borderRadius: "var(--md-sys-shape-corner-small)",
    backgroundColor: "var(--md-sys-color-surface)",
    fontSize: "var(--md-sys-typescale-body-medium-size)",
    fontVariantNumeric: "tabular-nums",
  },
  "& .MuiOutlinedInput-input": {
    height: 36,
    boxSizing: "border-box",
    paddingBlock: 0,
    paddingInline: "10px",
    textAlign: "right",
    fontWeight: 500,
  },
  "& input[type=number]": {
    MozAppearance: "textfield",
  },
  "& input[type=number]::-webkit-outer-spin-button, & input[type=number]::-webkit-inner-spin-button": {
    WebkitAppearance: "none",
    margin: 0,
  },
} as const;

function SelectChevron({ className }: { className?: string }) {
  return (
    <Icon
      name="chevronDown"
      className={`${className ?? ""} pointer-events-none right-2.5 top-[calc(50%-9px)] h-[18px] w-[18px] text-on-surface-variant transition-transform`}
    />
  );
}

function CompactSelectChevron({ className }: { className?: string }) {
  return (
    <Icon
      name="chevronDown"
      className={`${className ?? ""} pointer-events-none right-1.5 top-[calc(50%-8px)] h-4 w-4 text-on-surface-variant transition-transform`}
    />
  );
}

export interface DeckSelectOption<T extends string | number> {
  value: T;
  label: ReactNode;
  disabled?: boolean | undefined;
}

export interface DeckSelectProps<T extends string | number> {
  label?: string | undefined;
  ariaLabel?: string | undefined;
  value: T;
  options: readonly DeckSelectOption<T>[];
  onChange: (value: T) => void;
  disabled?: boolean | undefined;
  compact?: boolean | undefined;
  className?: string | undefined;
}

export function DeckSelect<T extends string | number>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  className,
}: DeckSelectProps<T>) {
  const id = useId();
  const accessibleLabel = ariaLabel ?? label;
  const control = (
    <TextField
      id={id}
      select
      fullWidth={!compact}
      size="small"
      disabled={disabled}
      value={value}
      onChange={(event) => {
        const raw = event.target.value;
        const matched = options.find((option) => String(option.value) === String(raw));
        onChange(matched ? matched.value : (raw as T));
      }}
      sx={compact ? COMPACT_SELECT_SX : FIELD_SX}
      slotProps={{
        select: { IconComponent: compact ? CompactSelectChevron : SelectChevron },
        ...(accessibleLabel ? { htmlInput: { "aria-label": accessibleLabel } } : {}),
      }}
    >
      {options.map((option) => (
        <MenuItem key={String(option.value)} value={option.value} disabled={Boolean(option.disabled)}>
          {option.label}
        </MenuItem>
      ))}
    </TextField>
  );

  if (!label || compact) {
    return className ? <div className={className}>{control}</div> : control;
  }

  return (
    <div className={`dc-field ${className ?? ""}`.trim()}>
      <label htmlFor={id} className="dc-field-label">
        {label}
      </label>
      {control}
    </div>
  );
}

export interface DeckNumberFieldProps {
  label?: string | undefined;
  ariaLabel?: string | undefined;
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder?: string | undefined;
  min?: number | undefined;
  max?: number | undefined;
  step?: number | "any" | undefined;
  inputMode?: "numeric" | "decimal" | undefined;
  disabled?: boolean | undefined;
  error?: boolean | undefined;
  endAdornment?: ReactNode;
  compact?: boolean | undefined;
  className?: string | undefined;
}

export function DeckNumberField({
  label,
  ariaLabel,
  value,
  onChange,
  placeholder,
  min = 0,
  max,
  step,
  inputMode = "numeric",
  disabled = false,
  error = false,
  endAdornment,
  compact = false,
  className,
}: DeckNumberFieldProps) {
  const id = useId();
  const accessibleLabel = ariaLabel ?? label;
  const control = (
    <TextField
      id={id}
      fullWidth={!compact}
      size="small"
      type="number"
      disabled={disabled}
      error={error}
      placeholder={placeholder}
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))}
      sx={compact ? COMPACT_NUMBER_SX : FIELD_SX}
      slotProps={{
        ...(endAdornment
          ? { input: { endAdornment: <InputAdornment position="end">{endAdornment}</InputAdornment> } }
          : {}),
        htmlInput: {
          min,
          ...(max !== undefined ? { max } : {}),
          ...(step !== undefined ? { step } : {}),
          inputMode,
          ...(accessibleLabel ? { "aria-label": accessibleLabel } : {}),
        },
      }}
    />
  );

  if (!label || compact) {
    return className ? <div className={className}>{control}</div> : control;
  }

  return (
    <div className={`dc-field ${className ?? ""}`.trim()}>
      <label htmlFor={id} className="dc-field-label">
        {label}
      </label>
      {control}
    </div>
  );
}

export interface DeckSegmentOption<T extends string> {
  value: T;
  label: ReactNode;
  note?: ReactNode;
  disabled?: boolean | undefined;
}

export interface DeckSegmentedProps<T extends string> {
  label?: string | undefined;
  ariaLabel?: string | undefined;
  value: T;
  options: readonly DeckSegmentOption<T>[];
  onChange: (value: T) => void;
  size?: "small" | "medium" | undefined;
  fullWidth?: boolean | undefined;
  hint?: ReactNode;
  className?: string | undefined;
}

export function DeckSegmented<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  size = "medium",
  fullWidth = true,
  hint,
  className,
}: DeckSegmentedProps<T>) {
  const groupLabel = ariaLabel ?? label;
  const group = (
    <ToggleButtonGroup
      exclusive
      fullWidth={fullWidth}
      size={size}
      value={value}
      aria-label={groupLabel}
      onChange={(_, next: T | null) => {
        if (next !== null) onChange(next);
      }}
      className={`dc-segmented ${size === "small" ? "dc-segmented--small" : ""}`.trim()}
    >
      {options.map((option) => (
        <ToggleButton key={option.value} value={option.value} disabled={Boolean(option.disabled)}>
          <span className="dc-segment-content">
            <span>{option.label}</span>
            {option.note && <small>{option.note}</small>}
          </span>
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  );

  if (!label && !hint) {
    return className ? <div className={className}>{group}</div> : group;
  }

  return (
    <div className={`dc-field-group ${className ?? ""}`.trim()}>
      {label && <span className="dc-field-label">{label}</span>}
      {group}
      {hint && <p className="dc-field-hint">{hint}</p>}
    </div>
  );
}

export interface DeckSwitchRowProps {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  disabled?: boolean | undefined;
  onChange: (checked: boolean) => void;
}

export function DeckSwitchRow({ label, description, checked, disabled = false, onChange }: DeckSwitchRowProps) {
  return (
    <label className={`dc-switch-row md3-state ${disabled ? "is-disabled" : ""}`.trim()}>
      <span className="dc-switch-copy">
        <span className="dc-switch-title">{label}</span>
        {description && <small className="dc-switch-desc">{description}</small>}
      </span>
      <Switch
        checked={checked}
        disabled={disabled}
        onChange={(_, next) => onChange(next)}
      />
    </label>
  );
}

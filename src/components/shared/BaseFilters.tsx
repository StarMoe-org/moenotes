import SortControl, { type SortControlProps } from "./SortControl";
import { type ReactNode, useEffect, useId, useState, useRef, useCallback } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Collapse from "@mui/material/Collapse";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import FilterAltIcon from "@mui/icons-material/FilterAlt";
import RestartAltIcon from "@mui/icons-material/RestartAlt";
import SearchIcon from "@mui/icons-material/Search";
import { MdMuiProvider } from "@/components/md3/MuiProvider";

// Re-export for convenience
export { default as FilterButton } from "@/components/shared/FilterButton";
export type { FilterButtonProps } from "@/components/shared/FilterButton";
export * from "@/components/shared/filters";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BaseFiltersProps {
  /** Visual style: "plain" (flat for drawer) or "card" (standalone panel with own header/card, default: "plain") */
  variant?: "card" | "plain";
  sort?: SortControlProps;
  title?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchLabel?: string;
  searchPlaceholder?: string;
  resultCount?: number;
  totalCount?: number;
  hasActiveFilters?: boolean;
  onReset?: () => void;
  resetLabel?: string;
  expandLabel?: string;
  children: ReactNode;
  disableCollapse?: boolean;
}

export interface FilterSectionProps {
  title: string;
  /** Shown at the end of the title row, e.g. the current value. */
  aside?: ReactNode;
  children: ReactNode;
}

export interface FilterToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

// ── FilterSection ──────────────────────────────────────────────────────────────

export function FilterSection({ title, aside, children }: FilterSectionProps) {
  return (
    <Box>
      <Box sx={{ mb: 1, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1.5 }}>
        <Typography variant="overline" sx={{ fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>
          {title}
        </Typography>
        {aside}
      </Box>
      {children}
    </Box>
  );
}

// ── FilterToggle ───────────────────────────────────────────────────────────────

export function FilterToggle({ checked, onChange, label }: FilterToggleProps) {
  return (
    <FormControlLabel
      labelPlacement="start"
      sx={{ width: "100%", justifyContent: "space-between", ml: 0, py: 0.5 }}
      label={label}
      slotProps={{ typography: { sx: { fontSize: 14, fontWeight: 700 } } }}
      control={
        <Checkbox
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
        />
      }
    />
  );
}

// ── Search Input with IME composition guard ──────────────────────────────────

interface FilterSearchInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

function FilterSearchInput({ id, value, onChange, placeholder }: FilterSearchInputProps) {
  const [localValue, setLocalValue] = useState(value);
  const [prevValue, setPrevValue] = useState(value);
  const isComposingRef = useRef(false);

  if (value !== prevValue) {
    setPrevValue(value);
    setLocalValue(value);
  }

  const handleCompositionStart = useCallback(() => {
    isComposingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLInputElement>) => {
      isComposingRef.current = false;
      const nextValue = e.currentTarget.value;
      setLocalValue(nextValue);
      onChange(nextValue);
    },
    [onChange]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const nextValue = e.target.value;
      setLocalValue(nextValue);
      if (!isComposingRef.current) {
        onChange(nextValue);
      }
    },
    [onChange]
  );

  return (
    <TextField
      id={id}
      fullWidth
      size="small"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      slotProps={{
        input: {
          startAdornment: (
            <InputAdornment position="start">
              <SearchIcon fontSize="small" />
            </InputAdornment>
          ),
        },
        htmlInput: {
          onCompositionStart: handleCompositionStart,
          onCompositionEnd: handleCompositionEnd,
        },
      }}
    />
  );
}

// ── BaseFilters ────────────────────────────────────────────────────────────────

export default function BaseFilters({
  variant = "plain",
  sort,
  title = "Filter",
  searchValue,
  onSearchChange,
  searchLabel = "Search",
  searchPlaceholder,
  resultCount,
  totalCount,
  hasActiveFilters = false,
  onReset,
  resetLabel = "Reset",
  expandLabel = "Expand",
  children,
  disableCollapse = false,
}: BaseFiltersProps) {
  const [collapsed, setCollapsed] = useState(!disableCollapse);
  const [isDesktop, setIsDesktop] = useState(false);
  const contentId = useId();
  const isExpanded = disableCollapse || isDesktop || !collapsed;

  useEffect(() => {
    const query = window.matchMedia("(min-width: 1024px)");
    const handleChange = () => setIsDesktop(query.matches);

    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  // Shared inner controls: search, result counts, filter sections, reset button
  const filterControls = (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      {/* Search */}
      <Box>
        <label className="sr-only" htmlFor={`${contentId}-search`}>
          {searchLabel}
        </label>
        <FilterSearchInput
          id={`${contentId}-search`}
          placeholder={searchPlaceholder ?? "Search..."}
          value={searchValue}
          onChange={onSearchChange}
        />
      </Box>

      {/* Result Count & Reset summary */}
      {totalCount !== undefined && totalCount > 0 && (
        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 0.5 }}>
          <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
            {resultCount !== undefined && resultCount !== totalCount
              ? `${resultCount} / ${totalCount}`
              : `${totalCount}`}
          </Typography>
          {hasActiveFilters && onReset && (
            <Button size="small" onClick={onReset} sx={{ fontWeight: 700 }}>
              {resetLabel}
            </Button>
          )}
        </Box>
      )}

      {sort && <SortControl {...sort} />}

      {/* Custom Sections */}
      <Box sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 0.5 }}>{children}</Box>

      {/* Full Reset Button */}
      {hasActiveFilters && onReset && (
        <Button variant="outlined" fullWidth startIcon={<RestartAltIcon />} onClick={onReset} sx={{ mt: 2, fontWeight: 700 }}>
          {resetLabel}
        </Button>
      )}
    </Box>
  );

  return (
    <MdMuiProvider>
      {/* 1. Plain flat variant (Inside FilterDrawer) */}
      {variant === "plain" ? (
        <Box sx={{ width: "100%" }}>{filterControls}</Box>
      ) : (
        /* 2. Standalone Card variant (For in-page static layouts like DesignSystem) */
        <Card variant="outlined" sx={{ width: "100%", maxWidth: "100%", borderRadius: 6 }}>
          {/* Header */}
          <button
            type="button"
            className={`flex w-full ${!disableCollapse ? "cursor-pointer" : "cursor-default"} select-none items-center justify-between border-b border-[var(--md-sys-color-outline-variant)] px-4 sm:px-5 py-4 text-left lg:cursor-default text-[var(--md-sys-color-on-surface)]`}
            onClick={() => !disableCollapse && !isDesktop && setCollapsed((c) => !c)}
            disabled={disableCollapse}
            aria-expanded={isExpanded}
            aria-controls={contentId}
          >
            <span className="flex items-center gap-2 font-[var(--mn-font-display)] text-sm font-bold tracking-tight">
              <FilterAltIcon fontSize="small" className="text-[var(--md-sys-color-primary)]" />
              {title}
              {hasActiveFilters && collapsed && (
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--md-sys-color-primary)] lg:hidden" />
              )}
            </span>
            <span className="flex items-center gap-2">
              {totalCount !== undefined && (
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 700 }}>
                  {resultCount !== undefined && resultCount !== totalCount
                    ? `${resultCount} / ${totalCount}`
                    : `${totalCount ?? 0}`}
                </Typography>
              )}
              {!disableCollapse && (
                <ExpandMoreIcon
                  fontSize="small"
                  color="action"
                  className={`transition-transform duration-200 lg:hidden ${isExpanded ? "rotate-180" : ""}`}
                />
              )}
            </span>
          </button>

          {/* Collapsible content */}
          <Collapse in={isExpanded} timeout="auto">
            <Box id={contentId} sx={{ p: { xs: 2, sm: 2.5 } }}>{filterControls}</Box>
          </Collapse>

          {/* Expand hint bar (mobile only) */}
          {collapsed && !disableCollapse && (
            <button
              type="button"
              className="flex w-full cursor-pointer select-none items-center justify-center gap-1 border-t border-[var(--md-sys-color-outline-variant)] py-2.5 text-xs text-[var(--md-sys-color-on-surface-variant)] transition hover:bg-[color-mix(in_srgb,var(--md-sys-color-on-surface)_8%,transparent)] lg:hidden"
              onClick={() => setCollapsed(false)}
              aria-expanded={isExpanded}
              aria-controls={contentId}
            >
              <ExpandMoreIcon fontSize="small" />
              {expandLabel}
            </button>
          )}
        </Card>
      )}
    </MdMuiProvider>
  );
}

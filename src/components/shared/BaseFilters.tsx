import { type ReactNode, useEffect, useId, useState, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";

// Re-export for convenience
export { default as FilterButton } from "@/components/shared/FilterButton";
export type { FilterButtonProps } from "@/components/shared/FilterButton";
export * from "@/components/shared/filters";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BaseFiltersProps {
  /** Visual style: "plain" (flat for drawer) or "card" (standalone panel with own header/card, default: "plain") */
  variant?: "card" | "plain";
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
  children: ReactNode;
}

export interface FilterToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

// ── FilterSection ──────────────────────────────────────────────────────────────

export function FilterSection({ title, children }: FilterSectionProps) {
  return (
    <div>
      <span className="mb-2 block text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">
        {title}
      </span>
      {children}
    </div>
  );
}

// ── FilterToggle ───────────────────────────────────────────────────────────────

export function FilterToggle({ checked, onChange, label }: FilterToggleProps) {
  const { stampTapProps, springTransition } = useSpringAnimation();

  return (
    <motion.button
      type="button"
      onClick={() => onChange(!checked)}
      {...stampTapProps}
      transition={springTransition}
      className="flex w-full items-center justify-between rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-3 transition-colors hover:shadow-[var(--mn-shadow-stamp-sm)] cursor-pointer"
    >
      <span className={`text-sm font-bold ${checked ? "text-[var(--mn-text)]" : "text-[var(--mn-text-muted)]"}`}>
        {label}
      </span>
      <div
        className={`grid h-5 w-5 place-items-center rounded-full border-2 transition-colors ${
          checked
            ? "border-[var(--mn-accent)] bg-[var(--mn-accent)] shadow-[0_0_0_2px_color-mix(in_oklab,var(--mn-accent)_20%,transparent)]"
            : "border-[var(--mn-border)] bg-[var(--mn-surface)]"
        }`}
      >
        {checked && (
          <svg className="h-3 w-3 text-[var(--mn-bg)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        )}
      </div>
    </motion.button>
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
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const nextValue = e.target.value;
      setLocalValue(nextValue);
      if (!isComposingRef.current) {
        onChange(nextValue);
      }
    },
    [onChange]
  );

  return (
    <input
      id={id}
      type="text"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      className="w-full min-w-0 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 pl-11 pr-5 text-sm text-[var(--mn-text)] placeholder:text-[var(--mn-text-muted)] focus:border-[var(--mn-accent)] focus:bg-[var(--mn-paper)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--mn-accent)_20%,transparent)]"
    />
  );
}

// ── BaseFilters ────────────────────────────────────────────────────────────────

export default function BaseFilters({
  variant = "plain",
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
    <div className="space-y-4">
      {/* Search */}
      <div>
        <label className="sr-only" htmlFor={`${contentId}-search`}>
          {searchLabel}
        </label>
        <div className="relative">
          <svg
            className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mn-text-muted)] pointer-events-none"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <FilterSearchInput
            id={`${contentId}-search`}
            placeholder={searchPlaceholder ?? "Search..."}
            value={searchValue}
            onChange={onSearchChange}
          />
        </div>
      </div>

      {/* Result Count & Reset summary */}
      {totalCount !== undefined && totalCount > 0 && (
        <div className="flex items-center justify-between text-xs font-bold text-[var(--mn-text-muted)] px-1">
          <span>
            {resultCount !== undefined && resultCount !== totalCount
              ? `${resultCount} / ${totalCount}`
              : `${totalCount}`}
          </span>
          {hasActiveFilters && onReset && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-bold text-[var(--mn-accent)] hover:underline cursor-pointer"
            >
              {resetLabel}
            </button>
          )}
        </div>
      )}

      {/* Custom Sections */}
      <div className="space-y-4 pt-1">{children}</div>

      {/* Full Reset Button */}
      {hasActiveFilters && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="mn-stamp-press flex w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 text-sm font-bold text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)] cursor-pointer mt-4"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {resetLabel}
        </button>
      )}
    </div>
  );

  // 1. Plain flat variant (Inside FilterDrawer)
  if (variant === "plain") {
    return <div className="w-full">{filterControls}</div>;
  }

  // 2. Standalone Card variant (For in-page static layouts like DesignSystem)
  return (
    <div className="w-full max-w-full rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
      {/* Header */}
      <button
        type="button"
        className={`flex w-full ${!disableCollapse ? "cursor-pointer" : "cursor-default"} select-none items-center justify-between rounded-t-[22px] border-b-2 border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_10%,transparent)] to-transparent px-4 sm:px-5 py-4 text-left lg:cursor-default`}
        onClick={() => !disableCollapse && !isDesktop && setCollapsed((c) => !c)}
        disabled={disableCollapse}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <span className="flex items-center gap-2 font-[var(--mn-font-display)] text-sm font-bold tracking-tight text-[var(--mn-text)]">
          <svg className="h-5 w-5 text-[var(--mn-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          {title}
          {hasActiveFilters && collapsed && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--mn-accent)] lg:hidden" />
          )}
        </span>
        <span className="flex items-center gap-2">
          {totalCount !== undefined && (
            <span className="text-xs font-bold text-[var(--mn-text-muted)]">
              {resultCount !== undefined && resultCount !== totalCount
                ? `${resultCount} / ${totalCount}`
                : `${totalCount ?? 0}`}
            </span>
          )}
          {!disableCollapse && (
            <svg
              className={`h-4 w-4 text-[var(--mn-text-muted)] transition-transform duration-200 lg:hidden ${isExpanded ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </span>
      </button>

      {/* Collapsible content */}
      <div id={contentId} className={isExpanded ? "block" : "hidden"}>
        <div className="p-4 sm:p-5">{filterControls}</div>
      </div>

      {/* Expand hint bar (mobile only) */}
      {collapsed && !disableCollapse && (
        <button
          type="button"
          className="flex w-full cursor-pointer select-none items-center justify-center gap-1 rounded-b-[22px] border-t-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 text-xs text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)] lg:hidden"
          onClick={() => setCollapsed(false)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          {expandLabel}
        </button>
      )}
    </div>
  );
}

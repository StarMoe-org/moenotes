import { type ReactNode, useState } from "react";
import { motion } from "framer-motion";
import { useSpringAnimation } from "@/lib/animation/use-animation";

// Re-export for convenience
export { default as FilterButton } from "@/components/shared/FilterButton";
export type { FilterButtonProps } from "@/components/shared/FilterButton";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BaseFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  resultCount?: number;
  totalCount?: number;
  hasActiveFilters?: boolean;
  onReset?: () => void;
  children: ReactNode;
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
      <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-[var(--mn-text-muted)]">
        {title}
      </label>
      {children}
    </div>
  );
}

// ── FilterToggle ───────────────────────────────────────────────────────────────

export function FilterToggle({ checked, onChange, label }: FilterToggleProps) {
  // Square toggle → stamp animation (shadow press effect)
  const { stampTapProps, springTransition } = useSpringAnimation();

  return (
    <motion.button
      onClick={() => onChange(!checked)}
      {...stampTapProps}
      transition={springTransition}
      className="flex w-full items-center justify-between rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-3 transition-colors hover:shadow-[var(--mn-shadow-stamp-sm)]"
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

// ── BaseFilters ────────────────────────────────────────────────────────────────

export default function BaseFilters({
  searchValue,
  onSearchChange,
  searchPlaceholder,
  resultCount,
  totalCount,
  hasActiveFilters = false,
  onReset,
  children,
}: BaseFiltersProps) {
  const [collapsed, setCollapsed] = useState(true);

  return (
    <div className="overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
      {/* Header */}
      <div
        className="flex cursor-pointer select-none items-center justify-between border-b-2 border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_10%,transparent)] to-transparent px-5 py-4 lg:cursor-default"
        onClick={() => setCollapsed((c) => !c)}
      >
        <h2 className="flex items-center gap-2 font-[var(--mn-font-display)] text-sm tracking-tight text-[var(--mn-text)]">
          <svg className="h-5 w-5 text-[var(--mn-accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          Filter
          {hasActiveFilters && collapsed && (
            <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--mn-accent)] lg:hidden" />
          )}
        </h2>
        <div className="flex items-center gap-2">
          {totalCount !== undefined && (
            <span className="text-xs font-bold text-[var(--mn-text-muted)]">
              {resultCount !== undefined && resultCount !== totalCount
                ? `${resultCount} / ${totalCount}`
                : `${totalCount ?? 0}`}
            </span>
          )}
          <svg
            className={`h-4 w-4 text-[var(--mn-text-muted)] transition-transform duration-200 lg:hidden ${collapsed ? "" : "rotate-180"}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Search — always visible */}
      <div className="px-5 pt-4">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--mn-text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder={searchPlaceholder ?? "Search..."}
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 pl-11 pr-5 text-sm text-[var(--mn-text)] placeholder:text-[var(--mn-text-muted)] focus:border-[var(--mn-accent)] focus:bg-[var(--mn-paper)] focus:outline-none focus:ring-2 focus:ring-[color-mix(in_oklab,var(--mn-accent)_20%,transparent)]"
          />
        </div>
      </div>

      {/* Collapsible content */}
      <div className={`${collapsed ? "hidden" : "block"} lg:!block`}>
        <div className="space-y-5 p-5">
          {children}

          {/* Reset */}
          {hasActiveFilters && onReset && (
            <button
              onClick={onReset}
              className="flex w-full items-center justify-center gap-2 rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 text-sm font-medium text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)]"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Expand hint bar (mobile only) */}
      {collapsed && (
        <div
          className="flex cursor-pointer select-none items-center justify-center gap-1 border-t-2 border-[var(--mn-border)] bg-[var(--mn-surface)] py-2.5 text-xs text-[var(--mn-text-muted)] transition hover:bg-[var(--mn-cream-deep)] hover:text-[var(--mn-text)] lg:hidden"
          onClick={() => setCollapsed(false)}
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
          Expand
        </div>
      )}
    </div>
  );
}

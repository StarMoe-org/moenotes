"use client";

import SortControl, { type SortControlProps } from "./SortControl";
import { type ReactNode, useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@/components/shared/icons";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

// Re-export for convenience
export { default as FilterButton } from "@/components/shared/FilterButton";
export type { FilterButtonProps } from "@/components/shared/FilterButton";
export * from "@/components/shared/filters";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface BaseFiltersProps {
  /** Visual style: "plain" (flat for drawer) or "card" (standalone panel with own header/card, default: "plain") */
  variant?: "card" | "plain";
  /** Names the result count ("67 entries", "12 of 67"); without it the count shows bare numbers. */
  locale?: AppLocale;
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

/** A titled group of filter controls (M3 title-small label). */
export function FilterSection({ title, aside, children }: FilterSectionProps) {
  return (
    <div>
      <div className="mb-2 flex min-h-6 items-center justify-between gap-3">
        <span className="block text-title-small text-on-surface-variant">{title}</span>
        {aside}
      </div>
      {children}
    </div>
  );
}

// ── FilterToggle ───────────────────────────────────────────────────────────────

/** A labelled on/off filter: an M3 list row with a trailing switch (the whole row toggles). */
export function FilterToggle({ checked, onChange, label }: FilterToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="md3-state flex min-h-14 w-full items-center justify-between gap-4 rounded-shape-md px-4 text-left text-body-large text-on-surface"
    >
      <span className="min-w-0">{label}</span>
      <span aria-hidden="true" className={`md3-switch ${checked ? "md3-switch--on" : ""}`}>
        <span className="md3-switch__thumb">{checked && <Icon name="check" className="h-4 w-4" strokeWidth={2.5} />}</span>
      </span>
    </button>
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
      type="search"
      placeholder={placeholder}
      value={localValue}
      onChange={handleChange}
      onCompositionStart={handleCompositionStart}
      onCompositionEnd={handleCompositionEnd}
      className="md3-text-field md3-search-field !h-12 !pl-12 !pr-4"
    />
  );
}

// ── BaseFilters ────────────────────────────────────────────────────────────────

/** The filter panel of an explorer page: search bar, result count, sort, the page's sections and a reset button. */
export default function BaseFilters({
  variant = "plain",
  locale,
  sort,
  title = "",
  searchValue,
  onSearchChange,
  searchLabel = "",
  searchPlaceholder,
  resultCount,
  totalCount,
  hasActiveFilters = false,
  onReset,
  resetLabel = "",
  expandLabel = "",
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

  const filtering = resultCount !== undefined && resultCount !== totalCount;
  const count = totalCount === undefined ? null
    : locale ? t(locale, filtering ? "filter.count" : "filter.total", { filtered: resultCount ?? totalCount, total: totalCount })
    : filtering ? `${resultCount} / ${totalCount}` : `${totalCount}`;

  const filterControls = (
    <div className="space-y-5">
      <div className="relative">
        <label className="sr-only" htmlFor={`${contentId}-search`}>{searchLabel || searchPlaceholder}</label>
        <Icon name="search" className="pointer-events-none absolute left-4 top-1/2 h-6 w-6 -translate-y-1/2 text-on-surface-variant" />
        <FilterSearchInput id={`${contentId}-search`} placeholder={searchPlaceholder ?? searchLabel} value={searchValue} onChange={onSearchChange} />
      </div>

      {totalCount !== undefined && totalCount > 0 && (
        <div className="flex min-h-10 items-center justify-between gap-3 px-1" aria-live="polite">
          <span className="text-label-large text-on-surface-variant">{count}</span>
          {hasActiveFilters && onReset && (
            <button type="button" onClick={onReset} className="md3-button md3-button--text">
              {resetLabel}
            </button>
          )}
        </div>
      )}

      {sort && <SortControl {...sort} />}

      <div className="space-y-5">{children}</div>

      {hasActiveFilters && onReset && (
        <button type="button" onClick={onReset} className="md3-button md3-button--outlined w-full">
          <Icon name="close" className="" />
          {resetLabel}
        </button>
      )}
    </div>
  );

  if (variant === "plain") {
    return <div className="w-full">{filterControls}</div>;
  }

  // Standalone card (dialogs, in-page pickers): an outlined M3 card that folds below 1024px.
  return (
    <div className="w-full max-w-full overflow-hidden rounded-shape-md border border-outline-variant bg-surface">
      <button
        type="button"
        className={`md3-state flex min-h-14 w-full select-none items-center justify-between gap-3 px-4 text-left ${disableCollapse ? "cursor-default" : "lg:cursor-default"}`}
        onClick={() => !disableCollapse && !isDesktop && setCollapsed((value) => !value)}
        disabled={disableCollapse}
        aria-expanded={isExpanded}
        aria-controls={contentId}
      >
        <span className="flex min-w-0 items-center gap-3 text-title-medium text-on-surface">
          <Icon name="filter" className="h-6 w-6 shrink-0 text-on-surface-variant" />
          <span className="truncate">{title}</span>
          {hasActiveFilters && collapsed && <span className="h-2 w-2 shrink-0 rounded-full bg-primary lg:hidden" />}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {count !== null && <span className="text-label-large text-on-surface-variant">{count}</span>}
          {!disableCollapse && <Icon name="chevronDown" className={`h-6 w-6 text-on-surface-variant transition-transform duration-200 lg:hidden ${isExpanded ? "rotate-180" : ""}`} />}
        </span>
      </button>

      <div id={contentId} className={isExpanded ? "block border-t border-outline-variant" : "hidden"}>
        <div className="p-4 sm:p-5">{filterControls}</div>
      </div>

      {collapsed && !disableCollapse && (
        <button
          type="button"
          className="md3-state flex min-h-10 w-full items-center justify-center gap-1 border-t border-outline-variant text-label-large text-primary lg:hidden"
          onClick={() => setCollapsed(false)}
          aria-expanded={isExpanded}
          aria-controls={contentId}
        >
          <Icon name="chevronDown" className="h-[18px] w-[18px]" />
          {expandLabel}
        </button>
      )}
    </div>
  );
}

import { useMemo, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";

export interface DataTableColumn<T> {
  /** Unique column id; also the sort key reported by `onSortChange`. */
  key: string;
  header: ReactNode;
  /** Cell content (defaults to `row[key]` as text). */
  render?: (row: T, index: number) => ReactNode;
  /** Makes the column sortable: the value rows are ordered by (null/undefined always last). */
  sortValue?: (row: T) => number | string | null | undefined;
  /** First direction when the header is clicked (default `asc`; numeric columns default to `desc`). */
  initialDirection?: "asc" | "desc";
  align?: "left" | "center" | "right";
  /** Tabular monospace figures, right-aligned unless `align` says otherwise. */
  numeric?: boolean;
  /** CSS width (e.g. "6rem", 120). */
  width?: string | number;
  /** Stick to the left edge while the table scrolls sideways (the identity column). */
  sticky?: boolean;
  /** Extra classes for this column's cells. */
  className?: string;
}

export interface DataTableSort {
  key: string;
  direction: "asc" | "desc";
}

export interface DataTableProps<T> {
  /** Text collation for sorting and the spoken sort direction (sorting.ascending / sorting.descending). */
  locale?: AppLocale;
  columns: readonly DataTableColumn<T>[];
  rows: readonly T[];
  rowKey: (row: T, index: number) => string | number;
  /** Controlled sort state; leave both unset for internal state. Null means source order. */
  sort?: DataTableSort | null;
  onSortChange?: (sort: DataTableSort | null) => void;
  /**
   * With a controlled `sort`, whether the table orders `rows` itself (default true). Pass false when the caller already
   * sorts (e.g. through useListSort + sortEntries) and the headers only reflect and change that state.
   */
  sortRows?: boolean;
  /** Table's accessible caption (visually hidden). */
  caption?: string;
  /** Shown instead of the table when `rows` is empty. */
  empty?: ReactNode;
  /** Makes the whole row open a link; the first column's content is wrapped in a real anchor for keyboards and readers. */
  rowHref?: (row: T) => string | undefined;
  onRowClick?: (row: T, event: MouseEvent<HTMLTableRowElement>) => void;
  /** Sticky header offset from the top of the scroll container (default 0). */
  stickyTop?: string | number;
  /** Max height of the scroll area; the header then sticks inside it. Without it the area only scrolls sideways. */
  maxHeight?: string | number;
  /** Spoken sort direction on the active header button, e.g. t(locale, "sorting.ascending"); `aria-sort` is always set. */
  ascendingLabel?: string;
  descendingLabel?: string;
  className?: string;
  dense?: boolean;
}

const alignClass = { left: "text-left", center: "text-center", right: "text-right" } as const;

function cellAlign<T>(column: DataTableColumn<T>): "left" | "center" | "right" {
  return column.align ?? (column.numeric ? "right" : "left");
}

function sizeStyle(width: string | number | undefined): CSSProperties | undefined {
  return width === undefined ? undefined : { width, minWidth: width };
}

/** Rows ordered by a column's sortValue; missing values last in either direction, ties keep source order. */
export function sortTableRows<T>(rows: readonly T[], columns: readonly DataTableColumn<T>[], sort: DataTableSort | null, locale?: string): T[] {
  const column = sort ? columns.find((entry) => entry.key === sort.key) : undefined;
  if (!sort || !column?.sortValue) return [...rows];
  const read = column.sortValue;
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = sort.direction === "desc" ? -1 : 1;
  return rows
    .map((row, index) => ({ row, index, value: read(row) }))
    .sort((a, b) => {
      const av = a.value, bv = b.value;
      const aMissing = av === null || av === undefined || av === "", bMissing = bv === null || bv === undefined || bv === "";
      if (aMissing || bMissing) return aMissing === bMissing ? a.index - b.index : aMissing ? 1 : -1;
      const compared = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
      return compared * direction || a.index - b.index;
    })
    .map((entry) => entry.row);
}

/** The next sort after clicking a header: first direction, the other one, then back to source order. */
export function nextTableSort<T>(column: DataTableColumn<T>, current: DataTableSort | null): DataTableSort | null {
  const first = column.initialDirection ?? (column.numeric ? "desc" : "asc");
  if (!current || current.key !== column.key) return { key: column.key, direction: first };
  if (current.direction === first) return { key: column.key, direction: first === "asc" ? "desc" : "asc" };
  return null;
}

/**
 * Configurable data table: sticky header, sticky identity column, sortable headers (controlled or internal), tabular
 * numbers, sideways scrolling on narrow screens, an empty slot and optional whole-row links.
 */
export default function DataTable<T>({
  locale,
  columns,
  rows,
  rowKey,
  sort: controlledSort,
  onSortChange,
  sortRows = true,
  caption,
  empty,
  rowHref,
  onRowClick,
  stickyTop = 0,
  maxHeight,
  ascendingLabel,
  descendingLabel,
  className = "",
  dense = false,
}: DataTableProps<T>) {
  const [internalSort, setInternalSort] = useState<DataTableSort | null>(null);
  const controlled = controlledSort !== undefined;
  const sort = controlled ? controlledSort : internalSort;
  const ordered = useMemo(
    () => (controlled && !sortRows ? [...rows] : sortTableRows(rows, columns, sort, locale)),
    [controlled, sortRows, rows, columns, sort, locale],
  );

  if (rows.length === 0) return <>{empty ?? null}</>;

  const ascending = ascendingLabel ?? (locale ? t(locale, "sorting.ascending") : undefined);
  const descending = descendingLabel ?? (locale ? t(locale, "sorting.descending") : undefined);

  const changeSort = (column: DataTableColumn<T>) => {
    const next = nextTableSort(column, sort);
    if (!controlled) setInternalSort(next);
    onSortChange?.(next);
  };
  const cellPad = dense ? "px-2.5 py-1.5" : "px-3 py-2.5";
  const stickyCell = "sticky left-0 z-[1] bg-[var(--mn-paper)] shadow-[1px_0_0_var(--mn-border)]";

  const openRow = (row: T, event: MouseEvent<HTMLTableRowElement>) => {
    onRowClick?.(row, event);
    const href = rowHref?.(row);
    if (!href || event.defaultPrevented) return;
    // Clicks on the anchor itself (or any other control) keep their own behaviour.
    if ((event.target as Element).closest("a,button,input,select,textarea,label")) return;
    if (window.getSelection()?.toString()) return;
    if (event.metaKey || event.ctrlKey || event.button === 1) window.open(href, "_blank", "noopener");
    else window.location.assign(href);
  };

  return (
    <div
      className={`mn-data-table relative w-full overflow-x-auto rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-paper)] ${maxHeight !== undefined ? "overflow-y-auto" : ""} ${className}`}
      style={maxHeight !== undefined ? { maxHeight } : undefined}
    >
      <table className="w-full border-separate border-spacing-0 text-sm">
        {caption ? <caption className="sr-only">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => {
              const active = sort?.key === column.key;
              const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : column.sortValue ? "none" : undefined;
              const align = cellAlign(column);
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={ariaSort}
                  style={{ ...sizeStyle(column.width), top: stickyTop }}
                  className={`sticky z-[2] whitespace-nowrap border-b border-[var(--mn-border)] bg-[var(--mn-surface-strong)] ${cellPad} text-xs font-bold uppercase tracking-wide text-[var(--mn-text-muted)] ${alignClass[align]} ${column.sticky ? "left-0 z-[3] shadow-[1px_0_0_var(--mn-border)]" : ""}`}
                >
                  {column.sortValue ? (
                    <button
                      type="button"
                      onClick={() => changeSort(column)}
                      className={`mn-focus inline-flex items-center gap-1 rounded-md uppercase transition hover:text-[var(--mn-text)] ${active ? "text-[var(--mn-accent-deep)]" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
                      aria-label={active && typeof column.header === "string" && ascending && descending ? `${column.header}: ${sort!.direction === "asc" ? ascending : descending}` : undefined}
                    >
                      <span>{column.header}</span>
                      <span aria-hidden="true" className={`text-sm leading-none ${active ? "" : "opacity-30"}`}>
                        {active ? (sort!.direction === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  ) : column.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {ordered.map((row, index) => {
            const href = rowHref?.(row);
            const clickable = Boolean(href || onRowClick);
            return (
              <tr
                key={rowKey(row, index)}
                onClick={clickable ? (event) => openRow(row, event) : undefined}
                onAuxClick={href ? (event) => { if (event.button === 1) openRow(row, event); } : undefined}
                className={`group ${clickable ? "cursor-pointer" : ""}`}
              >
                {columns.map((column, columnIndex) => {
                  const content = column.render ? column.render(row, index) : String((row as Record<string, unknown>)[column.key] ?? "");
                  const align = cellAlign(column);
                  const linked = href && columnIndex === 0;
                  const Cell = columnIndex === 0 ? "th" : "td";
                  return (
                    <Cell
                      key={column.key}
                      scope={columnIndex === 0 ? "row" : undefined}
                      style={sizeStyle(column.width)}
                      className={`border-b border-[var(--mn-border)]/50 ${cellPad} align-middle font-medium text-[var(--mn-text)] transition-colors group-last:border-b-0 ${clickable ? "group-hover:bg-[var(--mn-cream-deep)]" : ""} ${alignClass[align]} ${column.numeric ? "font-mono tabular-nums whitespace-nowrap" : ""} ${column.sticky ? stickyCell : ""} ${column.className ?? ""}`}
                    >
                      {linked ? (
                        <a href={href} className="mn-focus rounded-sm hover:text-[var(--mn-accent-deep)]">
                          {content}
                        </a>
                      ) : content}
                    </Cell>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

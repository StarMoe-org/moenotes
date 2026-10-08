import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Link from "@mui/material/Link";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import UnfoldMoreIcon from "@mui/icons-material/UnfoldMore";
import type { SxProps, Theme } from "@mui/material/styles";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
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

function cellAlign<T>(column: DataTableColumn<T>): "left" | "center" | "right" {
  return column.align ?? (column.numeric ? "right" : "left");
}

function sizeStyle(width: string | number | undefined): { width?: string | number; minWidth?: string | number } {
  return width === undefined ? {} : { width, minWidth: width };
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
    <MdMuiProvider>
      <TableContainer
        className={className}
        sx={{
          borderRadius: 4,
          border: "1px solid var(--md-sys-color-outline-variant)",
          bgcolor: "var(--md-sys-color-surface)",
          ...(maxHeight !== undefined ? { maxHeight } : {}),
        }}
      >
        <Table
          size={dense ? "small" : "medium"}
          sx={{
            borderCollapse: "separate",
            borderSpacing: 0,
            "& .MuiTableCell-root": { borderColor: "var(--md-sys-color-outline-variant)" },
            "& .MuiTableRow-root:last-child .MuiTableCell-root": { borderBottom: "none" },
          }}
        >
          {caption ? <caption className="sr-only">{caption}</caption> : null}
          <TableHead>
            <TableRow>
              {columns.map((column) => {
                const active = sort?.key === column.key;
                const ariaSort = active ? (sort!.direction === "asc" ? "ascending" : "descending") : column.sortValue ? "none" : undefined;
                const align = cellAlign(column);
                return (
                  <TableCell
                    key={column.key}
                    component="th"
                    scope="col"
                    aria-sort={ariaSort}
                    align={align}
                    sx={{
                      ...sizeStyle(column.width),
                      position: "sticky",
                      top: stickyTop,
                      ...(column.sticky ? { left: 0, zIndex: 3, boxShadow: "1px 0 0 var(--md-sys-color-outline-variant)" } : { zIndex: 2 }),
                      bgcolor: "var(--md-sys-color-surface-container-high)",
                      whiteSpace: "nowrap",
                      fontSize: 12,
                      fontWeight: 700,
                      textTransform: "uppercase",
                      letterSpacing: "0.05em",
                      color: "var(--md-sys-color-on-surface-variant)",
                    }}
                  >
                    {column.sortValue ? (
                      <button
                        type="button"
                        onClick={() => changeSort(column)}
                        className={`inline-flex cursor-pointer items-center gap-1 rounded-md border-0 bg-transparent p-0 text-xs font-bold uppercase tracking-wide transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] hover:text-[var(--md-sys-color-on-surface)] ${active ? "text-[var(--md-sys-color-primary)]" : ""} ${align === "right" ? "flex-row-reverse" : ""}`}
                        aria-label={active && typeof column.header === "string" && ascending && descending ? `${column.header}: ${sort!.direction === "asc" ? ascending : descending}` : undefined}
                      >
                        <span>{column.header}</span>
                        <span aria-hidden="true" className={`inline-flex leading-none ${active ? "" : "opacity-30"}`}>
                          {active ? (
                            sort!.direction === "asc" ? <ArrowUpwardIcon sx={{ fontSize: 14 }} /> : <ArrowDownwardIcon sx={{ fontSize: 14 }} />
                          ) : (
                            <UnfoldMoreIcon sx={{ fontSize: 14 }} />
                          )}
                        </span>
                      </button>
                    ) : column.header}
                  </TableCell>
                );
              })}
            </TableRow>
          </TableHead>
          <TableBody>
            {ordered.map((row, index) => {
              const href = rowHref?.(row);
              const clickable = Boolean(href || onRowClick);
              return (
                <TableRow
                  key={rowKey(row, index)}
                  hover={clickable}
                  onClick={clickable ? (event) => openRow(row, event) : undefined}
                  onAuxClick={href ? (event) => { if (event.button === 1) openRow(row, event); } : undefined}
                  sx={clickable ? { cursor: "pointer" } : undefined}
                >
                  {columns.map((column, columnIndex) => {
                    const content = column.render ? column.render(row, index) : String((row as Record<string, unknown>)[column.key] ?? "");
                    const align = cellAlign(column);
                    const linked = href && columnIndex === 0;
                    const cellSx: SxProps<Theme> = {
                      ...sizeStyle(column.width),
                      fontWeight: 500,
                      verticalAlign: "middle",
                      ...(column.numeric ? { fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" } : {}),
                      ...(column.sticky ? {
                        position: "sticky",
                        left: 0,
                        zIndex: 1,
                        bgcolor: "var(--md-sys-color-surface)",
                        boxShadow: "1px 0 0 var(--md-sys-color-outline-variant)",
                      } : {}),
                    };
                    return columnIndex === 0 ? (
                      <TableCell key={column.key} component="th" scope="row" align={align} className={column.className} sx={cellSx}>
                        {linked ? (
                          <Link href={href} underline="hover" sx={{ color: "inherit", "&:hover": { color: "var(--md-sys-color-primary)" } }}>
                            {content}
                          </Link>
                        ) : content}
                      </TableCell>
                    ) : (
                      <TableCell key={column.key} align={align} className={column.className} sx={cellSx}>
                        {content}
                      </TableCell>
                    );
                  })}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </MdMuiProvider>
  );
}

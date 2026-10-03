import { parseMasterDate } from "@/lib/schedule";

export const listSortKeys = ["default", "idAsc", "idDesc", "nameAsc", "nameDesc", "dateDesc", "dateAsc", "rarityDesc", "rarityAsc", "endingSoon"] as const;
export type BuiltinListSort = typeof listSortKeys[number];
/** A custom numeric field (BPM, a stat, a duration…): `field:<key>:asc|desc`, see {@link numericSortValue}. */
export type NumericListSort = `field:${string}:${"asc" | "desc"}`;
export type ListSort = BuiltinListSort | NumericListSort;
export interface SortableEntry { id: number | string; name?: string; title?: string; startAt?: string; endAt?: string; rarity?: number }

export interface SortEntriesOptions<T> {
  /** Reference time for `endingSoon` (defaults to Date.now()). */
  now?: number;
  /** Readers for custom numeric fields by key; without one the key is read off the entry (a dotted path is followed). */
  numeric?: Readonly<Record<string, (item: T) => number | null | undefined>>;
}

/** The sort value of a custom numeric field. */
export function numericSortValue(key: string, direction: "asc" | "desc"): NumericListSort {
  return `field:${key}:${direction}`;
}

const NUMERIC_SORT = /^field:(.+):(asc|desc)$/;

/** The key and direction of a custom numeric sort, or null for a built-in one. */
export function parseNumericSort(sort: string): { key: string; direction: "asc" | "desc" } | null {
  const match = sort.match(NUMERIC_SORT);
  return match ? { key: match[1]!, direction: match[2] as "asc" | "desc" } : null;
}

/** Whether a value names a sort `sortEntries` understands. */
export function isListSort(value: string | null | undefined): value is ListSort {
  if (!value) return false;
  return (listSortKeys as readonly string[]).includes(value) || parseNumericSort(value) !== null;
}

function readPath(item: unknown, key: string): number | undefined {
  let value: unknown = item;
  for (const part of key.split(".")) {
    if (value === null || typeof value !== "object") return undefined;
    value = (value as Record<string, unknown>)[part];
  }
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

// MasterData time, with the offset a server's tables may carry; other date strings as the browser reads them.
function parseDate(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const date = parseMasterDate(value) ?? Date.parse(value);
  return Number.isFinite(date) ? date : undefined;
}

/**
 * `endingSoon` rank: ongoing entries first by end time (open-ended ones after them), then upcoming ones by start time,
 * then ended ones, most recently ended first. Entries with neither date come last.
 */
function endingSoonKey(item: SortableEntry, now: number): [number, number] {
  const start = parseDate(item.startAt);
  const end = parseDate(item.endAt);
  if (start === undefined && end === undefined) return [4, 0];
  if (start !== undefined && now < start) return [2, start];
  if (end === undefined) return [1, start ?? 0];
  return now <= end ? [0, end] : [3, -end];
}

export function sortEntries<T extends SortableEntry>(items: readonly T[], sort: ListSort, locale: string, options: SortEntriesOptions<T> = {}): T[] {
  if (sort === "default") return [...items];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const byId = (a: T, b: T) => collator.compare(String(a.id), String(b.id));

  if (sort === "endingSoon") {
    const now = options.now ?? Date.now();
    const keys = new Map(items.map((item) => [item, endingSoonKey(item, now)]));
    return [...items].sort((a, b) => {
      const [ag, av] = keys.get(a)!, [bg, bv] = keys.get(b)!;
      return ag - bg || av - bv || byId(a, b);
    });
  }

  const numeric = parseNumericSort(sort);
  const direction = numeric ? (numeric.direction === "desc" ? -1 : 1) : sort.endsWith("Desc") ? -1 : 1;
  const value = (item: T): number | string | undefined => {
    if (numeric) {
      const read = options.numeric?.[numeric.key];
      const result = read ? read(item) : readPath(item, numeric.key);
      return typeof result === "number" && Number.isFinite(result) ? result : undefined;
    }
    if (sort.startsWith("name")) return item.title || item.name || undefined;
    if (sort.startsWith("rarity")) return item.rarity;
    if (sort.startsWith("date")) return parseDate(item.startAt);
    return item.id;
  };
  return [...items].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Missing values always follow real values, in either direction.
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? 1 : -1;
    const compared = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
    return compared * direction || byId(a, b);
  });
}

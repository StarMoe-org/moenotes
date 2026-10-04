import type { DataTableSort } from "@/components/shared/DataTable";
import { numericSortValue, parseNumericSort, type ListSort } from "@/lib/filter/list-sort";
import type { NumericSortField } from "@/lib/filter/use-list-sort";

/*
 * The card lists' sort: date and rarity (built in), plus numeric fields for the three stats, their total and the skill
 * (by name). The table view's headers show and change the same sort, so the views never disagree.
 */

export const CARD_SORT_FIELDS: readonly NumericSortField[] = [
  { key: "performance", labelKey: "cards.parameters.performance" },
  { key: "technique", labelKey: "cards.parameters.technique" },
  { key: "visual", labelKey: "cards.parameters.visual" },
  { key: "total", labelKey: "cards.sort.total" },
  { key: "skill", labelKey: "cards.sort.skill", initialDirection: "asc" },
];

/** Readers of a card's stats (max-level values, as the view models carry them). */
export interface CardStats {
  performancePower: number;
  technicPower: number;
  visualPower: number;
  totalPower: number;
}

/**
 * Sort readers for CARD_SORT_FIELDS. The skill sort orders skills by name in the locale's collation (each skill's rank
 * among the names), so cards with the same skill sit together.
 */
export function cardSortReaders<T extends CardStats>(skillName: (card: T) => string, names: readonly string[], locale: string): Record<string, (card: T) => number | null> {
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const rank = new Map([...new Set(names.filter(Boolean))].sort(collator.compare).map((name, index) => [name, index]));
  return {
    performance: (card) => card.performancePower,
    technique: (card) => card.technicPower,
    visual: (card) => card.visualPower,
    total: (card) => card.totalPower,
    skill: (card) => rank.get(skillName(card)) ?? null,
  };
}

/** Table column keys the built-in sorts map to. */
const BUILTIN_COLUMNS: Record<string, string> = { id: "id", name: "title", date: "startAt", rarity: "rarity" };

/** The table header state of a list sort (null for the default order and sorts no column shows). */
export function tableSortOf(sort: ListSort): DataTableSort | null {
  if (sort === "default" || sort === "endingSoon") return null;
  const numeric = parseNumericSort(sort);
  if (numeric) return { key: numeric.key, direction: numeric.direction };
  const match = sort.match(/^(id|name|date|rarity)(Asc|Desc)$/);
  if (!match) return null;
  return { key: BUILTIN_COLUMNS[match[1]!]!, direction: match[2] === "Asc" ? "asc" : "desc" };
}

/** The list sort a table header click asks for. */
export function listSortOf(sort: DataTableSort | null): ListSort {
  if (!sort) return "default";
  const suffix = sort.direction === "asc" ? "Asc" : "Desc";
  const builtin = Object.entries(BUILTIN_COLUMNS).find(([, column]) => column === sort.key)?.[0];
  return builtin ? `${builtin}${suffix}` as ListSort : numericSortValue(sort.key, sort.direction);
}

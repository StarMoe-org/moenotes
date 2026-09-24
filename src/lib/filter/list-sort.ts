export const listSortKeys = ["default", "idAsc", "idDesc", "nameAsc", "nameDesc", "dateDesc", "dateAsc", "rarityDesc", "rarityAsc"] as const;
export type ListSort = typeof listSortKeys[number];
export interface SortableEntry { id: number | string; name?: string; title?: string; startAt?: string; rarity?: number }
export function sortEntries<T extends SortableEntry>(items: readonly T[], sort: ListSort, locale: string): T[] {
  if (sort === "default") return [...items];
  const collator = new Intl.Collator(locale, { numeric: true, sensitivity: "base" });
  const direction = sort.endsWith("Desc") ? -1 : 1;
  const value = (item: T): number | string | undefined => {
    if (sort.startsWith("name")) return item.title || item.name || undefined;
    if (sort.startsWith("rarity")) return item.rarity;
    if (sort.startsWith("date")) { const date = Date.parse(item.startAt || ""); return Number.isFinite(date) ? date : undefined; }
    return item.id;
  };
  return [...items].sort((a, b) => {
    const av = value(a), bv = value(b);
    // Missing values always follow real values, in either direction.
    if (av === undefined || bv === undefined) return av === bv ? 0 : av === undefined ? 1 : -1;
    const compared = typeof av === "number" && typeof bv === "number" ? av - bv : collator.compare(String(av), String(bv));
    return compared * direction || collator.compare(String(a.id), String(b.id));
  });
}

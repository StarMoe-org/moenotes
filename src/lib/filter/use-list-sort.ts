import { useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { SortFieldOption } from "@/components/shared/SortControl";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { isListSort, numericSortValue, parseNumericSort, type ListSort } from "./list-sort";

/** A custom numeric sort field offered next to the built-in ones. */
export interface NumericSortField {
  /** Entry field (or dotted path) to sort by; also the key a `sortEntries` `numeric` reader is registered under. */
  key: string;
  /** i18n key of the option's label. */
  labelKey: string;
  /** Direction of the first click (default `desc`: biggest first). */
  initialDirection?: "asc" | "desc";
}

export interface ListSortOptions {
  numeric?: readonly NumericSortField[];
}

/**
 * Sort state of a list page, remembered per tab (session storage). `fields` opts into the built-in fields: `date`,
 * `rarity`, `endingSoon` (any separator: "date,rarity", "date rarity"). `options.numeric` adds custom numeric fields.
 */
export function useListSort(page: string, locale: AppLocale, fields = "", options: ListSortOptions = {}) {
  const [value, setValue] = useState<ListSort>("default");
  const numeric = options.numeric ?? [];
  const numericKeys = numeric.map((field) => field.key).join("\n");
  const storageKey = `moenotes:sort:${page}`;
  const isAllowed = useMemo(() => {
    const keys = new Set(numericKeys ? numericKeys.split("\n") : []);
    return (candidate: string | null | undefined): candidate is ListSort => {
      if (!isListSort(candidate)) return false;
      const custom = parseNumericSort(candidate);
      if (custom) return keys.has(custom.key);
      if (candidate.startsWith("date")) return fields.includes("date");
      if (candidate.startsWith("rarity")) return fields.includes("rarity");
      if (candidate === "endingSoon") return fields.includes("endingSoon");
      return true;
    };
  }, [fields, numericKeys]);
  useEffect(() => {
    const saved = safeGetSessionStorage(storageKey);
    setValue(isAllowed(saved) ? saved : "default");
  }, [storageKey, isAllowed]);
  const onChange = (next: string) => {
    const valid = isAllowed(next) ? next : "default";
    setValue(valid);
    safeSetSessionStorage(storageKey, valid);
  };
  const sortOptions: SortFieldOption[] = [
    { value: "idAsc", reverseValue: "idDesc", label: t(locale, "sorting.id"), initialDirection: "asc" },
    { value: "nameAsc", reverseValue: "nameDesc", label: t(locale, "sorting.name"), initialDirection: "asc" },
    ...(fields.includes("date") ? [{ value: "dateDesc", reverseValue: "dateAsc", label: t(locale, "sorting.date"), initialDirection: "desc" as const }] : []),
    ...(fields.includes("rarity") ? [{ value: "rarityDesc", reverseValue: "rarityAsc", label: t(locale, "sorting.rarity"), initialDirection: "desc" as const }] : []),
    // One-way: the same value both ways, so a second click keeps it. SortControl reads an active value equal to
    // reverseValue as the flipped direction, hence "desc" here to show the ascending arrow (soonest end first).
    ...(fields.includes("endingSoon") ? [{ value: "endingSoon", reverseValue: "endingSoon", label: t(locale, "sorting.endingSoon"), initialDirection: "desc" as const }] : []),
    ...numeric.map((field): SortFieldOption => {
      const first = field.initialDirection ?? "desc";
      return {
        value: numericSortValue(field.key, first),
        reverseValue: numericSortValue(field.key, first === "desc" ? "asc" : "desc"),
        label: t(locale, field.labelKey),
        initialDirection: first,
      };
    }),
  ];
  return { value, onChange, label: t(locale, "filter.sort"), defaultOption: { value: "default", label: t(locale, "sorting.default") }, options: sortOptions, ascendingLabel: t(locale, "sorting.ascending"), descendingLabel: t(locale, "sorting.descending") };
}

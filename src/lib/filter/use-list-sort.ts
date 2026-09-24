import { useEffect, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import type { SortFieldOption } from "@/components/shared/SortControl";
import { safeGetSessionStorage, safeSetSessionStorage } from "@/lib/storage/safe-storage";
import { listSortKeys, type ListSort } from "./list-sort";

export function useListSort(page: string, locale: AppLocale, fields = "") {
  const [value, setValue] = useState<ListSort>("default");
  const allowed = listSortKeys.filter((key) => (!key.startsWith("date") || fields.includes("date")) && (!key.startsWith("rarity") || fields.includes("rarity")));
  const storageKey = `moenotes:sort:${page}`;
  useEffect(() => {
    const saved = safeGetSessionStorage(storageKey);
    setValue(listSortKeys.includes(saved as ListSort) && (!saved?.startsWith("date") || fields.includes("date")) && (!saved?.startsWith("rarity") || fields.includes("rarity")) ? saved as ListSort : "default");
  }, [storageKey, fields]);
  const onChange = (next: string) => {
    const valid = allowed.includes(next as ListSort) ? next as ListSort : "default";
    setValue(valid);
    safeSetSessionStorage(storageKey, valid);
  };
  const options: SortFieldOption[] = [
    { value: "idAsc", reverseValue: "idDesc", label: t(locale, "sorting.id"), initialDirection: "asc" },
    { value: "nameAsc", reverseValue: "nameDesc", label: t(locale, "sorting.name"), initialDirection: "asc" },
    ...(fields.includes("date") ? [{ value: "dateDesc", reverseValue: "dateAsc", label: t(locale, "sorting.date"), initialDirection: "desc" as const }] : []),
    ...(fields.includes("rarity") ? [{ value: "rarityDesc", reverseValue: "rarityAsc", label: t(locale, "sorting.rarity"), initialDirection: "desc" as const }] : []),
  ];
  return { value, onChange, label: t(locale, "filter.sort"), defaultOption: { value: "default", label: t(locale, "sorting.default") }, options, ascendingLabel: t(locale, "sorting.ascending"), descendingLabel: t(locale, "sorting.descending") };
}

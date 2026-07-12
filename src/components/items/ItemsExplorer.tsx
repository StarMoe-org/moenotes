import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { FilterSection } from "@/components/shared/BaseFilters";
import QuickFilterButton from "@/components/shared/QuickFilterButton";
import Popover from "@/components/shared/Popover";
import { fetchMasterData } from "@/lib/masterdata/client";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  normalizeItems,
  validateMasterTable,
  type ItemViewModel,
  type RawItem,
} from "@/lib/items/data";
import type { RawText } from "@/lib/cards/data";
import { getItemIconUrl } from "@/lib/items/assets";

interface Props {
  locale: AppLocale;
}

const displayGroups = [0, 1, 2, 3];

export default function ItemsExplorer({ locale }: Props) {
  const memory = useListPageMemory("items");
  const remembered = parseRememberedFilters(memory.state?.filtersHash);
  const [items, setItems] = useState<ItemViewModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState(remembered.query);
  const [selectedGroups, setSelectedGroups] = useState<number[]>(remembered.groups);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(false);

    void Promise.all([
      fetchMasterData("MasterItem.json", { validate: validateMasterTable<RawItem> }),
      fetchMasterData("MasterText.json", { validate: validateMasterTable<RawText> }),
    ])
      .then(([itemTable, textTable]) => {
        if (!active) return;
        setItems(normalizeItems(itemTable._allData, textTable._allData, locale));
      })
      .catch((err) => {
        console.error("Failed to load item data:", err);
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [locale, reloadKey]);

  useEffect(() => {
    if (loading || !memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;

    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });

    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [loading, memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    const filtersHash = JSON.stringify({
      query,
      groups: selectedGroups,
    });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedGroups, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (selectedGroups.length > 0 && !selectedGroups.includes(item.group)) return false;
      return !needle || item.searchText.includes(needle);
    });
  }, [items, query, selectedGroups]);

  const hasActiveFilters = Boolean(query) || selectedGroups.length > 0;

  const toggleFilter = (list: number[], setList: (next: number[]) => void, value: number) => {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  };

  const resetFilters = () => {
    setQuery("");
    setSelectedGroups([]);
    memory.clearState();
  };

  const filters = (disableCollapse: boolean) => (
    <BaseFilters
      title={t(locale, "items.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "items.searchPlaceholder")}
      resultCount={filteredItems.length}
      totalCount={items.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
      disableCollapse={disableCollapse}
    >
      <FilterSection title={t(locale, "nav.items.items")}>
        <div className="relative mt-2">
          <Popover
            matchTriggerWidth
            trigger={({ ref, onClick, ...aria }) => (
              <button
                ref={ref as React.Ref<HTMLButtonElement>}
                type="button"
                className="mn-stamp-press flex w-full items-center justify-between rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] px-5 py-2.5 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)] cursor-pointer"
                onClick={onClick}
                {...aria}
              >
                {selectedGroups.length === 0 ? t(locale, "items.allGroups") : t(locale, `items.groups.${selectedGroups[0]}`)}
                <svg className="h-4 w-4 shrink-0 text-[var(--mn-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>
            )}
          >
            {({ close: closePopover }) => (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  className={`text-left block w-full rounded-full px-4 py-2 text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] cursor-pointer ${selectedGroups.length === 0 ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                  onClick={() => {
                    setSelectedGroups([]);
                    closePopover();
                  }}
                >
                  {t(locale, "items.allGroups")}
                </button>
                {displayGroups.map((value) => (
                  <button
                    key={value}
                    type="button"
                    className={`text-left block w-full rounded-full px-4 py-2 text-sm font-bold transition hover:bg-[var(--mn-cream-deep)] cursor-pointer ${selectedGroups.includes(value) ? "bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"}`}
                    onClick={() => {
                      setSelectedGroups([value]);
                      closePopover();
                    }}
                  >
                    {t(locale, `items.groups.${value}`)}
                  </button>
                ))}
              </div>
            )}
          </Popover>
        </div>
      </FilterSection>
    </BaseFilters>
  );

  return (
    <>
      <div className="mb-6 lg:hidden">{filters(false)}</div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="sticky top-24 hidden min-w-0 lg:block">{filters(true)}</aside>
        <section className="min-w-0" aria-live="polite">
          {loading ? (
            <LoadingGrid label={t(locale, "items.loading")} />
          ) : error ? (
            <ErrorState locale={locale} onRetry={() => setReloadKey((value) => value + 1)} />
          ) : filteredItems.length === 0 ? (
            <EmptyState locale={locale} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
              {filteredItems.map((item) => (
                <ItemCardItem key={item.id} item={item} locale={locale} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="lg:hidden">
        <QuickFilterButton
          title={t(locale, "items.filterTitle")}
          buttonLabel={t(locale, "items.quickFilter")}
          content={<div className="min-w-0">{filters(true)}</div>}
        />
      </div>
    </>
  );
}

function ItemCardItem({ item, locale }: { item: ItemViewModel; locale: AppLocale }) {
  const [failed, setFailed] = useState(false);
  const source = getItemIconUrl(item.imagePath);

  const handleImageError = () => {
    setFailed(true);
  };

  return (
    <div
      className="group flex flex-col min-w-0 overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={item.id}
    >
      <div className="relative aspect-square overflow-hidden bg-[var(--mn-cream-deep)] flex items-center justify-center p-4">
        {!failed ? (
          <img
            className="h-full w-full object-contain max-h-20 max-w-20 transition group-hover:scale-105"
            src={source}
            alt={item.name}
            loading="lazy"
            onError={handleImageError}
          />
        ) : (
          <div className="grid h-full place-items-center text-center text-xs font-semibold text-[var(--mn-text-muted)]">
            {item.name}
          </div>
        )}
      </div>
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]" title={item.name}>
            {item.name}
          </h3>
          <p className="mt-1.5 line-clamp-3 text-xs font-medium text-[var(--mn-text-muted)] leading-relaxed min-h-[3rem]" title={item.desc}>
            {item.desc}
          </p>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/30 text-[11px] font-semibold text-[var(--mn-text-muted)]/80">
          <span>ID #{item.id}</span>
          <span className="bg-[var(--mn-cream-deep)] px-2.5 py-0.5 rounded-full border border-[var(--mn-border)] text-[10px]">
            {t(locale, `items.groups.${item.group}`)}
          </span>
        </div>
      </div>
    </div>
  );
}

function LoadingGrid({ label }: { label: string }) {
  return (
    <div>
      <p className="sr-only">{label}</p>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
        {Array.from({ length: 12 }, (_, index) => (
          <div key={index} className="overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]">
            <div className="aspect-square animate-pulse bg-[var(--mn-cream-deep)]" />
            <div className="space-y-2 p-4">
              <div className="h-4 animate-pulse rounded-full bg-[var(--mn-cream-deep)]" />
              <div className="h-3 w-2/3 animate-pulse rounded-full bg-[var(--mn-cream-deep)]" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ErrorState({ locale, onRetry }: { locale: AppLocale; onRetry: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12" role="alert">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "items.loadErrorTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "items.loadErrorDescription")}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-3 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
      >
        {t(locale, "items.retry")}
      </button>
    </div>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "items.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "items.emptyDescription")}</p>
      <button
        type="button"
        onClick={onReset}
        className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
      >
        {t(locale, "items.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = {
    query: "",
    groups: [] as number[],
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: parsed.query || "",
      groups: Array.isArray(parsed.groups) ? parsed.groups : [],
    };
  } catch {
    return fallback;
  }
}

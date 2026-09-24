import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import type { BackgroundViewModel } from "@/lib/backgrounds/data";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialBackgrounds: BackgroundViewModel[];
}

export default function BackgroundsExplorer({ locale, initialBackgrounds }: Props) {
  const memory = useListPageMemory("backgrounds");
  const [backgrounds] = useState(initialBackgrounds);
  const [query, setQuery] = useState("");
  const sort = useListSort("backgrounds", locale);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [preview, setPreview] = useState<BackgroundViewModel | null>(null);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedTypes(remembered.types);
  }, [memory.state?.filtersHash]);

  useEffect(() => {
    if (!memory.state?.scrollY) return;
    const targetY = memory.state.scrollY;
    const handle = window.requestAnimationFrame(() => {
      window.scrollTo({ top: targetY });
    });
    return () => {
      window.cancelAnimationFrame(handle);
    };
  }, [memory.state?.scrollY]);

  const saveCurrentState = useCallback(() => {
    memory.saveState({ scrollY: window.scrollY, filtersHash: JSON.stringify({ query, types: selectedTypes }) });
  }, [query, selectedTypes, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const types = useMemo(() => [...new Set(backgrounds.map((background) => background.type))].sort((a, b) => a - b), [backgrounds]);
  const filteredBackgrounds = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return backgrounds.filter((background) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(background.type)) return false;
      return !needle || background.searchText.includes(needle);
    });
  }, [backgrounds, query, selectedTypes]);
  const sortedBackgrounds = useMemo(() => sortEntries(filteredBackgrounds, sort.value, locale), [filteredBackgrounds, sort.value, locale]);
  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedTypes.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedTypes([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "backgrounds.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "backgrounds.searchPlaceholder")}
      resultCount={filteredBackgrounds.length}
      totalCount={backgrounds.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "backgrounds.type")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedTypes.length === 0} onClick={() => setSelectedTypes([])}>ALL</FilterButton>
          {types.map((type) => (
            <FilterButton key={type} active={selectedTypes.includes(type)} onClick={() => setSelectedTypes((current) => toggleArrayItem(current, type))}>
              {t(locale, `backgrounds.types.${type}`) || `#${type}`}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
    </BaseFilters>
  );

  useQuickFilter(t(locale, "backgrounds.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedTypes,
    hasActiveFilters,
    filteredBackgrounds.length,
    backgrounds.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {filteredBackgrounds.length === 0 ? (
        <div className="mn-paper p-8 text-center sm:p-12">
          <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "backgrounds.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "backgrounds.emptyDescription")}</p>
          <button type="button" onClick={resetFilters} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "backgrounds.reset")}
          </button>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 4xl:grid-cols-5">
          {sortedBackgrounds.map((background) => (
            <button
              key={background.id}
              type="button"
              onClick={() => setPreview(background)}
              data-list-item-id={background.id}
              aria-label={t(locale, "backgrounds.openPreview", { name: background.name })}
              className="mn-list-card group flex min-w-0 flex-col overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
            >
              <span className="relative block aspect-video overflow-hidden border-b border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)]">
                <img className="h-full w-full object-cover transition duration-300 group-hover:scale-105" src={background.thumbnailUrl} alt="" loading="lazy" decoding="async" />
              </span>
              <span className="flex items-center justify-between gap-3 p-3">
                <span className="min-w-0 truncate text-sm font-black text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{background.name}</span>
                <span className="shrink-0 rounded-full border border-[var(--mn-glass-border)] px-2 py-0.5 text-[10px] font-bold text-[var(--mn-text-muted)]">{t(locale, `backgrounds.types.${background.type}`)}</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={preview !== null}
        onClose={() => setPreview(null)}
        title={preview?.name ?? ""}
        closeLabel={t(locale, "actions.close")}
        size="xl"
        headerActions={preview && (
          <a href={preview.imageUrl} target="_blank" rel="noopener noreferrer" className="mn-focus rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-3 py-1.5 text-xs font-bold text-[var(--mn-accent-deep)] hover:bg-[var(--mn-accent-soft)]">
            {t(locale, "backgrounds.openOriginal")}
          </a>
        )}
      >
        {preview && (
          <div className="space-y-3">
            <img className="w-full rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] object-contain" src={preview.imageUrl} alt={preview.name} />
            {preview.description && <p className="text-sm text-[var(--mn-text-muted)]">{preview.description}</p>}
          </div>
        )}
      </Modal>
    </section>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", types: [] as number[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      types: Array.isArray(parsed.types) ? parsed.types : [],
    };
  } catch {
    return fallback;
  }
}

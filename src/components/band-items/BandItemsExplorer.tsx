import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import BaseFilters, { BandFilter } from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { BandItemViewModel } from "@/lib/band-items/data";
import { describeBandItemEffect } from "@/lib/band-items/assets";

interface Props {
  locale: AppLocale;
  initialItems: ServerFaceted<BandItemViewModel>[];
  servers: GameServer[];
  initialBandNames: Array<[number, string]>;
}

export default function BandItemsExplorer({ locale, servers, initialItems, initialBandNames }: Props) {
  const memory = useListPageMemory("band-items");
  const { server, pickServer, items } = useServerList(locale, servers, initialItems);
  const [query, setQuery] = useState("");
  const sort = useListSort("band-items", locale, "");
  const [selectedBands, setSelectedBands] = useState<number[]>([]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedBands(remembered.bands);
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
    const filtersHash = JSON.stringify({ query, bands: selectedBands });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedBands, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const bandNamesMap = useMemo(() => new Map(initialBandNames), [initialBandNames]);

  const bands = useMemo(() => {
    const values = new Set<number>();
    items.forEach((item) => values.add(item.bandId));
    return [...values].sort((a, b) => a - b);
  }, [items]);

  const filteredItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return items.filter((item) => {
      if (selectedBands.length > 0 && !selectedBands.includes(item.bandId)) return false;
      return !needle || item.searchText.includes(needle);
    });
  }, [items, query, selectedBands]);

  const sortedEntries = useMemo(() => sortEntries(filteredItems, sort.value, locale), [filteredItems, sort.value, locale]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedBands.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedBands([]);
    memory.clearState();
  };

  const handleBandToggle = (bandId: number) => {
    setSelectedBands((current) => (current.includes(bandId) ? current.filter((id) => id !== bandId) : [...current, bandId]));
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "bandItems.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "bandItems.searchPlaceholder")}
      resultCount={filteredItems.length}
      totalCount={items.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <BandFilter
        title={t(locale, "cards.band")}
        bands={bands}
        selectedBands={selectedBands}
        getBandName={(id) => bandNamesMap.get(id) || `Band ${id}`}
        onToggle={handleBandToggle}
        onReset={() => setSelectedBands([])}
      />
    </BaseFilters>
  );

  useQuickFilter(t(locale, "bandItems.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedBands,
    bands,
    hasActiveFilters,
    filteredItems.length,
    items.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <section className="min-w-0" aria-live="polite">
        {filteredItems.length === 0 ? (
          <EmptyState locale={locale} onReset={resetFilters} />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {sortedEntries.map((item) => (
              <BandItemCard key={item.id} item={item} locale={locale} />
            ))}
          </div>
        )}
      </section>
    </ServerScope>
  );
}

function BandItemCard({ item, locale }: { item: BandItemViewModel; locale: AppLocale }) {
  const [level, setLevel] = useState(item.maxLevel);
  const effect = item.skillEffects.find((entry) => entry.level === level) ?? item.skillEffects.at(-1) ?? null;
  const effectText = effect ? describeBandItemEffect(item.description, effect.value) : "";
  const maxLevel = item.maxLevel;

  return (
    <div
      className="mn-list-card group flex flex-col min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={item.id}
    >
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="min-w-0">
          <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]" title={item.name}>
            {item.name}
          </h3>
          <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--mn-text-muted)]/80" title={item.bandName}>
            {item.bandName}
          </p>
          {effectText ? (
            <p className="mt-1.5 text-xs font-medium text-[var(--mn-text-muted)] leading-relaxed min-h-[3rem]" title={effectText}>
              {effectText}
            </p>
          ) : null}
        </div>

        {maxLevel > 1 && effect ? (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--mn-text-muted)]/80">
              <span>{t(locale, "bandItems.level", { level })}</span>
              <span>{t(locale, "bandItems.effectValue", { value: effect.value })}</span>
            </div>
            <input
              type="range"
              min={1}
              max={maxLevel}
              value={level}
              onChange={(event) => setLevel(Number(event.target.value))}
              className="mt-2 w-full accent-[var(--mn-accent)]"
              aria-label={t(locale, "bandItems.level", { level })}
            />
          </div>
        ) : null}

        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/30 text-[11px] font-semibold text-[var(--mn-text-muted)]/80">
          <span>ID #{item.id}</span>
          <span className="bg-[var(--mn-cream-deep)] px-2.5 py-0.5 rounded-full border border-[var(--mn-border)] text-[10px]">
            {t(locale, "bandItems.maxLevel", { level: maxLevel })}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "bandItems.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "bandItems.emptyDescription")}</p>
      <button
        type="button"
        onClick={onReset}
        className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
      >
        {t(locale, "bandItems.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", bands: [] as number[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
    };
  } catch {
    return fallback;
  }
}

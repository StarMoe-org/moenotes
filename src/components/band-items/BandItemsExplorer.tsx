import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useLayoutEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useAssetUrl, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import BaseFilters, { BandFilter } from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { BandItemViewModel } from "@/lib/band-items/data";
import { describeBandItemEffect, formatBandItemEffectPercent, getBandItemIconUrl } from "@/lib/band-items/assets";
import BandItemOverlay from "./BandItemOverlay";

/** The item a `?item=<id>` deep link opens (read only; the parameter is cleared by the explorer's layout effect). */
function readItemParam(): number | null {
  if (typeof window === "undefined") return null;
  const raw = new URLSearchParams(window.location.search).get("item");
  if (raw === null) return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * Sets or clears `?item=` on the current history entry, keeping its state object: Modal marks the entry it pushes with
 * `{ modal: true }` and steps back over it on close, which a replaced state would break.
 */
function replaceItemParam(id: number | null) {
  const url = new URL(window.location.href);
  if (id === null) url.searchParams.delete("item");
  else url.searchParams.set("item", String(id));
  window.history.replaceState(window.history.state, "", url.toString());
}

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
  const [activeItemId, setActiveItemId] = useState<number | null>(readItemParam);

  const openItem = useCallback((id: number) => setActiveItemId(id), []);
  const closeItem = useCallback(() => setActiveItemId(null), []);

  const activeItem = useMemo(
    () => (activeItemId === null ? null : items.find((item) => item.id === activeItemId) ?? null),
    [items, activeItemId],
  );

  // History entries for the overlay: a deep link's `?item=` leaves the landing entry before Modal pushes its own
  // (a layout effect runs before every passive effect, Modal's included), so closing — Modal steps back — lands on a
  // clean list URL. The parameter is then shown on Modal's entry, after its push, while an item is actually open.
  useLayoutEffect(() => {
    if (new URLSearchParams(window.location.search).has("item")) replaceItemParam(null);
  }, []);
  const openItemId = activeItem?.id ?? null;
  useEffect(() => {
    if (openItemId !== null) replaceItemParam(openItemId);
  }, [openItemId]);

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
              <BandItemCard key={item.id} item={item} locale={locale} onOpen={() => openItem(item.id)} />
            ))}
          </div>
        )}
      </section>
      <BandItemOverlay locale={locale} server={server} item={activeItem} onClose={closeItem} />
    </ServerScope>
  );
}

function BandItemCard({ item, locale, onOpen }: { item: BandItemViewModel; locale: AppLocale; onOpen: () => void }) {
  const [level, setLevel] = useState(item.maxLevel);
  const effect = item.skillEffects.find((entry) => entry.level === level) ?? item.skillEffects.at(-1) ?? null;
  const effectText = effect ? describeBandItemEffect(item.description, effect.value, locale) : "";
  const maxLevel = item.maxLevel;
  const artUrl = useAssetUrl()(getBandItemIconUrl(item, locale));
  const [artFailed, setArtFailed] = useState(false);

  return (
    <div
      className="mn-list-card group flex flex-col min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={item.id}
    >
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <button
          type="button"
          onClick={onOpen}
          aria-haspopup="dialog"
          className="mn-focus mb-2 flex items-center gap-3 rounded-lg -m-1 p-1 text-left"
        >
          {artUrl && !artFailed ? (
            <img
              src={artUrl}
              alt=""
              loading="lazy"
              width={270}
              height={516}
              className="h-16 w-auto shrink-0 object-contain transition group-hover:scale-105"
              onError={() => setArtFailed(true)}
            />
          ) : null}
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]" title={item.name}>
              {item.name}
            </h3>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--mn-text-muted)]/80" title={item.bandName}>
              {item.bandName}
            </p>
            <span className="mt-1 inline-block text-[11px] font-bold text-[var(--mn-accent-deep)]">
              {t(locale, "bandItems.openDetail")}
            </span>
          </div>
        </button>
        {effectText ? (
          <p className="mt-1.5 text-xs font-medium text-[var(--mn-text-muted)] leading-relaxed min-h-[3rem]" title={effectText}>
            {effectText}
          </p>
        ) : null}

        {maxLevel > 1 && effect ? (
          <div className="mt-3">
            <div className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[var(--mn-text-muted)]/80">
              <span>{t(locale, "bandItems.level", { level })}</span>
              <span>{t(locale, "bandItems.effectValue", { value: formatBandItemEffectPercent(effect.value, locale) })}</span>
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

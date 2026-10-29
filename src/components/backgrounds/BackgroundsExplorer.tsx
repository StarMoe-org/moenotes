"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerFiles, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import BaseFilters, { FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import CollectibleOverlay from "@/components/collectibles/CollectibleOverlay";
import { imageFileName } from "@/lib/collectibles/image-client";
import { parsePositiveIntParam, useQueryOverlay } from "@/lib/overlay/use-query-overlay";
import type { BackgroundViewModel } from "@/lib/backgrounds/data";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialBackgrounds: ServerFaceted<BackgroundViewModel>[];
  servers: GameServer[];
}

// View models carry server-neutral file URLs; the list shows the page server's files.
const BACKGROUND_FILES = ["imageUrl", "thumbnailUrl"] as const;

export default function BackgroundsExplorer({ locale, servers, initialBackgrounds }: Props) {
  const memory = useListPageMemory("backgrounds");
  const { server, pickServer, items: serverItems } = useServerList(locale, servers, initialBackgrounds);
  const backgrounds = useServerFiles(serverItems, server, BACKGROUND_FILES);
  const [query, setQuery] = useState("");
  const sort = useListSort("backgrounds", locale);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  // `?id=<background>` deep links (search) open the background's overlay; see useQueryOverlay.
  const isListed = useCallback((id: number) => backgrounds.some((background) => background.id === id), [backgrounds]);
  const overlay = useQueryOverlay("id", { parse: parsePositiveIntParam, isShown: isListed });
  const preview = useMemo(() => (overlay.value === null ? null : backgrounds.find((background) => background.id === overlay.value) ?? null), [backgrounds, overlay.value]);
  const toImage = useCallback((background: BackgroundViewModel) => ({ src: background.imageUrl, alt: background.name, caption: background.name, downloadName: imageFileName(background.imageUrl, `background_${background.id}.webp`) }), []);

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
  const sortedBackgrounds = useMemo(
    () => (sort.value === "default" ? [...filteredBackgrounds].sort((a, b) => b.id - a.id) : sortEntries(filteredBackgrounds, sort.value, locale)),
    [filteredBackgrounds, sort.value, locale],
  );
  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedTypes.length > 0;

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedTypes([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      locale={locale}
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
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <section className="min-w-0" aria-live="polite">
        {filteredBackgrounds.length === 0 ? (
          <div className="md3-surface p-8 text-center sm:p-12">
            <h2 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "backgrounds.emptyTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "backgrounds.emptyDescription")}</p>
            <button type="button" onClick={resetFilters} className="md3-button md3-button--tonal mt-6">
              {t(locale, "backgrounds.reset")}
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 4xl:grid-cols-5">
            {sortedBackgrounds.map((background) => (
              <button
                key={background.id}
                type="button"
                onClick={() => { saveCurrentState(); overlay.open(background.id); }}
                aria-haspopup="dialog"
                data-list-item-id={background.id}
                aria-label={t(locale, "backgrounds.openPreview", { name: background.name })}
                className="mn-list-card group flex min-w-0 flex-col overflow-hidden border border-outline-variant bg-surface-container-low text-left shadow-elevation-1 transition hover:shadow-elevation-1"
              >
                <span className="relative block aspect-video overflow-hidden border-b border-outline-variant bg-surface-container-highest">
                  <img className="h-full w-full object-cover transition duration-300 group-hover:scale-105" src={background.thumbnailUrl} alt="" loading="lazy" decoding="async" />
                </span>
                <span className="flex items-center justify-between gap-3 p-3">
                  <span className="min-w-0 truncate text-label-large text-on-surface group-hover:text-primary">{background.name}</span>
                  <span className="shrink-0 rounded-full border border-outline-variant px-2 py-0.5 text-label-small text-on-surface-variant">{t(locale, `backgrounds.types.${background.type}`)}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <CollectibleOverlay
          locale={locale}
          servers={servers}
          entry={preview}
          onClose={overlay.close}
          title={preview?.name ?? ""}
          closeLabel={t(locale, "actions.close")}
          results={sortedBackgrounds}
          toImage={toImage}
          onNavigate={overlay.open}
          frame="wide"
          description={preview?.description || undefined}
          facts={preview ? [{ label: t(locale, "backgrounds.type"), value: t(locale, `backgrounds.types.${preview.type}`) || `#${preview.type}` }] : []}
        >
          {preview ? (
            <a href={preview.imageUrl} target="_blank" rel="noopener noreferrer" className="md3-button md3-button--outlined md3-button--small">
              {t(locale, "backgrounds.openOriginal")}
            </a>
          ) : null}
        </CollectibleOverlay>
      </section>
    </ServerScope>
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

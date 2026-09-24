import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, { BandFilter, CharacterFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import Modal from "@/components/shared/Modal";
import type { CharacterOption } from "@/components/shared/filters";
import type { DegreeViewModel } from "@/lib/degrees/data";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialTitles: DegreeViewModel[];
  bands: Array<[number, string]>;
  characters: Array<{ id: number; name: string; bandId: number }>;
}

export default function TitlesExplorer({ locale, initialTitles, bands, characters }: Props) {
  const memory = useListPageMemory("titles");
  const [titles] = useState(initialTitles);
  const [query, setQuery] = useState("");
  const sort = useListSort("titles", locale);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [preview, setPreview] = useState<DegreeViewModel | null>(null);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedTypes(remembered.types);
    setSelectedBands(remembered.bands);
    setSelectedCharacters(remembered.characters);
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
    const filtersHash = JSON.stringify({ query, types: selectedTypes, bands: selectedBands, characters: selectedCharacters });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedTypes, selectedBands, selectedCharacters, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const types = useMemo(() => [...new Set(titles.map((title) => title.type))].sort((a, b) => a - b), [titles]);
  const usedBands = useMemo(() => {
    const used = new Set(titles.flatMap((title) => title.bandIds));
    return bands.filter(([id]) => used.has(id));
  }, [titles, bands]);
  const bandCharacters = useMemo<CharacterOption[]>(
    () => characters.filter((character) => selectedBands.includes(character.bandId)).map(({ id, name }) => ({ id, name })),
    [characters, selectedBands],
  );

  const filteredTitles = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return titles.filter((title) => {
      if (selectedTypes.length > 0 && !selectedTypes.includes(title.type)) return false;
      if (selectedBands.length > 0 && !title.bandIds.some((id) => selectedBands.includes(id))) return false;
      if (selectedCharacters.length > 0 && !title.characterIds.some((id) => selectedCharacters.includes(id))) return false;
      return !needle || title.searchText.includes(needle);
    });
  }, [titles, query, selectedTypes, selectedBands, selectedCharacters]);

  const sortedTitles = useMemo(() => sortEntries(filteredTitles, sort.value, locale), [filteredTitles, sort.value, locale]);
  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedTypes.length > 0 || selectedBands.length > 0 || selectedCharacters.length > 0;

  const toggleBand = (bandId: number) => {
    const next = toggleArrayItem(selectedBands, bandId);
    setSelectedBands(next);
    const valid = new Set(characters.filter((character) => next.includes(character.bandId)).map((character) => character.id));
    setSelectedCharacters((current) => (next.length === 0 ? [] : current.filter((id) => valid.has(id))));
  };

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedTypes([]);
    setSelectedBands([]);
    setSelectedCharacters([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "titles.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "titles.searchPlaceholder")}
      resultCount={filteredTitles.length}
      totalCount={titles.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <FilterSection title={t(locale, "titles.type")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedTypes.length === 0} onClick={() => setSelectedTypes([])}>ALL</FilterButton>
          {types.map((type) => (
            <FilterButton key={type} active={selectedTypes.includes(type)} onClick={() => setSelectedTypes((current) => toggleArrayItem(current, type))}>
              {t(locale, `titles.types.${type}`) || `#${type}`}
            </FilterButton>
          ))}
        </div>
      </FilterSection>
      <BandFilter title={t(locale, "cards.band")} bands={usedBands} selectedBands={selectedBands} onToggle={toggleBand} onReset={() => { setSelectedBands([]); setSelectedCharacters([]); }} />
      <CharacterFilter title={t(locale, "nav.items.characters")} characters={bandCharacters} selectedCharacters={selectedCharacters} onChange={setSelectedCharacters} />
    </BaseFilters>
  );

  useQuickFilter(t(locale, "titles.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedTypes,
    selectedBands,
    selectedCharacters,
    usedBands,
    bandCharacters,
    hasActiveFilters,
    filteredTitles.length,
    titles.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {filteredTitles.length === 0 ? (
        <div className="mn-paper p-8 text-center sm:p-12">
          <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "titles.emptyTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "titles.emptyDescription")}</p>
          <button type="button" onClick={resetFilters} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
            {t(locale, "titles.reset")}
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7">
          {sortedTitles.map((title) => (
            <button
              key={title.id}
              type="button"
              onClick={() => setPreview(title)}
              data-list-item-id={title.id}
              aria-label={t(locale, "titles.openPreview", { name: title.name })}
              className="mn-list-card group flex min-w-0 flex-col overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
            >
              <span className="mn-stripes-cream relative grid aspect-square place-items-center border-b border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] p-3">
                <img className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105" src={title.imageUrl} alt="" loading="lazy" decoding="async" />
                <span className="absolute left-2 top-2 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-2 py-0.5 text-[10px] font-bold text-[var(--mn-ink-soft)]">{t(locale, `titles.types.${title.type}`)}</span>
              </span>
              <span className="flex flex-1 flex-col gap-1 p-3">
                <span className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{title.name}</span>
                {title.source && <span className="line-clamp-2 text-[11px] font-medium leading-4 text-[var(--mn-text-muted)]">{title.source}</span>}
              </span>
            </button>
          ))}
        </div>
      )}

      <Modal isOpen={preview !== null} onClose={() => setPreview(null)} title={preview?.name ?? ""} closeLabel={t(locale, "actions.close")} size="lg">
        {preview && (
          <div className="space-y-4">
            <div className="mn-stripes-cream grid place-items-center rounded-2xl border border-[var(--mn-border)] bg-[var(--mn-cream-deep)] p-4">
              <img className="max-h-[55vh] w-auto max-w-full object-contain" src={preview.imageUrl} alt={preview.name} />
            </div>
            <dl className="divide-y divide-dashed divide-[var(--mn-border)]/60 text-sm">
              <div className="flex justify-between gap-4 py-2.5"><dt className="font-semibold text-[var(--mn-text-muted)]">{t(locale, "titles.type")}</dt><dd className="font-semibold">{t(locale, `titles.types.${preview.type}`)}</dd></div>
              {preview.source && <div className="flex justify-between gap-4 py-2.5"><dt className="shrink-0 font-semibold text-[var(--mn-text-muted)]">{t(locale, "titles.source")}</dt><dd className="text-right font-semibold">{preview.source}</dd></div>}
              <div className="flex justify-between gap-4 py-2.5"><dt className="font-semibold text-[var(--mn-text-muted)]">ID</dt><dd className="font-mono">#{preview.id}</dd></div>
            </dl>
          </div>
        )}
      </Modal>
    </section>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", types: [] as number[], bands: [] as number[], characters: [] as number[] };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      types: Array.isArray(parsed.types) ? parsed.types : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    };
  } catch {
    return fallback;
  }
}

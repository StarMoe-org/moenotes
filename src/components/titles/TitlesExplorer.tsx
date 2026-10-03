import { useCallback, useEffect, useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerFiles, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import BaseFilters, { BandFilter, CharacterFilter, FilterButton, FilterSection, toggleArrayItem } from "@/components/shared/BaseFilters";
import CollectibleOverlay from "@/components/collectibles/CollectibleOverlay";
import type { CharacterOption } from "@/components/shared/filters";
import { isDegreeRetired, type DegreeViewModel } from "@/lib/degrees/data";
import { imageFileName } from "@/lib/collectibles/image-client";
import { localizePath } from "@/i18n/routing";
import { parsePositiveIntParam, useQueryOverlay } from "@/lib/overlay/use-query-overlay";
import { entityLinkPath } from "@/lib/route/entity-link";
import { useNow } from "@/lib/schedule/use-now";
import { sortEntries } from "@/lib/filter/list-sort";
import { useListSort } from "@/lib/filter/use-list-sort";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";

interface Props {
  locale: AppLocale;
  initialTitles: ServerFaceted<DegreeViewModel>[];
  servers: GameServer[];
  bands: Array<[number, string]>;
  characters: Array<{ id: number; name: string; bandId: number }>;
}

// View models carry server-neutral file URLs; the list shows the page server's files.
const TITLE_FILES = ["imageUrl"] as const;

export default function TitlesExplorer({ locale, servers, initialTitles, bands, characters }: Props) {
  const memory = useListPageMemory("titles");
  const { server, pickServer, items: serverItems } = useServerList(locale, servers, initialTitles);
  const titles = useServerFiles(serverItems, server, TITLE_FILES);
  const [query, setQuery] = useState("");
  const sort = useListSort("titles", locale);
  const [selectedTypes, setSelectedTypes] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [availability, setAvailability] = useState<Availability>("all");
  const [unlockOnly, setUnlockOnly] = useState(false);
  const now = useNow();
  // `?id=<title>` deep links (search, reward chips) open the title's overlay; see useQueryOverlay.
  const isListed = useCallback((id: number) => titles.some((title) => title.id === id), [titles]);
  const overlay = useQueryOverlay("id", { parse: parsePositiveIntParam, isShown: isListed });
  const preview = useMemo(() => (overlay.value === null ? null : titles.find((title) => title.id === overlay.value) ?? null), [titles, overlay.value]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedTypes(remembered.types);
    setSelectedBands(remembered.bands);
    setSelectedCharacters(remembered.characters);
    setAvailability(remembered.availability);
    setUnlockOnly(remembered.unlockOnly);
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
    const filtersHash = JSON.stringify({ query, types: selectedTypes, bands: selectedBands, characters: selectedCharacters, availability, unlockOnly });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedTypes, selectedBands, selectedCharacters, availability, unlockOnly, memory]);

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
      if (availability !== "all") {
        // Before hydration nothing counts as retired, so the static HTML matches the "obtainable" list.
        const retired = now !== null && isDegreeRetired(title, now);
        if ((availability === "retired") !== retired) return false;
      }
      if (unlockOnly && title.unlocks.length === 0) return false;
      return !needle || title.searchText.includes(needle);
    });
  }, [titles, query, selectedTypes, selectedBands, selectedCharacters, availability, unlockOnly, now]);

  const sortedTitles = useMemo(() => sortEntries(filteredTitles, sort.value, locale), [filteredTitles, sort.value, locale]);
  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedTypes.length > 0 || selectedBands.length > 0 || selectedCharacters.length > 0 || availability !== "all" || unlockOnly;
  const toImage = useCallback((title: DegreeViewModel) => ({ src: title.imageUrl, alt: title.name, caption: title.name, downloadName: imageFileName(title.imageUrl, `title_${title.id}.webp`) }), []);

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
    setAvailability("all");
    setUnlockOnly(false);
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
      <FilterSection title={t(locale, "titles.availability")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={availability === "all"} onClick={() => setAvailability("all")}>ALL</FilterButton>
          <FilterButton active={availability === "available"} onClick={() => setAvailability("available")}>{t(locale, "titles.available")}</FilterButton>
          <FilterButton active={availability === "retired"} onClick={() => setAvailability("retired")}>{t(locale, "titles.retired")}</FilterButton>
        </div>
      </FilterSection>
      <FilterSection title={t(locale, "titles.unlock")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={!unlockOnly} onClick={() => setUnlockOnly(false)}>ALL</FilterButton>
          <FilterButton active={unlockOnly} onClick={() => setUnlockOnly(true)}>{t(locale, "titles.hasUnlock")}</FilterButton>
        </div>
      </FilterSection>
    </BaseFilters>
  );

  useQuickFilter(t(locale, "titles.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedTypes,
    selectedBands,
    selectedCharacters,
    availability,
    unlockOnly,
    usedBands,
    bandCharacters,
    hasActiveFilters,
    filteredTitles.length,
    titles.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
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
                onClick={() => { saveCurrentState(); overlay.open(title.id); }}
                aria-haspopup="dialog"
                data-list-item-id={title.id}
                aria-label={t(locale, "titles.openPreview", { name: title.name })}
                className="mn-list-card group flex min-w-0 flex-col overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] text-left shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
              >
                <span className="mn-stripes-cream relative grid aspect-square place-items-center border-b border-[var(--mn-glass-border)] bg-[var(--mn-cream-deep)] p-3">
                  <img className="max-h-full max-w-full object-contain transition duration-300 group-hover:scale-105" src={title.imageUrl} alt="" loading="lazy" decoding="async" />
                  <span className="absolute left-2 top-2 rounded-full border border-[var(--mn-glass-border)] bg-[var(--mn-paper)] px-2 py-0.5 text-[10px] font-bold text-[var(--mn-ink-soft)]">{t(locale, `titles.types.${title.type}`)}</span>
                  {now !== null && isDegreeRetired(title, now) && <span className="absolute right-2 top-2 rounded-full border border-[var(--mn-rose)] bg-[var(--mn-paper)] px-2 py-0.5 text-[10px] font-bold text-[var(--mn-rose)]">{t(locale, "titles.retired")}</span>}
                </span>
                <span className="flex flex-1 flex-col gap-1 p-3">
                  <span className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)]">{title.name}</span>
                  {title.source && <span className="line-clamp-2 text-[11px] font-medium leading-4 text-[var(--mn-text-muted)]">{title.source}</span>}
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
          results={sortedTitles}
          toImage={toImage}
          onNavigate={overlay.open}
          description={preview?.source ? <><span className="mr-2 font-black text-[var(--mn-text)]">{t(locale, "titles.source")}</span>{preview.source}</> : undefined}
          characters={preview ? preview.characterIds.map((id, index) => ({ id, name: preview.characterNames[index] ?? "" })) : []}
          facts={preview ? [
            { label: t(locale, "titles.type"), value: t(locale, `titles.types.${preview.type}`) || `#${preview.type}` },
            ...(now !== null && isDegreeRetired(preview, now) ? [{ label: t(locale, "titles.availability"), value: <span className="text-[var(--mn-rose)]">{t(locale, "titles.retired")}</span> }] : []),
            ...(preview.sourceCardId ? [{
              label: t(locale, "titles.sourceCard"),
              value: <a className="text-[var(--mn-accent-deep)] underline-offset-2 hover:underline" href={localizePath(entityLinkPath({ routeId: "cards", detailId: preview.sourceCardId }), locale)}>{t(locale, "titles.viewCard", { id: preview.sourceCardId })}</a>,
            }] : []),
          ] : []}
        >
          {preview && preview.unlocks.length > 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--mn-border)] p-3">
              <p className="text-xs font-black text-[var(--mn-text-muted)]">{t(locale, "titles.unlock")}</p>
              <ul className="mt-2 space-y-1 text-sm font-semibold">
                {preview.unlocks.map((unlock) => (
                  <li key={`${unlock.characterId}-${unlock.rank}`}>
                    <a className="text-[var(--mn-accent-deep)] underline-offset-2 hover:underline" href={localizePath(entityLinkPath({ routeId: "characters", detailId: unlock.characterId }), locale)}>
                      {t(locale, "titles.unlockCharacterRank", { name: unlock.characterName || `#${unlock.characterId}`, rank: unlock.rank })}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </CollectibleOverlay>
      </section>
    </ServerScope>
  );
}

type Availability = "all" | "available" | "retired";

function parseRememberedFilters(raw?: string) {
  const fallback = { query: "", types: [] as number[], bands: [] as number[], characters: [] as number[], availability: "all" as Availability, unlockOnly: false };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      types: Array.isArray(parsed.types) ? parsed.types : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
      availability: (parsed.availability === "available" || parsed.availability === "retired" ? parsed.availability : "all") as Availability,
      unlockOnly: parsed.unlockOnly === true,
    };
  } catch {
    return fallback;
  }
}

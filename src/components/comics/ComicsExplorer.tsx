import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { useServerFiles, useServerList } from "@/lib/servers/use-content-server";
import { t } from "@/i18n";
import BaseFilters, {
  BandFilter,
  CharacterFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import CollectibleOverlay from "@/components/collectibles/CollectibleOverlay";
import { imageFileName } from "@/lib/collectibles/image-client";
import { parsePositiveIntParam, useQueryOverlay } from "@/lib/overlay/use-query-overlay";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { ComicViewModel } from "@/lib/comics/data";

interface Props {
  locale: AppLocale;
  initialComics: ServerFaceted<ComicViewModel>[];
  servers: GameServer[];
  initialBandNames: Array<[number, string]>;
}

// View models carry server-neutral file URLs; the list shows the page server's files.
const COMIC_FILES = ["imageUrl"] as const;

export default function ComicsExplorer({ locale, servers, initialComics, initialBandNames }: Props) {
  const memory = useListPageMemory("comics");
  const { server, pickServer, items: serverItems } = useServerList(locale, servers, initialComics);
  const comics = useServerFiles(serverItems, server, COMIC_FILES);
  
  const [query, setQuery] = useState("");
  const sort = useListSort("comics", locale, "");
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  
  // `?id=<comic>` deep links (search, reward chips) open the comic's overlay; see useQueryOverlay.
  const isListed = useCallback((id: number) => comics.some((entry) => entry.id === id), [comics]);
  const overlay = useQueryOverlay("id", { parse: parsePositiveIntParam, isShown: isListed });
  const selectedComic = useMemo(() => (overlay.value === null ? null : comics.find((entry) => entry.id === overlay.value) ?? null), [comics, overlay.value]);
  const toImage = useCallback((entry: ComicViewModel) => ({ src: entry.imageUrl, alt: entry.name, caption: entry.name, downloadName: imageFileName(entry.imageUrl, `comic_${entry.id}.webp`) }), []);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
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
    const filtersHash = JSON.stringify({
      query,
      bands: selectedBands,
      characters: selectedCharacters,
    });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedBands, selectedCharacters, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const bands = useMemo(() => {
    const values = new Map<number, string>();
    comics.forEach((comic) => {
      comic.bandIds.forEach((bandId) => {
        values.set(bandId, t(locale, "cards.allBands"));
      });
    });
    return [...values.keys()].sort((a, b) => a - b);
  }, [comics, locale]);

  const bandNamesMap = useMemo(() => new Map(initialBandNames), [initialBandNames]);

  const bandCharacters = useMemo(() => {
    if (selectedBands.length === 0) return [];
    const filteredChars: { id: number; name: string }[] = [];
    comics.forEach((comic) => {
      comic.characterIds.forEach((charId, idx) => {
        const isSelectedBand = comic.bandIds.some((bId) => selectedBands.includes(bId));
        if (isSelectedBand) {
          const name = comic.characterNames[idx] || "";
          if (!filteredChars.some((c) => c.id === charId)) {
            filteredChars.push({ id: charId, name });
          }
        }
      });
    });
    return filteredChars.sort((a, b) => a.id - b.id);
  }, [comics, selectedBands]);

  const filteredComics = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return comics.filter((comic) => {
      if (selectedBands.length > 0 && !comic.bandIds.some((bId) => selectedBands.includes(bId))) return false;
      if (selectedCharacters.length > 0 && !comic.characterIds.some((cId) => selectedCharacters.includes(cId))) return false;
      return !needle || comic.searchText.includes(needle);
    });
  }, [comics, query, selectedBands, selectedCharacters]);

  const sortedEntries = useMemo(() => sortEntries(filteredComics, sort.value, locale), [filteredComics, sort.value, locale]);

  const hasActiveFilters = sort.value !== "default" || Boolean(query) || selectedBands.length > 0 || selectedCharacters.length > 0;

  const handleBandToggle = (bandId: number) => {
    const nextBands = selectedBands.includes(bandId)
      ? selectedBands.filter((id) => id !== bandId)
      : [...selectedBands, bandId];
    
    setSelectedBands(nextBands);

    if (nextBands.length === 0) {
      setSelectedCharacters([]);
    } else {
      const validCharIds = new Set<number>();
      comics.forEach((comic) => {
        if (comic.bandIds.some((bId) => nextBands.includes(bId))) {
          comic.characterIds.forEach((cId) => validCharIds.add(cId));
        }
      });
      setSelectedCharacters((prev) => prev.filter((charId) => validCharIds.has(charId)));
    }
  };

  const handleBandReset = () => {
    setSelectedBands([]);
    setSelectedCharacters([]);
  };

  const resetFilters = () => {
    sort.onChange("default");
    setQuery("");
    setSelectedBands([]);
    setSelectedCharacters([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "comics.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "comics.searchPlaceholder")}
      resultCount={filteredComics.length}
      totalCount={comics.length}
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
        onReset={handleBandReset}
      />

      <CharacterFilter
        title={t(locale, "nav.items.characters")}
        characters={bandCharacters}
        selectedCharacters={selectedCharacters}
        onChange={setSelectedCharacters}
      />
    </BaseFilters>
  );

  useQuickFilter(t(locale, "comics.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedBands,
    selectedCharacters,
    bands,
    bandCharacters,
    hasActiveFilters,
    filteredComics.length,
    comics.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <>
        <section className="min-w-0" aria-live="polite">
          {filteredComics.length === 0 ? (
            <EmptyState locale={locale} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sortedEntries.map((comic) => (
                <button
                  key={comic.id}
                  type="button"
                  onClick={() => {
                    saveCurrentState();
                    overlay.open(comic.id);
                  }}
                  className="mn-list-card group flex flex-col min-w-0 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)] text-left"
                  data-list-item-id={comic.id}
                  aria-label={comic.name}
                >
                  <div className="aspect-[928/778] w-full flex items-center justify-center overflow-hidden bg-[var(--mn-surface)] border-b-[1.5px] border-[var(--mn-border)]">
                    <img className="h-full w-full object-cover group-hover:scale-[1.02] transition duration-300" src={comic.imageUrl} alt={comic.name} loading="lazy" />
                  </div>
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]">{comic.name}</h3>
                      <p className="mt-1.5 text-[10px] font-bold text-[var(--mn-text-muted)]">#{comic.id}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <CollectibleOverlay
          locale={locale}
          servers={servers}
          entry={selectedComic}
          onClose={overlay.close}
          title={selectedComic?.name ?? ""}
          closeLabel={t(locale, "actions.close")}
          results={sortedEntries}
          toImage={toImage}
          onNavigate={overlay.open}
          frame="wide"
          characters={selectedComic ? selectedComic.characterIds.map((id, index) => ({ id, name: selectedComic.characterNames[index] ?? "" })) : []}
        />
      </>
    </ServerScope>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "comics.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "comics.emptyDescription")}</p>
      <button type="button" onClick={onReset} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "comics.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = {
    query: "",
    bands: [] as number[],
    characters: [] as number[]
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : []
    };
  } catch {
    return fallback;
  }
}

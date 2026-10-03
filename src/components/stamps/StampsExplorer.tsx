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
import type { StampViewModel } from "@/lib/stamps/data";

interface Props {
  locale: AppLocale;
  initialStamps: ServerFaceted<StampViewModel>[];
  servers: GameServer[];
  initialBandNames: Array<[number, string]>;
}

// View models carry server-neutral file URLs; the list shows the page server's files.
const STAMP_FILES = ["imageUrl"] as const;

export default function StampsExplorer({ locale, servers, initialStamps, initialBandNames }: Props) {
  const memory = useListPageMemory("stamps");
  const { server, pickServer, items: serverItems } = useServerList(locale, servers, initialStamps);
  const stamps = useServerFiles(serverItems, server, STAMP_FILES);
  
  const [query, setQuery] = useState("");
  const sort = useListSort("stamps", locale, "");
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  
  // `?id=<stamp>` deep links (search, reward chips) open the stamp's overlay; see useQueryOverlay.
  const isListed = useCallback((id: number) => stamps.some((entry) => entry.id === id), [stamps]);
  const overlay = useQueryOverlay("id", { parse: parsePositiveIntParam, isShown: isListed });
  const selectedStamp = useMemo(() => (overlay.value === null ? null : stamps.find((entry) => entry.id === overlay.value) ?? null), [stamps, overlay.value]);
  const toImage = useCallback((entry: StampViewModel) => ({ src: entry.imageUrl, alt: entry.name, caption: entry.name, downloadName: imageFileName(entry.imageUrl, `stamp_${entry.id}.webp`) }), []);

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
    stamps.forEach((stamp) => {
      // Find bands corresponding to characters in the stamp
      stamp.bandIds.forEach((bandId) => {
        // Find band name (we can deduce it from other sources or just keep it simple,
        // let's fetch band names from character information or map them)
        // Wait, character map has band info, but we can also map standard band names from locale
        // If we want the band name in correct language:
        const bandName = t(locale, `cards.allBands`); // Fallback
        values.set(bandId, bandName);
      });
    });
    // In our Moenotes project, band names are translated under e.g. "cards.allBands" etc.
    // Wait, let's map them to band logo/icon and name.
    // Since band IDs are 1 to 5 (e.g. MyGO!!!!!, Ave Mujica), we can resolve band name from MasterBand.
    return [...values.keys()].sort((a, b) => a - b);
  }, [stamps, locale]);

  const bandNamesMap = useMemo(() => new Map(initialBandNames), [initialBandNames]);

  const bandCharacters = useMemo(() => {
    if (selectedBands.length === 0) return [];
    const charMap = new Map<number, string>();
    stamps.forEach((stamp) => {
      stamp.characterIds.forEach((charId) => {
        // Find if this character belongs to any selected bands
        // Let's filter characters. To get character names, we can check stamp characterNames.
        // Or keep it simple: map characterId to name.
        const idx = stamp.characterIds.indexOf(charId);
        const name = stamp.characterNames[idx] || "";
        charMap.set(charId, name);
      });
    });
    // In our project, characterId maps to their band.
    // To filter correctly: we should only display characters belonging to selected bands.
    // Let's filter the charMap to keep only those characters that have bandIds in selectedBands.
    const filteredChars: { id: number; name: string }[] = [];
    stamps.forEach((stamp) => {
      stamp.characterIds.forEach((charId, idx) => {
        const isSelectedBand = stamp.bandIds.some((bId) => selectedBands.includes(bId));
        if (isSelectedBand) {
          const name = stamp.characterNames[idx] || "";
          if (!filteredChars.some((c) => c.id === charId)) {
            filteredChars.push({ id: charId, name });
          }
        }
      });
    });
    return filteredChars.sort((a, b) => a.id - b.id);
  }, [stamps, selectedBands]);

  const filteredStamps = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return stamps.filter((stamp) => {
      if (selectedBands.length > 0 && !stamp.bandIds.some((bId) => selectedBands.includes(bId))) return false;
      if (selectedCharacters.length > 0 && !stamp.characterIds.some((cId) => selectedCharacters.includes(cId))) return false;
      return !needle || stamp.searchText.includes(needle);
    });
  }, [stamps, query, selectedBands, selectedCharacters]);

  const sortedEntries = useMemo(() => sortEntries(filteredStamps, sort.value, locale), [filteredStamps, sort.value, locale]);

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
      stamps.forEach((stamp) => {
        if (stamp.bandIds.some((bId) => nextBands.includes(bId))) {
          stamp.characterIds.forEach((cId) => validCharIds.add(cId));
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
      title={t(locale, "stamps.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "stamps.searchPlaceholder")}
      resultCount={filteredStamps.length}
      totalCount={stamps.length}
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

  useQuickFilter(t(locale, "stamps.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedBands,
    selectedCharacters,
    bands,
    bandCharacters,
    hasActiveFilters,
    filteredStamps.length,
    stamps.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer}>
      <>
        <section className="min-w-0" aria-live="polite">
          {filteredStamps.length === 0 ? (
            <EmptyState locale={locale} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {sortedEntries.map((stamp) => (
                <button
                  key={stamp.id}
                  type="button"
                  onClick={() => {
                    saveCurrentState();
                    overlay.open(stamp.id);
                  }}
                  className="mn-list-card group flex flex-col items-center justify-between min-w-0 p-4 sm:p-5 overflow-hidden border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)] text-center "
                  data-list-item-id={stamp.id}
                  aria-label={stamp.name}
                >
                  <div className="aspect-[256/220] w-full flex items-center justify-center overflow-hidden rounded-2xl bg-[var(--mn-surface)] p-2 sm:p-3">
                    <img className="max-h-full max-w-full object-contain" src={stamp.imageUrl} alt={stamp.name} loading="lazy" />
                  </div>
                  <div className="mt-4 w-full">
                    <p className="truncate text-sm font-black text-[var(--mn-text)]">{stamp.name}</p>
                    <p className="mt-1 text-[11px] font-bold text-[var(--mn-text-muted)]">#{stamp.id}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>

        <CollectibleOverlay
          locale={locale}
          servers={servers}
          entry={selectedStamp}
          onClose={overlay.close}
          title={selectedStamp?.name ?? ""}
          closeLabel={t(locale, "actions.close")}
          results={sortedEntries}
          toImage={toImage}
          onNavigate={overlay.open}
          frame="square"
          characters={selectedStamp ? selectedStamp.characterIds.map((id, index) => ({ id, name: selectedStamp.characterNames[index] ?? "" })) : []}
        />
      </>
    </ServerScope>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "stamps.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "stamps.emptyDescription")}</p>
      <button type="button" onClick={onReset} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "stamps.reset")}
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

import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, {
  BandFilter,
  CharacterFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import Modal from "@/components/shared/Modal";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import type { ComicViewModel } from "@/lib/comics/data";

interface Props {
  locale: AppLocale;
  initialComics: ComicViewModel[];
  initialBandNames: Array<[number, string]>;
}

export default function ComicsExplorer({ locale, initialComics, initialBandNames }: Props) {
  const memory = useListPageMemory("comics");
  const [comics] = useState<ComicViewModel[]>(initialComics);
  
  const [query, setQuery] = useState("");
  const sort = useListSort("comics", locale, "");
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  
  const [selectedComic, setSelectedComic] = useState<ComicViewModel | null>(null);
  const [copyState, setCopyState] = useState<"idle" | "copying" | "success" | "error">("idle");
  const [downloadState, setDownloadState] = useState<"idle" | "downloading" | "success">("idle");

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

  const copySelectedAsset = async () => {
    if (!selectedComic) return;
    setCopyState("copying");
    try {
      const response = await fetch(selectedComic.imageUrl);
      const blob = await response.blob();
      if (navigator.clipboard.write && typeof ClipboardItem !== "undefined") {
        await navigator.clipboard.write([new ClipboardItem({ [blob.type || "image/png"]: blob })]);
        setCopyState("success");
      } else {
        await navigator.clipboard.writeText(selectedComic.imageUrl);
        setCopyState("success");
      }
    } catch {
      try {
        await navigator.clipboard.writeText(selectedComic.imageUrl);
        setCopyState("success");
      } catch {
        setCopyState("error");
      }
    }
    window.setTimeout(() => setCopyState("idle"), 1800);
  };

  const handleDownload = async () => {
    if (!selectedComic) return;
    setDownloadState("downloading");
    try {
      const response = await fetch(selectedComic.imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const filename = selectedComic.imageUrl.split("/").pop() || `comic_${selectedComic.id}`;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      setDownloadState("success");
    } catch {
      window.open(selectedComic.imageUrl, "_blank");
      setDownloadState("success");
    }
    setTimeout(() => setDownloadState("idle"), 1500);
  };

  const previewActions = selectedComic ? (
    <>
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloadState === "downloading"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {downloadState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
        {downloadState === "downloading" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {downloadState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </button>
      <button
        type="button"
        onClick={copySelectedAsset}
        disabled={copyState === "copying"}
        className="grid h-8 w-8 place-items-center rounded-full border-2 border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] shadow-[var(--mn-shadow-stamp-sm)] transition hover:text-[var(--mn-text)] disabled:opacity-50"
      >
        {copyState === "idle" && (
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
          </svg>
        )}
        {copyState === "copying" && <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor"><circle cx="12" cy="12" r="9" strokeWidth="2" className="opacity-30" /><path d="M12 3a9 9 0 019 9" strokeWidth="2" strokeLinecap="round" /></svg>}
        {copyState === "success" && <svg className="h-4 w-4 text-[var(--mn-mint)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
        {copyState === "error" && <svg className="h-4 w-4 text-[var(--mn-rose)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>}
      </button>
    </>
  ) : null;

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
                  setSelectedComic(comic);
                  saveCurrentState();
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

      <Modal
        isOpen={selectedComic !== null}
        onClose={() => {
          setSelectedComic(null);
          setCopyState("idle");
          setDownloadState("idle");
        }}
        title={selectedComic?.name ?? ""}
        closeLabel={t(locale, "actions.close")}
        size="lg"
        headerActions={previewActions}
      >
        {selectedComic && (
          <div className="w-full overflow-hidden rounded-2xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-surface)] p-2">
            <img
              className="mx-auto max-h-[65vh] w-full object-contain"
              src={selectedComic.imageUrl}
              alt={selectedComic.name}
            />
          </div>
        )}
      </Modal>
    </>
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

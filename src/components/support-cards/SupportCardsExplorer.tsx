import { useListSort } from "@/lib/filter/use-list-sort";
import { sortEntries } from "@/lib/filter/list-sort";
import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import BaseFilters, {
  RarityFilter,
  AttributeFilter,
  BandFilter,
  CharacterFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import SupportCardItem from "./SupportCardItem";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  type SupportCardViewModel,
} from "@/lib/support-cards/data";
import {
  getSupportCardTypeIconUrl,
  getSupportRarityIconUrl,
  type SupportCardRarity,
  type SupportCardType,
} from "@/lib/support-cards/assets";

interface Props {
  locale: AppLocale;
  initialSupportCards: SupportCardViewModel[];
}

const rarities: SupportCardRarity[] = [10, 4, 3, 2];
const cardTypes: SupportCardType[] = [1, 2, 3, 4, 5];

export default function SupportCardsExplorer({ locale, initialSupportCards }: Props) {
  const memory = useListPageMemory("support-cards");
  const [cards] = useState<SupportCardViewModel[]>(initialSupportCards);
  const [query, setQuery] = useState("");
  const sort = useListSort("support-cards", locale, "date rarity");
  const [selectedRarities, setSelectedRarities] = useState<number[]>([]);
  const [selectedCardTypes, setSelectedCardTypes] = useState<number[]>([]);
  const [selectedBands, setSelectedBands] = useState<number[]>([]);
  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);

  useEffect(() => {
    const remembered = parseRememberedFilters(memory.state?.filtersHash);
    setQuery(remembered.query);
    setSelectedRarities(remembered.rarities);
    setSelectedCardTypes(remembered.cardTypes);
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
      rarities: selectedRarities,
      cardTypes: selectedCardTypes,
      bands: selectedBands,
      characters: selectedCharacters,
    });
    memory.saveState({ scrollY: window.scrollY, filtersHash });
  }, [query, selectedRarities, selectedCardTypes, selectedBands, selectedCharacters, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const bands = useMemo(() => {
    const values = new Map<number, string>();
    cards.forEach((card) => {
      if (card.bandId && card.bandName) values.set(card.bandId, card.bandName);
    });
    return [...values.entries()].sort(([a], [b]) => a - b);
  }, [cards]);

  const bandCharacters = useMemo(() => {
    if (selectedBands.length === 0) return [];
    const charMap = new Map<number, { id: number; name: string }>();
    cards.forEach((card) => {
      if (selectedBands.includes(card.bandId)) {
        card.characters.forEach((char) => {
          charMap.set(char.id, { id: char.id, name: char.name });
        });
      }
    });
    return [...charMap.values()].sort((a, b) => a.id - b.id);
  }, [cards, selectedBands]);

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return cards.filter((card) => {
      if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity)) return false;
      if (selectedCardTypes.length > 0 && !selectedCardTypes.includes(card.cardType)) return false;
      if (selectedBands.length > 0 && !selectedBands.includes(card.bandId)) return false;
      if (selectedCharacters.length > 0) {
        const hasMatch = card.characterIds.some((id) => selectedCharacters.includes(id));
        if (!hasMatch) return false;
      }
      return !needle || card.searchText.includes(needle);
    });
  }, [cards, query, selectedRarities, selectedCardTypes, selectedBands, selectedCharacters]);

  const sortedEntries = useMemo(() => sortEntries(filteredCards, sort.value, locale), [filteredCards, sort.value, locale]);

  const hasActiveFilters = sort.value !== "default" ||
    Boolean(query) ||
    selectedRarities.length > 0 ||
    selectedCardTypes.length > 0 ||
    selectedBands.length > 0 ||
    selectedCharacters.length > 0;

  const handleBandToggle = (bandId: number) => {
    const nextBands = selectedBands.includes(bandId)
      ? selectedBands.filter((id) => id !== bandId)
      : [...selectedBands, bandId];

    setSelectedBands(nextBands);

    if (nextBands.length === 0) {
      setSelectedCharacters([]);
    } else {
      const validCharIds = new Set<number>();
      cards.forEach((card) => {
        if (nextBands.includes(card.bandId)) {
          card.characterIds.forEach((id) => validCharIds.add(id));
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
    setSelectedRarities([]);
    setSelectedCardTypes([]);
    setSelectedBands([]);
    setSelectedCharacters([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      sort={sort}
      variant="plain"
      title={t(locale, "supportCards.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "supportCards.searchPlaceholder")}
      resultCount={filteredCards.length}
      totalCount={cards.length}
      hasActiveFilters={hasActiveFilters}
      onReset={resetFilters}
      resetLabel={t(locale, "filter.reset")}
      expandLabel={t(locale, "filter.expand")}
    >
      <RarityFilter
        title={t(locale, "cards.rarity")}
        rarities={rarities}
        selectedRarities={selectedRarities as SupportCardRarity[]}
        onChange={setSelectedRarities}
        getIconUrl={getSupportRarityIconUrl}
        getRarityLabel={(value) => t(locale, `cards.rarities.${value}`)}
      />

      <AttributeFilter
        title={t(locale, "cards.attribute")}
        attributes={cardTypes}
        selectedAttributes={selectedCardTypes as SupportCardType[]}
        onChange={setSelectedCardTypes}
        getIconUrl={getSupportCardTypeIconUrl}
        getAttributeLabel={(value) => t(locale, `cards.attributes.${value}`)}
      />

      <BandFilter
        title={t(locale, "cards.band")}
        bands={bands}
        selectedBands={selectedBands}
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

  useQuickFilter(t(locale, "supportCards.filterTitle"), quickFilterContent, [
    sort.value,
    query,
    selectedRarities,
    selectedCardTypes,
    selectedBands,
    selectedCharacters,
    bands,
    bandCharacters,
    hasActiveFilters,
    filteredCards.length,
    cards.length,
    locale,
  ]);

  return (
    <section className="min-w-0" aria-live="polite">
      {filteredCards.length === 0 ? (
        <EmptyState locale={locale} onReset={resetFilters} />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
          {sortedEntries.map((card) => (
            <SupportCardItem key={card.id} card={card} locale={locale} onClick={saveCurrentState} />
          ))}
        </div>
      )}
    </section>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">
        {t(locale, "supportCards.emptyTitle")}
      </h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">
        {t(locale, "supportCards.emptyDescription")}
      </p>
      <button
        type="button"
        onClick={onReset}
        className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
      >
        {t(locale, "supportCards.reset")}
      </button>
    </div>
  );
}

function parseRememberedFilters(raw?: string) {
  const fallback = {
    query: "",
    rarities: [] as number[],
    cardTypes: [] as number[],
    bands: [] as number[],
    characters: [] as number[],
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      rarities: Array.isArray(parsed.rarities) ? parsed.rarities : [],
      cardTypes: Array.isArray(parsed.cardTypes) ? parsed.cardTypes : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : [],
    };
  } catch {
    return fallback;
  }
}

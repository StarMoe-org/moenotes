import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, {
  RarityFilter,
  AttributeFilter,
  BandFilter,
  CharacterFilter,
} from "@/components/shared/BaseFilters";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import {
  type CardViewModel,
} from "@/lib/cards/data";
import {
  getRarityIconUrl,
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  type CardRarity,
  type CardType,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  initialCards: CardViewModel[];
}

const rarities: CardRarity[] = [4, 3, 2];
const cardTypes: CardType[] = [1, 2, 3, 4, 5];

export default function CardsExplorer({ locale, initialCards }: Props) {
  const memory = useListPageMemory("cards");
  const [cards] = useState<CardViewModel[]>(initialCards);
  const [query, setQuery] = useState("");
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
      characters: selectedCharacters
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
        charMap.set(card.characterId, { id: card.characterId, name: card.characterName });
      }
    });
    return [...charMap.values()].sort((a, b) => a.id - b.id);
  }, [cards, selectedBands]);

  const filteredCards = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    return cards.filter((card) => {
      if (selectedRarities.length > 0 && !selectedRarities.includes(card.rarity)) return false;
      if (selectedCardTypes.length > 0 && !selectedCardTypes.includes(card.cardType)) return false;
      if (selectedBands.length > 0 && !selectedBands.includes(card.bandId)) return false;
      if (selectedCharacters.length > 0 && !selectedCharacters.includes(card.characterId)) return false;
      return !needle || card.searchText.includes(needle);
    });
  }, [cards, query, selectedRarities, selectedCardTypes, selectedBands, selectedCharacters]);

  const hasActiveFilters = Boolean(query) || selectedRarities.length > 0 || selectedCardTypes.length > 0 || selectedBands.length > 0 || selectedCharacters.length > 0;

  const handleBandToggle = (bandId: number) => {
    const nextBands = selectedBands.includes(bandId)
      ? selectedBands.filter((id) => id !== bandId)
      : [...selectedBands, bandId];
    
    setSelectedBands(nextBands);

    // Filter characters to only keep those that belong to the new set of bands
    if (nextBands.length === 0) {
      setSelectedCharacters([]);
    } else {
      const validCharIds = new Set<number>();
      cards.forEach((card) => {
        if (nextBands.includes(card.bandId)) {
          validCharIds.add(card.characterId);
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
    setQuery("");
    setSelectedRarities([]);
    setSelectedCardTypes([]);
    setSelectedBands([]);
    setSelectedCharacters([]);
    memory.clearState();
  };

  const quickFilterContent = (
    <BaseFilters
      variant="plain"
      title={t(locale, "cards.filterTitle")}
      searchValue={query}
      onSearchChange={setQuery}
      searchLabel={t(locale, "filter.search")}
      searchPlaceholder={t(locale, "cards.searchPlaceholder")}
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
        selectedRarities={selectedRarities as CardRarity[]}
        onChange={setSelectedRarities}
        getRarityLabel={(value) => t(locale, `cards.rarities.${value}`)}
      />

      <AttributeFilter
        title={t(locale, "cards.attribute")}
        attributes={cardTypes}
        selectedAttributes={selectedCardTypes as CardType[]}
        onChange={setSelectedCardTypes}
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

  useQuickFilter(t(locale, "cards.filterTitle"), quickFilterContent, [
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
          {filteredCards.map((card) => (
            <CardItem key={card.id} card={card} locale={locale} onCardClick={saveCurrentState} />
          ))}
        </div>
      )}
    </section>
  );
}

function CardItem({ card, locale, onCardClick }: { card: CardViewModel; locale: AppLocale; onCardClick: () => void }) {
  const alt = t(locale, "cards.cardImageAlt", { title: card.title, character: card.characterName });

  return (
    <a
      href={localizePath(`/cards/${card.id}`, locale)}
      onClick={onCardClick}
      className="group flex flex-col min-w-0 overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={card.id}
      aria-label={t(locale, "cards.openDetail", { title: card.title, character: card.characterName })}
    >
      <MemberCardArtwork
        assetId={card.assetId}
        characterId={card.characterId}
        rarity={card.rarity}
        cardType={card.cardType}
        alt={alt}
        attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
        fallbackLabel={card.characterName}
      />
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full border border-[var(--mn-border)]" style={{ backgroundColor: card.characterColor }} aria-hidden="true" />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]">{card.title}</h3>
            <p className="mt-1 truncate text-xs font-medium text-[var(--mn-text-muted)]">{card.characterName}</p>
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/40">
          <img className="h-5 w-auto max-w-14 object-contain" src={getRarityIconUrl(card.rarity)} alt={t(locale, `cards.rarities.${card.rarity}`)} />
          <div className="flex items-center min-w-0">
            <img
              className="h-4 w-auto max-w-[70px] object-contain block dark:hidden"
              src={getBandLogoUrl(card.bandId)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
                const sibling = (e.target as HTMLElement).nextElementSibling?.nextElementSibling as HTMLElement;
                if (sibling) sibling.style.display = 'inline';
              }}
            />
            <img
              className="h-4 w-auto max-w-[70px] object-contain hidden dark:block"
              src={getBandLogoWhiteUrl(card.bandId)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
                const sibling = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                if (sibling) sibling.style.display = 'inline';
              }}
            />
            <span className="truncate text-[11px] font-medium text-[var(--mn-text-muted)] hidden">{card.bandName}</span>
          </div>
        </div>
      </div>
    </a>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="mn-paper p-8 text-center sm:p-12">
      <h3 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "cards.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "cards.emptyDescription")}</p>
      <button type="button" onClick={onReset} className="mn-focus mn-stamp-press mt-6 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-6 py-3 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
        {t(locale, "cards.reset")}
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
    characters: [] as number[]
  };
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      query: typeof parsed.query === "string" ? parsed.query : "",
      rarities: Array.isArray(parsed.rarities) ? parsed.rarities : [],
      cardTypes: Array.isArray(parsed.cardTypes) ? parsed.cardTypes : [],
      bands: Array.isArray(parsed.bands) ? parsed.bands : [],
      characters: Array.isArray(parsed.characters) ? parsed.characters : []
    };
  } catch {
    return fallback;
  }
}

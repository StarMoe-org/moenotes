import { useEffect, useMemo, useState, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import BaseFilters, { FilterButton, FilterSection } from "@/components/shared/BaseFilters";
import QuickFilterButton from "@/components/shared/QuickFilterButton";
import SupportCardArtwork from "./SupportCardArtwork";
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
import {
  getBandSmallIconUrl,
  getBandLogoUrl,
  getBandLogoWhiteUrl,
  getCharacterFaceIconUrl,
} from "@/lib/cards/assets";

interface Props {
  locale: AppLocale;
  initialSupportCards: SupportCardViewModel[];
}

const rarities: SupportCardRarity[] = [4, 3, 2];
const cardTypes: SupportCardType[] = [1, 2, 3, 4, 5];

export default function SupportCardsExplorer({ locale, initialSupportCards }: Props) {
  const memory = useListPageMemory("support-cards");
  const [cards] = useState<SupportCardViewModel[]>(initialSupportCards);
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

  const hasActiveFilters =
    Boolean(query) ||
    selectedRarities.length > 0 ||
    selectedCardTypes.length > 0 ||
    selectedBands.length > 0 ||
    selectedCharacters.length > 0;

  const toggleFilter = (list: number[], setList: (next: number[]) => void, value: number) => {
    if (list.includes(value)) {
      setList(list.filter((v) => v !== value));
    } else {
      setList([...list, value]);
    }
  };

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
    setQuery("");
    setSelectedRarities([]);
    setSelectedCardTypes([]);
    setSelectedBands([]);
    setSelectedCharacters([]);
    memory.clearState();
  };

  const filters = (disableCollapse: boolean) => (
    <BaseFilters
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
      disableCollapse={disableCollapse}
    >
      <FilterSection title={t(locale, "cards.rarity")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedRarities.length === 0} onClick={() => setSelectedRarities([])}>
            ALL
          </FilterButton>
          {rarities.map((value) => {
            const name = t(locale, `cards.rarities.${value}`);
            return (
              <FilterButton
                key={value}
                active={selectedRarities.includes(value)}
                onClick={() => toggleFilter(selectedRarities, setSelectedRarities, value)}
              >
                <span className="flex items-center" title={name} aria-label={name}>
                  <img className="h-5 w-auto" src={getSupportRarityIconUrl(value)} alt={name} />
                </span>
              </FilterButton>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title={t(locale, "cards.attribute")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedCardTypes.length === 0} onClick={() => setSelectedCardTypes([])}>
            ALL
          </FilterButton>
          {cardTypes.map((value) => {
            const name = t(locale, `cards.attributes.${value}`);
            return (
              <FilterButton
                key={value}
                active={selectedCardTypes.includes(value)}
                onClick={() => toggleFilter(selectedCardTypes, setSelectedCardTypes, value)}
              >
                <span className="flex items-center" title={name} aria-label={name}>
                  <img className="h-5 w-5" src={getSupportCardTypeIconUrl(value)} alt={name} />
                </span>
              </FilterButton>
            );
          })}
        </div>
      </FilterSection>

      <FilterSection title={t(locale, "cards.band")}>
        <div className="flex flex-wrap gap-2">
          <FilterButton active={selectedBands.length === 0} onClick={handleBandReset}>
            ALL
          </FilterButton>
          {bands.map(([id, name]) => (
            <FilterButton key={id} active={selectedBands.includes(id)} onClick={() => handleBandToggle(id)}>
              <span className="flex items-center" title={name} aria-label={name}>
                <img className="h-5 w-auto object-contain" src={getBandSmallIconUrl(id)} alt={name} />
              </span>
            </FilterButton>
          ))}
        </div>
      </FilterSection>

      {selectedBands.length > 0 && bandCharacters.length > 0 && (
        <FilterSection title={t(locale, "nav.items.characters")}>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={selectedCharacters.length === 0} onClick={() => setSelectedCharacters([])}>
              ALL
            </FilterButton>
            {bandCharacters.map((char) => (
              <FilterButton
                key={char.id}
                active={selectedCharacters.includes(char.id)}
                onClick={() => toggleFilter(selectedCharacters, setSelectedCharacters, char.id)}
              >
                <span className="flex items-center" title={char.name} aria-label={char.name}>
                  <img
                    className="h-5 w-5 rounded-full object-cover bg-[var(--mn-cream-deep)]"
                    src={getCharacterFaceIconUrl(char.id)}
                    alt={char.name}
                  />
                </span>
              </FilterButton>
            ))}
          </div>
        </FilterSection>
      )}
    </BaseFilters>
  );

  return (
    <>
      <div className="mb-6 lg:hidden">{filters(false)}</div>
      <div className="grid min-w-0 gap-6 lg:grid-cols-[18rem_minmax(0,1fr)] lg:items-start">
        <aside className="sticky top-24 hidden min-w-0 lg:block">{filters(true)}</aside>
        <section className="min-w-0" aria-live="polite">
          {filteredCards.length === 0 ? (
            <EmptyState locale={locale} onReset={resetFilters} />
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
              {filteredCards.map((card) => (
                <SupportCardItem key={card.id} card={card} locale={locale} onCardClick={saveCurrentState} />
              ))}
            </div>
          )}
        </section>
      </div>

      <div className="lg:hidden">
        <QuickFilterButton
          title={t(locale, "supportCards.filterTitle")}
          buttonLabel={t(locale, "cards.quickFilter")}
          content={<div className="min-w-0">{filters(true)}</div>}
        />
      </div>
    </>
  );
}

function SupportCardItem({
  card,
  locale,
  onCardClick,
}: {
  card: SupportCardViewModel;
  locale: AppLocale;
  onCardClick: () => void;
}) {
  const alt = t(locale, "supportCards.cardImageAlt", { title: card.title, character: card.name });

  return (
    <a
      href={localizePath(`/support-cards/${card.id}`, locale)}
      onClick={onCardClick}
      className="group flex flex-col min-w-0 overflow-hidden rounded-3xl border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)] transition hover:-translate-y-1 hover:shadow-[var(--mn-shadow-stamp-lg)]"
      data-list-item-id={card.id}
      aria-label={t(locale, "supportCards.openDetail", { title: card.title, character: card.name })}
    >
      <SupportCardArtwork
        assetId={card.assetId}
        characterIds={card.characterIds}
        rarity={card.rarity}
        cardType={card.cardType}
        alt={alt}
        attributeLabel={t(locale, `cards.attributes.${card.cardType}`)}
        fallbackLabel={card.name}
      />
      <div className="flex flex-col flex-1 min-w-0 p-3 sm:p-4">
        <div className="flex min-w-0 items-start gap-2">
          <span
            className="mt-1 h-3 w-3 shrink-0 rounded-full border border-[var(--mn-border)]"
            style={{
              backgroundColor: card.characters[0]?.color || "var(--mn-accent)",
            }}
            aria-hidden="true"
          />
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-sm font-black leading-5 text-[var(--mn-text)]">{card.title}</h3>
            <p className="mt-1 truncate text-xs font-medium text-[var(--mn-text-muted)]">{card.name}</p>
          </div>
        </div>
        <div className="mt-auto pt-2 flex items-center justify-between gap-2 border-t border-dashed border-[var(--mn-text-muted)]/40">
          <img
            className="h-5 w-auto max-w-14 object-contain"
            src={getSupportRarityIconUrl(card.rarity)}
            alt={t(locale, `cards.rarities.${card.rarity}`)}
          />
          <div className="flex items-center min-w-0">
            <img
              className="h-4 w-auto max-w-[70px] object-contain block dark:hidden"
              src={getBandLogoUrl(card.bandId)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
                const sibling = (e.target as HTMLElement).nextElementSibling?.nextElementSibling as HTMLElement;
                if (sibling) sibling.style.display = "inline";
              }}
            />
            <img
              className="h-4 w-auto max-w-[70px] object-contain hidden dark:block"
              src={getBandLogoWhiteUrl(card.bandId)}
              alt=""
              aria-hidden="true"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
                const sibling = (e.target as HTMLElement).nextElementSibling as HTMLElement;
                if (sibling) sibling.style.display = "inline";
              }}
            />
            <span className="truncate text-[11px] font-medium text-[var(--mn-text-muted)] hidden">
              {card.bandName}
            </span>
          </div>
        </div>
      </div>
    </a>
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

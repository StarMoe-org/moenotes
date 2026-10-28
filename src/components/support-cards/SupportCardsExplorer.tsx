"use client";

import { useEffect, useCallback, useMemo } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import CardViewSwitch from "@/components/shared/CardViewSwitch";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import SupportCardItem, { SupportCardTile } from "@/components/support-cards/SupportCardItem";
import ServerScope from "@/components/shared/ServerScope";
import CardTable from "@/components/shared/CardTable";
import { CARD_SORT_FIELDS, cardSortReaders } from "@/lib/cards/list-sort";
import type { CardSkillNames } from "@/lib/masterdata/build-card-skill-names";
import { supportCardTableRow } from "@/lib/cards/table-rows";
import type { ServerFaceted } from "@/lib/servers/facets";
import { serverOnlyLabel, useServerList } from "@/lib/servers/use-content-server";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import { useCardView } from "@/lib/cards/use-card-view";
import { supportCardSubject, parseCardFilterState } from "@/lib/filter/card-filter";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { useNow } from "@/lib/schedule/use-now";
import { isSpoiler, useSpoiler } from "@/lib/settings/spoiler";

interface Props {
  locale: AppLocale;
  initialSupportCards: ServerFaceted<SupportCardViewModel>[];
  servers: GameServer[];
  /** Skill names by id (table view and skill sort). */
  skillNames: CardSkillNames;
}

export default function SupportCardsExplorer({ locale, servers, initialSupportCards, skillNames }: Props) {
  const memory = useListPageMemory("support-cards");
  const now = useNow();
  const { showSpoiler } = useSpoiler();
  const { server, pickServer, items: cards } = useServerList(locale, servers, initialSupportCards);
  const visibleCards = useMemo(() => {
    if (showSpoiler) return cards;
    return cards.filter((card) => !isSpoiler(card.startAt, now));
  }, [cards, showSpoiler, now]);
  const skillOf = useCallback((card: SupportCardViewModel) => skillNames.support[String(card.supportSkillId01)] ?? "", [skillNames]);
  const numericSort = useMemo(() => ({ fields: CARD_SORT_FIELDS, read: cardSortReaders(skillOf, Object.values(skillNames.support), locale) }), [skillOf, skillNames, locale]);
  const describe = useCallback((card: SupportCardViewModel) => {
    const catalog = skillNames.filters?.[server];
    return { ...supportCardSubject(card),
      skillCategories: [...(catalog?.support[String(card.supportSkillId01)] ?? []), ...(catalog?.support[String(card.supportSkillId02)] ?? [])],
      skillMissions: [...(catalog?.gekisouSupport[String(card.gekisouSupportSkillId01)] ?? []), ...(catalog?.gekisouSupport[String(card.gekisouSupportSkillId02)] ?? [])],
    };
  }, [skillNames, server]);
  const controller = useCardFilters(visibleCards, locale, "support-cards", describe, { numericSort });
  const { filters, setFilters, sorted, filtered, reset, hasActiveFilters, bands, characters } = controller;
  const [view, setView] = useCardView("support-cards");

  useEffect(() => {
    setFilters(parseCardFilterState(memory.state?.filtersHash));
  }, [memory.state?.filtersHash, setFilters]);

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
    memory.saveState({ scrollY: window.scrollY, filtersHash: JSON.stringify(filters) });
  }, [filters, memory]);

  useEffect(() => {
    window.addEventListener("beforeunload", saveCurrentState);
    return () => {
      window.removeEventListener("beforeunload", saveCurrentState);
      saveCurrentState();
    };
  }, [saveCurrentState]);

  const resetFilters = () => {
    reset();
    memory.clearState();
  };

  useQuickFilter(t(locale, "supportCards.filterTitle"), <CardFilters locale={locale} controller={controller} kind="support" skillFilters onReset={resetFilters} />, [
    controller.sort.value,
    filters,
    bands,
    characters,
    hasActiveFilters,
    filtered.length,
    cards.length,
    locale,
  ]);

  return (
    <ServerScope locale={locale} servers={servers} server={server} onChange={pickServer} actions={<CardViewSwitch locale={locale} value={view} onChange={setView} />}>
      <section className="min-w-0" aria-live="polite">
        {filtered.length === 0 ? (
          <EmptyState locale={locale} onReset={resetFilters} />
        ) : view === "table" ? (
          <CardTable locale={locale} rows={sorted.map((card) => supportCardTableRow(card, skillOf(card)))} routeId="support-cards" servers={servers} sort={controller.sort.value} onSortChange={controller.sort.onChange} onOpen={saveCurrentState} />
        ) : view === "square" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 4xl:grid-cols-12">
            {sorted.map((card) => (
              <SupportCardTile key={card.id} card={card} locale={locale} onClick={saveCurrentState} badge={serverOnlyLabel(locale, card, servers)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
            {sorted.map((card) => (
              <SupportCardItem key={card.id} card={card} locale={locale} onClick={saveCurrentState} badge={serverOnlyLabel(locale, card, servers)} />
            ))}
          </div>
        )}
      </section>
    </ServerScope>
  );
}

function EmptyState({ locale, onReset }: { locale: AppLocale; onReset: () => void }) {
  return (
    <div className="md3-surface p-8 text-center sm:p-12">
      <h3 className="font-[var(--md-ref-typeface-brand)] text-headline-small text-on-surface">{t(locale, "supportCards.emptyTitle")}</h3>
      <p className="mx-auto mt-3 max-w-xl text-body-medium leading-7 text-on-surface-variant">{t(locale, "supportCards.emptyDescription")}</p>
      <button type="button" onClick={onReset} className="md3-button md3-button--tonal mt-6">
        {t(locale, "supportCards.reset")}
      </button>
    </div>
  );
}

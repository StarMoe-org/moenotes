import { useEffect, useCallback } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import CardViewSwitch from "@/components/shared/CardViewSwitch";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import MemberCardItem, { MemberCardTile } from "@/components/cards/MemberCardItem";
import ServerScope from "@/components/shared/ServerScope";
import type { ServerFaceted } from "@/lib/servers/facets";
import { serverOnlyLabel, useServerList } from "@/lib/servers/use-content-server";
import { useListPageMemory } from "@/lib/scroll/use-list-page-memory";
import { useCardView } from "@/lib/cards/use-card-view";
import { memberCardSubject, parseCardFilterState } from "@/lib/filter/card-filter";
import type { CardViewModel } from "@/lib/cards/data";

interface Props {
  locale: AppLocale;
  initialCards: ServerFaceted<CardViewModel>[];
  servers: GameServer[];
}

export default function CardsExplorer({ locale, initialCards, servers }: Props) {
  const memory = useListPageMemory("cards");
  const { server, pickServer, items: cards } = useServerList(locale, servers, initialCards);
  const controller = useCardFilters(cards, locale, "cards", memberCardSubject);
  const { filters, setFilters, sorted, filtered, reset, hasActiveFilters, bands, characters } = controller;
  const [view, setView] = useCardView("cards");

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

  useQuickFilter(t(locale, "cards.filterTitle"), <CardFilters locale={locale} controller={controller} kind="member" onReset={resetFilters} />, [
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
        ) : view === "square" ? (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 3xl:grid-cols-10 4xl:grid-cols-12">
            {sorted.map((card) => (
              <MemberCardTile key={card.id} card={card} locale={locale} onClick={saveCurrentState} badge={serverOnlyLabel(locale, card, servers)} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 3xl:grid-cols-6 4xl:grid-cols-7 5xl:grid-cols-8">
            {sorted.map((card) => (
              <MemberCardItem key={card.id} card={card} locale={locale} onClick={saveCurrentState} badge={serverOnlyLabel(locale, card, servers)} />
            ))}
          </div>
        )}
      </section>
    </ServerScope>
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

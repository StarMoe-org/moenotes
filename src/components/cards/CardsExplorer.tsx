import { useEffect, useCallback, useMemo } from "react";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import CardViewSwitch from "@/components/shared/CardViewSwitch";
import { useQuickFilter } from "@/lib/filter/use-quick-filter";
import MemberCardItem, { MemberCardTile } from "@/components/cards/MemberCardItem";
import ServerScope from "@/components/shared/ServerScope";
import CardTable from "@/components/shared/CardTable";
import { CARD_SORT_FIELDS, cardSortReaders } from "@/lib/cards/list-sort";
import type { CardSkillNames } from "@/lib/masterdata/build-card-skill-names";
import { cardTableRow } from "@/lib/cards/table-rows";
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
  /** Skill names by id (table view and skill sort). */
  skillNames: CardSkillNames;
}

export default function CardsExplorer({ locale, initialCards, servers, skillNames }: Props) {
  const memory = useListPageMemory("cards");
  const { server, pickServer, items: cards } = useServerList(locale, servers, initialCards);
  const skillOf = useCallback((card: CardViewModel) => skillNames.live[String(card.liveSkillId)] ?? "", [skillNames]);
  const numericSort = useMemo(() => ({ fields: CARD_SORT_FIELDS, read: cardSortReaders(skillOf, Object.values(skillNames.live), locale) }), [skillOf, skillNames, locale]);
  const controller = useCardFilters(cards, locale, "cards", memberCardSubject, { numericSort });
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
        ) : view === "table" ? (
          <CardTable locale={locale} rows={sorted.map((card) => cardTableRow(card, skillOf(card)))} routeId="cards" servers={servers} sort={controller.sort.value} onSortChange={controller.sort.onChange} onOpen={saveCurrentState} />
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
    <MdMuiProvider>
      <Card variant="outlined" sx={{ p: { xs: 4, sm: 6 }, textAlign: "center" }}>
        <Typography sx={{ fontFamily: "var(--mn-font-display)", fontSize: 24, color: "var(--md-sys-color-on-surface)" }}>
          {t(locale, "cards.emptyTitle")}
        </Typography>
        <Typography variant="body2" sx={{ mx: "auto", mt: 1.5, maxWidth: "36rem", fontWeight: 500, lineHeight: 1.75, color: "var(--md-sys-color-on-surface-variant)" }}>
          {t(locale, "cards.emptyDescription")}
        </Typography>
        <Button variant="outlined" onClick={onReset} sx={{ mt: 3 }}>
          {t(locale, "cards.reset")}
        </Button>
      </Card>
    </MdMuiProvider>
  );
}

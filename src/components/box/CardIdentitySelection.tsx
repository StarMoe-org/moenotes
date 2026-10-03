import { useMemo, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { CardKind } from "@/lib/box/model";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { memberCardSubject, supportCardSubject, type CardFilterSubject } from "@/lib/filter/card-filter";
import { useCardView } from "@/lib/cards/use-card-view";
import { t } from "@/i18n";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import CardViewSwitch from "@/components/shared/CardViewSwitch";
import MemberCardItem, { MemberCardTile } from "@/components/cards/MemberCardItem";
import SupportCardItem, { SupportCardTile } from "@/components/support-cards/SupportCardItem";

type IdentityChoice = { kind: "member"; card: CardViewModel } | { kind: "snap"; card: SupportCardViewModel };
const describeChoice = (choice: IdentityChoice): CardFilterSubject => choice.kind === "member" ? memberCardSubject(choice.card) : supportCardSubject(choice.card);

/** Box identity selection composes the same filters, view switch and cards as the catalogue pages. */
export default function CardIdentitySelection({ locale, kind, catalog, value, onChange, onCancel, disabledIds = [], allowUnknown = true, confirmLabel, clearLabel, disabledLabel }: {
  locale: AppLocale; kind: CardKind; catalog: { members: readonly CardViewModel[]; snaps: readonly SupportCardViewModel[] };
  value: string | null; onChange: (id: string | null) => void; onCancel?: (() => void) | undefined;
  disabledIds?: readonly string[]; allowUnknown?: boolean; confirmLabel?: string | undefined;
  clearLabel?: string | undefined; disabledLabel?: string | undefined;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const [selected, setSelected] = useState(value);
  const choices = useMemo<IdentityChoice[]>(() => kind === "member" ? catalog.members.map(card => ({ kind: "member", card })) : catalog.snaps.map(card => ({ kind: "snap", card })), [kind, catalog]);
  const filters = useCardFilters(choices, locale, `box-identity-${kind}`, describeChoice);
  const [view, setView] = useCardView(`box-identity-${kind}`);
  const chosen = choices.find(choice => String(choice.card.id) === selected);
  const name = (choice: IdentityChoice) => choice.kind === "member" ? choice.card.characterName : choice.card.name;
  return <section className="dw-card-identity-selection">
    <CardFilters locale={locale} kind={kind === "member" ? "member" : "support"} controller={filters} variant="card" searchPlaceholder={tr("searchCards")} />
    <div className="dw-card-identity-results">
      <div className="dw-toolbar"><CardViewSwitch locale={locale} value={view} onChange={setView} />
        {allowUnknown && <button type="button" aria-pressed={selected === null} onClick={() => setSelected(null)}>{clearLabel ?? tr("unknown")}</button>}
      </div>
      {!filters.sorted.length && <p className="dw-muted">{tr("emptyCards")}</p>}
      <ul className={`dw-card-identity-grid dw-card-identity-grid--${view}`}>{filters.sorted.map(choice => {
        const id = String(choice.card.id), disabled = disabledIds.includes(id);
        const selection = { selected: selected === id, disabled, label: `${tr("chooseCard")}: ${name(choice)} · ${choice.card.title}`,
          onSelect: () => setSelected(id) };
        return <li key={id} data-card-id={id} className={selected === id ? "is-selected" : ""} title={disabled ? disabledLabel ?? tr("alreadyInBox") : undefined}>
          {choice.kind === "member" ? view === "card" ? <MemberCardItem card={choice.card} locale={locale} selection={selection} /> : <MemberCardTile card={choice.card} locale={locale} selection={selection} />
            : view === "card" ? <SupportCardItem card={choice.card} locale={locale} selection={selection} /> : <SupportCardTile card={choice.card} locale={locale} selection={selection} />}
        </li>;
      })}</ul>
    </div>
    <div className="dw-card-identity-confirm"><span>{chosen ? name(chosen) : clearLabel ?? tr("unknown")}{chosen && <small>{chosen.card.title}</small>}</span>
      {onCancel && <button type="button" onClick={onCancel}>{tr("close")}</button>}
      <button type="button" className="dw-primary" disabled={selected === null ? !allowUnknown : !chosen || disabledIds.includes(selected)} onClick={() => onChange(selected)}>{confirmLabel ?? tr("useSelectedCard")}</button>
    </div>
  </section>;
}

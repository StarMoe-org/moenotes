import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import FilterButton from "@/components/shared/FilterButton";
import SupportCardArtwork from "@/components/support-cards/SupportCardArtwork";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { groupSnapSkillCards, searchSnapSkills, type SnapCardSkillChoice } from "@/lib/chart-data/snap-search";
import { snapChoiceKey } from "@/lib/chart-data/snap-catalogue";
import { resolveSnapSupportCardId, validateSnapSkillSelection, type SnapLegalityContext, type SnapLegalityIssue } from "@/lib/chart-data/snap-legality";
import type { FiveSlots, SnapSkillChoice, SnapSkillKind, SnapSkillSelection } from "@/lib/chart-data/snap-types";
import { Icon } from "./shared";

interface Props {
  locale: AppLocale;
  choices: readonly SnapSkillChoice[];
  selections: FiveSlots<SnapSkillSelection | null>;
  cards?: ReadonlyMap<number, SupportCardViewModel> | undefined;
  loading?: boolean;
  error?: string | null;
  onOpen?: () => void;
  onSelect: (slot: number, selection: SnapSkillSelection | null) => void;
  onReset: () => void;
  renderContext?: (slot: number, choice: SnapSkillChoice | undefined) => ReactNode;
  renderSlot?: (slot: number, choice: SnapSkillChoice | undefined) => ReactNode;
  renderFormation?: (choices: readonly (SnapSkillChoice | undefined)[]) => ReactNode;
  renderArtwork?: ((card: SupportCardViewModel, className: string) => ReactNode) | undefined;
  validateSelection?: ((slot: number, selection: SnapSkillSelection | null) => SnapLegalityIssue | null) | undefined;
  onReject?: ((issue: SnapLegalityIssue) => void) | undefined;
}

/** Five paired effect slots. Artwork, filters and accessible dialog come from the site's component library. */
export default function SnapSkillPicker({ locale, choices, selections, cards, loading = false, error, onOpen, onSelect, onReset, renderContext, renderSlot, renderFormation, renderArtwork, validateSelection, onReject }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SnapSkillKind | "all">("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [limit, setLimit] = useState(24);
  const [rejection, setRejection] = useState<SnapLegalityIssue | null>(null);
  const byKey = useMemo(() => new Map(choices.map((choice) => [choice.key, choice])), [choices]);
  const groups = useMemo(() => {
    const physical = groupSnapSkillCards(choices).flat().map((choice) => {
      const card = cards?.get(choice.cardId);
      return card ? { ...choice, searchTerms: [card.searchText, card.name, card.title, card.bandName, ...card.characters.map((character) => character.name)] } : choice;
    });
    return groupSnapSkillCards(searchSnapSkills(physical, query, kind, availableOnly));
  }, [choices, cards, query, kind, availableOnly]);
  const pickerContext = useMemo<SnapLegalityContext>(() => ({ members: new Map(), choices,
    supportCardIds: new Set(choices.flatMap((choice) => choice.rankBindings.map((binding) => binding.cardId))) }), [choices]);
  const invalid = (index: number, selection: SnapSkillSelection | null) => validateSnapSkillSelection(pickerContext, selection, index) || validateSelection?.(index, selection) || null;
  const issueText = (issue: SnapLegalityIssue) => tr(`legality.${issue.code}`, { n: (issue.otherSlot ?? 0) + 1 });
  const active = selections.filter(Boolean).length;
  const title = (choice: SnapSkillChoice) => choice.name || tr("unnamed", { id: choice.skillId });
  const selectedChoice = (selection: SnapSkillSelection | null) => {
    const choice = selection ? byKey.get(snapChoiceKey(selection.kind, selection.skillId, selection.level)) : undefined;
    if (!choice) return undefined;
    const cardId = resolveSnapSupportCardId(selection, choices);
    return { ...choice, cardIds: cardId === null ? [] : [cardId], rankBindings: choice.rankBindings.filter((binding) => binding.cardId === cardId) };
  };
  const open = (index: number) => { setSlot(index); setRejection(null); setQuery(""); setLimit(24); onOpen?.(); };
  const commit = (index: number, selection: SnapSkillSelection | null) => {
    const issue = invalid(index, selection);
    if (issue) { setRejection(issue); onReject?.(issue); return; }
    onSelect(index, selection); setRejection(null);
    setSlot(null);
  };
  const pick = (choice: SnapCardSkillChoice | null) => {
    if (slot !== null) commit(slot, choice ? { kind: choice.kind, skillId: choice.skillId, level: choice.level, cardId: choice.cardId } : null);
  };
  const art = (choice: SnapSkillChoice, className: string) => {
    const card = choice.cardIds.map((id) => cards?.get(id)).find(Boolean);
    if (card && renderArtwork) return renderArtwork(card, className);
    return card ? <SupportCardArtwork key={`${card.id}:${card.assetId}`} assetId={card.assetId} characterIds={card.characterIds} rarity={card.rarity}
      cardType={card.cardType} alt="" attributeLabel={t(locale, `cards.attributes.${card.cardType}`)} fallbackLabel={card.name} className={className} />
      : <span className={`mn-cd-snap-symbol ${className}`} aria-hidden="true"><Icon name="star" /></span>;
  };

  return (
    <section className="mn-cd-snap mn-cd-glass" aria-label={tr("title")}>
      <div className="mn-cd-snap-heading">
        <div><h3><Icon name="star" />{tr("title")}<span className="mn-cd-snap-optional">{tr("optional")}</span></h3><p>{tr("intro")}</p></div>
        <button type="button" className="mn-cd-ghost" disabled={!active} onClick={onReset}>{tr("reset")}</button>
      </div>
      <div className={renderFormation ? "mn-cd-native-formation-scroll" : undefined}>
      <div className={renderFormation ? "mn-cd-native-formation-stage" : "mn-cd-snap-slots"}>
        {renderFormation?.(selections.map(selectedChoice))}
        {selections.map((selection, index) => {
          const choice = selectedChoice(selection);
          const context = renderContext?.(index, choice);
          return (
            <div key={index} data-snap-slot={index} className={`mn-cd-snap-slot${selection ? " selected" : ""}${renderSlot || renderFormation ? " mn-cd-snap-slot--native" : ""}${renderFormation ? " mn-cd-snap-slot--formation" : ""}`}>
              {renderSlot?.(index, choice)}
              <button type="button" className="mn-cd-snap-slot-button" aria-haspopup="dialog" aria-expanded={slot === index}
                aria-label={tr("chooseSlot", { n: index + 1 })} onClick={() => open(index)}>
                <span className="mn-cd-snap-slot-no">{tr("slot", { n: index + 1 })}</span>
                {!renderSlot && !renderFormation ? choice ? art(choice, "mn-cd-snap-slot-art") : <span className="mn-cd-snap-plus" aria-hidden="true">+</span> : null}
                <span className="mn-cd-snap-slot-name">{choice ? title(choice) : selection ? tr("unavailable") : tr("none")}</span>
                <span className="mn-cd-snap-slot-meta">{choice ? `${tr(`kind.${choice.kind}`)} · ${tr("level", { n: choice.level })}` : tr("choose")}</span>
              </button>
              {context ? <div className="mn-cd-snap-context">{context}</div> : null}
              {selection ? <button type="button" className="mn-cd-snap-remove" aria-label={tr("removeSlot", { n: index + 1 })} onClick={() => commit(index, null)}>×</button> : null}
            </div>
          );
        })}
      </div>
      </div>
      <p className="mn-cd-snap-footnote">{active ? tr("selected", { n: active }) : tr("defaultNone")}</p>
      <Modal isOpen={slot !== null} onClose={() => setSlot(null)} title={tr("dialog", { n: (slot ?? 0) + 1 })} closeLabel={tr("close")} size="xl">
        <div className="mn-cd-snap-picker">
          <label className="mn-cd-snap-search"><Icon name="search" /><input type="search" value={query} placeholder={tr("searchPlaceholder")}
            aria-label={tr("search")} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} /></label>
          <div className="mn-cd-snap-filter-row">
            {(["all", "support", "gekisou-support"] as const).map((value) => <FilterButton key={value} active={kind === value}
              onClick={() => { setKind(value); setLimit(24); }}>{tr(value === "all" ? "allKinds" : `kind.${value}`)}</FilterButton>)}
            <label className="mn-cd-snap-available"><input type="checkbox" checked={availableOnly} onChange={(event) => { setAvailableOnly(event.target.checked); setLimit(24); }} />{tr("availableOnly")}</label>
          </div>
          <button type="button" className="mn-cd-snap-none" onClick={() => pick(null)}><span aria-hidden="true">–</span><strong>{tr("none")}</strong><span>{tr("noneHint")}</span></button>
          {rejection ? <p className="mn-cd-snap-state" role="alert">{issueText(rejection)}</p> : null}
          {loading ? <p className="mn-cd-snap-state" role="status">{tr("loading")}</p> : error ? <p className="mn-cd-snap-state" role="alert">{error}</p> : (
            <>
              <p className="mn-cd-snap-results" role="status">{tr("results", { n: groups.length })}</p>
              <div className="mn-cd-snap-options">
                {groups.slice(0, limit).map((levels) => {
                  const current = slot === null ? null : selections[slot];
                  const currentCardId = resolveSnapSupportCardId(current, choices);
                  const sameCard = current?.kind === levels[0]!.kind && current.skillId === levels[0]!.skillId && currentCardId === levels[0]!.cardId;
                  const choice = sameCard
                    ? levels.find((entry) => entry.level === current.level) ?? levels.at(-1)! : levels.at(-1)!;
                  const card = cards?.get(choice.cardId);
                  return <SkillOption key={`${choice.kind}:${choice.cardId}:${choice.skillId}`} choice={choice} levels={levels} title={card?.name || title(choice)}
                    cardTitle={card?.title} art={art(choice, "mn-cd-snap-option-art")} selected={!!sameCard}
                    tr={tr} onPick={pick} issue={(entry) => slot === null ? null : invalid(slot, { kind: entry.kind, skillId: entry.skillId, level: entry.level, cardId: entry.cardId })}
                    issueText={issueText} />;
                })}
              </div>
              {!groups.length ? <p className="mn-cd-snap-state">{tr("empty")}</p> : groups.length > limit
                ? <button type="button" className="mn-cd-ghost mn-cd-snap-more" onClick={() => setLimit((value) => value + 24)}>{tr("showMore")}</button> : null}
            </>
          )}
        </div>
      </Modal>
    </section>
  );
}

function SkillOption({ choice: initial, levels, title, cardTitle, art, selected, tr, onPick, issue, issueText }: {
  choice: SnapCardSkillChoice; levels: SnapCardSkillChoice[]; title: string; cardTitle?: string | undefined; art: ReactNode; selected: boolean;
  tr: (key: string, values?: Record<string, string | number>) => string; onPick: (choice: SnapCardSkillChoice) => void;
  issue: (choice: SnapCardSkillChoice) => SnapLegalityIssue | null; issueText: (issue: SnapLegalityIssue) => string;
}) {
  const [level, setLevel] = useState(initial.level);
  const choice = levels.find((entry) => entry.level === level) ?? initial;
  const invalid = issue(choice);
  return (
    <article data-skill-kind={choice.kind} data-skill-id={choice.skillId} data-support-card-id={choice.cardId} className={`mn-cd-snap-option${selected ? " selected" : ""}`}>
      <div className="mn-cd-snap-option-top">{art}<div><span className="mn-cd-snap-kind">{tr(`kind.${choice.kind}`)}</span><h4>{title}</h4>
        {cardTitle ? <p className="mn-cd-snap-member-option-title">{cardTitle}</p> : null}
        <span className="mn-cd-snap-id">{tr("skillId", { id: choice.skillId })}</span></div></div>
      {choice.description ? <p className="mn-cd-snap-description">{choice.description}</p> : null}
      {choice.requirements.length ? <p className="mn-cd-snap-requirements">{choice.requirements.map((requirement) => tr(`requirements.${requirement}`)).join(" · ")}</p> : null}
      <div className="mn-cd-snap-option-actions"><label><span>{tr("levelLabel")}</span><select value={choice.level} onChange={(event) => setLevel(Number(event.target.value))}>
        {levels.map((entry) => <option key={entry.level} value={entry.level}>{tr("level", { n: entry.level })}</option>)}</select></label>
        <button type="button" className="mn-cd-ghost" disabled={!!invalid} title={invalid ? issueText(invalid) : undefined} onClick={() => onPick(choice)}>{tr(choice.status === "unsupported" ? "unsupported" : "select")}</button></div>
    </article>
  );
}

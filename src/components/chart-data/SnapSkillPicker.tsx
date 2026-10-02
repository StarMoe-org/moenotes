import SiriusLoader from "@/components/shared/SiriusLoader";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import FilterButton from "@/components/shared/FilterButton";
import { FilterSection, FilterToggle } from "@/components/shared/BaseFilters";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import { SupportSquareArtwork } from "@/components/shared/CardSquareArtwork";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { supportCardSubject, type CardFilterSubject } from "@/lib/filter/card-filter";
import { groupSnapSkillCards, type SnapCardSkillChoice } from "@/lib/chart-data/snap-search";
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
  canReset?: boolean;
  renderContext?: (slot: number, choice: SnapSkillChoice | undefined) => ReactNode;
  renderSlot?: (slot: number, choice: SnapSkillChoice | undefined) => ReactNode;
  renderFormation?: (choices: readonly (SnapSkillChoice | undefined)[]) => ReactNode;
  validateSelection?: ((slot: number, selection: SnapSkillSelection | null) => SnapLegalityIssue | null) | undefined;
  onReject?: ((issue: SnapLegalityIssue) => void) | undefined;
}

/** One physical Snap card's skill, with every level it has. */
type SkillGroup = SnapCardSkillChoice[];
const groupKey = (group: SkillGroup) => `${group[0]!.kind}:${group[0]!.cardId}:${group[0]!.skillId}`;
const supported = (choice: SnapSkillChoice) => choice.status !== "unsupported";

/** Five paired effect slots. The dialog is the support card list's filters and square icons, like the song picker. */
export default function SnapSkillPicker({ locale, choices, selections, cards, loading = false, error, onOpen, onSelect, onReset, canReset, renderContext, renderSlot, renderFormation, validateSelection, onReject }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const [slot, setSlot] = useState<number | null>(null);
  const [kind, setKind] = useState<SnapSkillKind | "all">("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [staged, setStaged] = useState<{ key: string; level: number } | null>(null);
  const [rejection, setRejection] = useState<SnapLegalityIssue | null>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const byKey = useMemo(() => new Map(choices.map((choice) => [choice.key, choice])), [choices]);
  const groups = useMemo(() => groupSnapSkillCards(choices), [choices]);
  const title = (choice: SnapSkillChoice) => choice.name || tr("unnamed", { id: choice.skillId });

  // Cards carry the list filters; the skill's own name, description and IDs join the search text.
  const describe = useCallback((group: SkillGroup): CardFilterSubject => {
    const first = group[0]!, card = cards?.get(first.cardId);
    const skillText = [first.name, first.description, ...first.searchTerms, first.skillId, first.cardId, ...first.effectTypes].join(" ");
    return card
      ? { ...supportCardSubject(card), searchText: `${card.searchText} ${card.name} ${card.title} ${card.bandName} ${card.characters.map((character) => character.name).join(" ")} ${skillText}` }
      : { id: first.cardId, title: first.name, rarity: 0, cardType: 0, bandId: 0, bandName: "", characters: [], searchText: skillText };
  }, [cards]);
  const match = useCallback((group: SkillGroup) => (kind === "all" || group[0]!.kind === kind) && (!availableOnly || group.some(supported)), [kind, availableOnly]);
  const resetSkillFilters = useCallback(() => { setKind("all"); setAvailableOnly(false); }, []);
  // Lives outside the modal body, so the filters survive closing and reopening (as in the song picker).
  const picker = useCardFilters(groups, locale, "snap-skill", describe, { match, active: kind !== "all" || availableOnly, onReset: resetSkillFilters });

  const pickerContext = useMemo<SnapLegalityContext>(() => ({ members: new Map(), choices,
    supportCardIds: new Set(choices.flatMap((choice) => choice.rankBindings.map((binding) => binding.cardId))) }), [choices]);
  const invalid = (index: number, selection: SnapSkillSelection | null) => validateSnapSkillSelection(pickerContext, selection, index) || validateSelection?.(index, selection) || null;
  const issueText = (issue: SnapLegalityIssue) => tr(`legality.${issue.code}`, { n: (issue.otherSlot ?? 0) + 1 });
  const active = selections.filter(Boolean).length;
  const selectedChoice = (selection: SnapSkillSelection | null) => {
    const choice = selection ? byKey.get(snapChoiceKey(selection.kind, selection.skillId, selection.level)) : undefined;
    if (!choice) return undefined;
    const cardId = resolveSnapSupportCardId(selection, choices);
    return { ...choice, cardIds: cardId === null ? [] : [cardId], rankBindings: choice.rankBindings.filter((binding) => binding.cardId === cardId) };
  };
  const selectionKey = (selection: SnapSkillSelection | null) => {
    const cardId = resolveSnapSupportCardId(selection, choices);
    return selection && cardId !== null ? `${selection.kind}:${cardId}:${selection.skillId}` : null;
  };
  const art = (choice: SnapSkillChoice, className: string) => {
    const card = choice.cardIds.map((id) => cards?.get(id)).find(Boolean);
    return card ? <SupportSquareArtwork key={`${card.id}:${card.assetId}`} locale={locale} card={card} className={className} />
      : <span className={`mn-cd-snap-symbol ${className}`} aria-hidden="true"><Icon name="star" /></span>;
  };

  const open = (index: number) => {
    const current = selections[index] ?? null, key = selectionKey(current);
    setStaged(key && current ? { key, level: current.level } : null);
    setSlot(index); setRejection(null); onOpen?.();
  };
  const commit = (index: number, selection: SnapSkillSelection | null) => {
    const issue = invalid(index, selection);
    if (issue) { setRejection(issue); onReject?.(issue); return; }
    onSelect(index, selection); setRejection(null);
    setSlot(null);
  };

  const currentKey = slot === null ? null : selectionKey(selections[slot] ?? null);
  useEffect(() => {
    if (slot === null || currentKey === null) return;
    // After the panel has mounted: bring the current Snap into view.
    const frame = requestAnimationFrame(() => {
      gridRef.current?.querySelector(`[data-skill-group="${CSS.escape(currentKey)}"]`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [slot, currentKey]);

  const stagedGroup = staged ? groups.find((group) => groupKey(group) === staged.key) : undefined;
  const stagedLevels = stagedGroup ? stagedGroup.filter((choice) => !availableOnly || supported(choice)) : [];
  const stagedChoice = stagedGroup ? stagedLevels.find((choice) => choice.level === staged!.level) ?? stagedLevels.at(-1) ?? stagedGroup.at(-1)! : undefined;
  const stagedSelection: SnapSkillSelection | null = stagedChoice ? { kind: stagedChoice.kind, skillId: stagedChoice.skillId, level: stagedChoice.level, cardId: stagedChoice.cardId } : null;
  const stagedIssue = slot !== null && stagedSelection ? invalid(slot, stagedSelection) : null;
  const stagedCard = stagedChoice ? cards?.get(stagedChoice.cardId) : undefined;

  return (
    <section className="mn-cd-snap mn-cd-glass" aria-label={tr("title")}>
      <div className="mn-cd-snap-heading">
        <div><h3><Icon name="star" />{tr("title")}<span className="mn-cd-snap-optional">{tr("optional")}</span></h3><p>{tr("intro")}</p></div>
        <button type="button" className="mn-cd-ghost" disabled={!(canReset ?? Boolean(active))} onClick={onReset}>{tr("reset")}</button>
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
                aria-label={tr("chooseSlot", { n: index + 1 })} title={choice ? title(choice) : selection ? tr("unavailable") : tr("none")} onClick={() => open(index)}>
                <span className="mn-cd-snap-slot-no">{tr("slot", { n: index + 1 })}</span>
                {!renderSlot && !renderFormation ? choice ? art(choice, "mn-cd-snap-slot-art") : <span className="mn-cd-snap-plus" aria-hidden="true">+</span> : null}
                <span className="mn-cd-snap-slot-name">{choice ? title(choice) : selection ? tr("unavailable") : tr("none")}</span>
                <span className="mn-cd-snap-slot-meta">{choice ? `${tr(`kind.${choice.kind}`)} · ${tr("level", { n: choice.level })}` : tr("choose")}</span>
              </button>
              {renderFormation ? <span className="mn-cd-snap-slot-tooltip" aria-hidden="true">{choice ? title(choice) : selection ? tr("unavailable") : tr("none")}</span> : null}
              {context ? <div className="mn-cd-snap-context">{context}</div> : null}
              {selection ? <button type="button" className="mn-cd-snap-remove" aria-label={tr("removeSlot", { n: index + 1 })} onClick={() => commit(index, null)}>×</button> : null}
            </div>
          );
        })}
      </div>
      </div>
      <p className="mn-cd-snap-footnote">{active ? tr("selected", { n: active }) : tr("defaultNone")}</p>
      <Modal isOpen={slot !== null} onClose={() => setSlot(null)} title={tr("dialog", { n: (slot ?? 0) + 1 })} closeLabel={tr("close")} size="xl">
        <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
          <div className="min-w-0 lg:sticky lg:top-0">
            <CardFilters locale={locale} controller={picker} kind="support" variant="card" searchPlaceholder={tr("searchPlaceholder")}>
              <FilterSection title={tr("kindFilter")}>
                <div className="flex flex-wrap gap-2">
                  {(["all", "support", "gekisou-support"] as const).map((value) => <FilterButton key={value} active={kind === value}
                    onClick={() => setKind(value)}>{tr(value === "all" ? "allKinds" : `kind.${value}`)}</FilterButton>)}
                </div>
              </FilterSection>
              <FilterToggle checked={availableOnly} onChange={setAvailableOnly} label={tr("availableOnly")} />
            </CardFilters>
          </div>

          <div className="min-w-0 space-y-3">
            <button type="button" className="mn-cd-snap-none" onClick={() => slot !== null && commit(slot, null)}><span aria-hidden="true">–</span><strong>{tr("none")}</strong><span>{tr("noneHint")}</span></button>
            {loading ? <SiriusLoader locale={locale} compact className="mn-cd-snap-state" label={tr("loading")} /> : error ? <p className="mn-cd-snap-state" role="alert">{error}</p> : picker.sorted.length === 0 ? (
              <div className="mn-paper p-8 text-center">
                <p className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{tr("empty")}</p>
                <button type="button" onClick={picker.reset}
                  className="mn-focus mn-stamp-press mt-4 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
                  {t(locale, "filter.reset")}
                </button>
              </div>
            ) : (
              <ul ref={gridRef} aria-label={tr("results", { n: picker.sorted.length })} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                {picker.sorted.map((group) => {
                  const key = groupKey(group), first = group.at(-1)!, card = cards?.get(first.cardId);
                  const isStaged = staged?.key === key, isCurrent = currentKey === key;
                  return <li key={key} data-skill-group={key} data-skill-kind={first.kind} data-skill-id={first.skillId} data-support-card-id={first.cardId} className="min-w-0">
                    <button type="button" aria-pressed={isStaged} title={title(first)}
                      onClick={() => { setRejection(null); setStaged({ key, level: isCurrent && slot !== null ? selections[slot]!.level : first.level }); }}
                      className={`mn-focus group flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl border-[1.5px] p-1.5 text-center transition ${
                        isStaged ? "border-[var(--mn-accent)] bg-[var(--mn-paper)] ring-2 ring-[var(--mn-accent)]" : "border-transparent hover:-translate-y-0.5 hover:border-[var(--mn-border)] hover:bg-[var(--mn-paper)]"}`}>
                      {art(first, "w-full")}
                      <span className={`block w-full truncate text-xs font-black ${isStaged ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)]"}`}>{card?.name || title(first)}</span>
                      <span className="block w-full truncate text-[10px] font-medium text-[var(--mn-text-muted)]">{title(first)}</span>
                      <span className={`block w-full truncate text-[9px] font-bold ${first.kind === "gekisou-support" ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text-muted)]"}`}>{tr(`kind.${first.kind}`)}</span>
                    </button>
                  </li>;
                })}
              </ul>
            )}
            <div className="mn-cd-snap-member-confirm">
              {stagedChoice ? <>
                <div className="mn-cd-snap-member-preview">
                  {art(stagedChoice, "mn-cd-snap-member-preview-art")}
                  <div>
                    <span>{tr("skillChosen")} · {tr(`kind.${stagedChoice.kind}`)} · {tr("skillId", { id: stagedChoice.skillId })}</span>
                    <strong>{title(stagedChoice)}</strong>
                    {stagedCard ? <span>{stagedCard.name}{stagedCard.title ? ` · ${stagedCard.title}` : ""}</span> : null}
                  </div>
                </div>
                <div className="mn-cd-snap-member-levels" role="group" aria-label={tr("levelLabel")}>
                  <span>{tr("levelLabel")}</span>
                  <div className="mn-cd-snap-filter-row">
                    {stagedLevels.map((choice) => <FilterButton key={choice.level} active={choice.level === stagedChoice.level}
                      onClick={() => { setRejection(null); setStaged({ key: staged!.key, level: choice.level }); }}>{tr("level", { n: choice.level })}</FilterButton>)}
                  </div>
                </div>
                {stagedChoice.description ? <p className="mn-cd-snap-description w-full">{stagedChoice.description}</p> : null}
                {stagedChoice.requirements.length ? <p className="mn-cd-snap-requirements w-full">{stagedChoice.requirements.map((requirement) => tr(`requirements.${requirement}`)).join(" · ")}</p> : null}
                {rejection ? <p className="mn-cd-snap-state" role="alert">{issueText(rejection)}</p> : null}
                <button type="button" className="mn-cd-ghost mn-cd-snap-member-apply" disabled={!!stagedIssue} title={stagedIssue ? issueText(stagedIssue) : undefined}
                  onClick={() => slot !== null && commit(slot, stagedSelection)}>{tr(stagedChoice.status === "unsupported" ? "unsupported" : "select")}</button>
              </> : <p className="mn-cd-note">{tr("skillPickHint")}</p>}
            </div>
          </div>
        </div>
      </Modal>
    </section>
  );
}

import { useMemo, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import Modal from "@/components/shared/Modal";
import FilterButton from "@/components/shared/FilterButton";
import SupportCardArtwork from "@/components/support-cards/SupportCardArtwork";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import { groupSnapSkills, searchSnapSkills } from "@/lib/chart-data/snap-search";
import { snapChoiceKey } from "@/lib/chart-data/snap-catalogue";
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
  renderContext?: (slot: number, choice: SnapSkillChoice) => ReactNode;
}

/** Five paired effect slots. Artwork, filters and accessible dialog come from the site's component library. */
export default function SnapSkillPicker({ locale, choices, selections, cards, loading = false, error, onOpen, onSelect, onReset, renderContext }: Props) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const [slot, setSlot] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<SnapSkillKind | "all">("all");
  const [availableOnly, setAvailableOnly] = useState(false);
  const [limit, setLimit] = useState(24);
  const byKey = useMemo(() => new Map(choices.map((choice) => [choice.key, choice])), [choices]);
  const groups = useMemo(() => groupSnapSkills(searchSnapSkills(choices, query, kind, availableOnly)), [choices, query, kind, availableOnly]);
  const active = selections.filter(Boolean).length;
  const title = (choice: SnapSkillChoice) => choice.name || tr("unnamed", { id: choice.skillId });
  const selectedChoice = (selection: SnapSkillSelection | null) => selection ? byKey.get(snapChoiceKey(selection.kind, selection.skillId, selection.level)) : undefined;
  const open = (index: number) => { setSlot(index); setQuery(""); setLimit(24); onOpen?.(); };
  const pick = (choice: SnapSkillChoice | null) => {
    if (slot === null) return;
    onSelect(slot, choice ? { kind: choice.kind, skillId: choice.skillId, level: choice.level } : null);
    setSlot(null);
  };
  const art = (choice: SnapSkillChoice, className: string) => {
    const card = choice.cardIds.map((id) => cards?.get(id)).find(Boolean);
    return card ? <SupportCardArtwork assetId={card.assetId} characterIds={card.characterIds} rarity={card.rarity}
      cardType={card.cardType} alt="" attributeLabel={t(locale, `cards.attributes.${card.cardType}`)} fallbackLabel={card.name} className={className} />
      : <span className={`mn-cd-snap-symbol ${className}`} aria-hidden="true"><Icon name="star" /></span>;
  };

  return (
    <section className="mn-cd-snap mn-cd-glass" aria-label={tr("title")}>
      <div className="mn-cd-snap-heading">
        <div><h3><Icon name="star" />{tr("title")}<span className="mn-cd-snap-optional">{tr("optional")}</span></h3><p>{tr("intro")}</p></div>
        <button type="button" className="mn-cd-ghost" disabled={!active} onClick={onReset}>{tr("reset")}</button>
      </div>
      <div className="mn-cd-snap-slots">
        {selections.map((selection, index) => {
          const choice = selectedChoice(selection);
          return (
            <div key={index} data-snap-slot={index} className={`mn-cd-snap-slot${selection ? " selected" : ""}`}>
              <button type="button" className="mn-cd-snap-slot-button" aria-haspopup="dialog" aria-expanded={slot === index}
                aria-label={tr("chooseSlot", { n: index + 1 })} onClick={() => open(index)}>
                <span className="mn-cd-snap-slot-no">{tr("slot", { n: index + 1 })}</span>
                {choice ? art(choice, "mn-cd-snap-slot-art") : <span className="mn-cd-snap-plus" aria-hidden="true">+</span>}
                <span className="mn-cd-snap-slot-name">{choice ? title(choice) : selection ? tr("unavailable") : tr("none")}</span>
                <span className="mn-cd-snap-slot-meta">{choice ? `${tr(`kind.${choice.kind}`)} · ${tr("level", { n: choice.level })}` : tr("choose")}</span>
              </button>
              {choice && renderContext ? <div className="mn-cd-snap-context">{renderContext(index, choice)}</div> : null}
              {selection ? <button type="button" className="mn-cd-snap-remove" aria-label={tr("removeSlot", { n: index + 1 })} onClick={() => onSelect(index, null)}>×</button> : null}
            </div>
          );
        })}
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
          {loading ? <p className="mn-cd-snap-state" role="status">{tr("loading")}</p> : error ? <p className="mn-cd-snap-state" role="alert">{error}</p> : (
            <>
              <p className="mn-cd-snap-results" role="status">{tr("results", { n: groups.length })}</p>
              <div className="mn-cd-snap-options">
                {groups.slice(0, limit).map((levels) => {
                  const current = slot === null ? null : selections[slot];
                  const choice = current && current.kind === levels[0]!.kind && current.skillId === levels[0]!.skillId
                    ? levels.find((entry) => entry.level === current.level) ?? levels.at(-1)! : levels.at(-1)!;
                  return <SkillOption key={`${choice.kind}:${choice.skillId}`} choice={choice} levels={levels} title={title(choice)}
                    art={art(choice, "mn-cd-snap-option-art")} selected={current?.kind === choice.kind && current.skillId === choice.skillId}
                    tr={tr} onPick={pick} />;
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

function SkillOption({ choice: initial, levels, title, art, selected, tr, onPick }: {
  choice: SnapSkillChoice; levels: SnapSkillChoice[]; title: string; art: ReactNode; selected: boolean;
  tr: (key: string, values?: Record<string, string | number>) => string; onPick: (choice: SnapSkillChoice) => void;
}) {
  const [level, setLevel] = useState(initial.level);
  const choice = levels.find((entry) => entry.level === level) ?? initial;
  return (
    <article data-skill-kind={choice.kind} data-skill-id={choice.skillId} className={`mn-cd-snap-option${selected ? " selected" : ""}`}>
      <div className="mn-cd-snap-option-top">{art}<div><span className="mn-cd-snap-kind">{tr(`kind.${choice.kind}`)}</span><h4>{title}</h4>
        <span className="mn-cd-snap-id">{tr("skillId", { id: choice.skillId })}</span></div></div>
      {choice.description ? <p className="mn-cd-snap-description">{choice.description}</p> : null}
      {choice.requirements.length ? <p className="mn-cd-snap-requirements">{choice.requirements.map((requirement) => tr(`requirements.${requirement}`)).join(" · ")}</p> : null}
      <div className="mn-cd-snap-option-actions"><label><span>{tr("levelLabel")}</span><select value={choice.level} onChange={(event) => setLevel(Number(event.target.value))}>
        {levels.map((entry) => <option key={entry.level} value={entry.level}>{tr("level", { n: entry.level })}</option>)}</select></label>
        <button type="button" className="mn-cd-ghost" disabled={choice.status === "unsupported"} onClick={() => onPick(choice)}>{tr(choice.status === "unsupported" ? "unsupported" : "select")}</button></div>
    </article>
  );
}

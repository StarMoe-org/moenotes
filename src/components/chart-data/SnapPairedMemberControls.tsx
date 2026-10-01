import { useMemo, useState, type ReactNode } from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import Modal from "@/components/shared/Modal";
import FilterButton from "@/components/shared/FilterButton";
import MemberCardArtwork from "@/components/shared/MemberCardArtwork";
import type { CardViewModel } from "@/lib/cards/data";
import type { SnapMemberSelection } from "@/lib/chart-data/snap-query";
import { draftSnapMember, searchSnapMembers, type SearchableSnapMember } from "@/lib/chart-data/member-search";
import { validateSnapMemberSelection, type SnapLegalityContext, type SnapLegalityIssue } from "@/lib/chart-data/snap-legality";
import { Icon } from "./shared";

export interface SnapReferenceMember extends SearchableSnapMember {}

/** The picker stages member and level together, so browsing does not start replay jobs. */
export default function SnapPairedMemberControls({ locale, members, value, onChange, renderArtwork, onOpen, validateSelection, onReject, variant = "card" }: {
  locale: AppLocale;
  members: readonly SnapReferenceMember[];
  value: SnapMemberSelection | null;
  onChange: (member: SnapMemberSelection | null) => void;
  renderArtwork?: ((vm: CardViewModel, className: string) => ReactNode) | undefined;
  onOpen?: (() => void) | undefined;
  validateSelection?: ((selection: SnapMemberSelection | null) => SnapLegalityIssue | null) | undefined;
  onReject?: ((issue: SnapLegalityIssue) => void) | undefined;
  variant?: "card" | "overlay" | undefined;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [band, setBand] = useState<number | null>(null);
  const [attribute, setAttribute] = useState<number | null>(null);
  const [limit, setLimit] = useState(24);
  const [draft, setDraft] = useState<SnapMemberSelection | null>(null);
  const [rejection, setRejection] = useState<SnapLegalityIssue | null>(null);
  const member = members.find((entry) => entry.id === value?.memberId);
  const draftMember = members.find((entry) => entry.id === draft?.memberId);
  const filtered = useMemo(() => searchSnapMembers(members, query, band, attribute), [members, query, band, attribute]);
  const bands = useMemo(() => [...new Map(members.filter((entry) => entry.vm?.bandId && entry.vm.bandName)
    .map((entry) => [entry.vm!.bandId, entry.vm!.bandName])).entries()].sort((a, b) => a[0] - b[0]), [members]);
  const attributes = useMemo(() => [...new Set(members.flatMap((entry) => entry.vm ? [entry.vm.cardType] : []))].sort(), [members]);
  const levels = draftMember ? [...new Set(draftMember.gkLevels)].filter((level) => Number.isSafeInteger(level) && level > 0).sort((a, b) => a - b) : [];
  const pickerContext = useMemo<SnapLegalityContext>(() => ({ members: new Map(members.map((entry) => [entry.id,
    { id: entry.id, characterId: entry.vm?.characterId ?? 0, gkLevels: entry.gkLevels }])), choices: [], supportCardIds: new Set() }), [members]);
  const invalid = (selection: SnapMemberSelection | null) => validateSnapMemberSelection(pickerContext, selection, -1) || validateSelection?.(selection) || null;
  const issueText = (issue: SnapLegalityIssue) => tr(`legality.${issue.code}`, { n: (issue.otherSlot ?? 0) + 1 });
  const reject = (issue: SnapLegalityIssue) => { setRejection(issue); onReject?.(issue); };
  const art = (entry: SnapReferenceMember, className: string) => {
    const vm = entry.vm;
    if (!vm) return <span className={`mn-cd-snap-member-placeholder ${className}`} aria-hidden="true"><Icon name="image" /></span>;
    return renderArtwork ? renderArtwork(vm, className)
      : <MemberCardArtwork key={`${vm.id}:${vm.assetId}`} assetId={vm.assetId} characterId={vm.characterId} rarity={vm.rarity} cardType={vm.cardType}
        alt="" attributeLabel={t(locale, `cards.attributes.${vm.cardType}`)} fallbackLabel={entry.name} className={className} />;
  };
  const begin = () => { setDraft(value ? { ...value } : null); setRejection(null); setQuery(""); setBand(null); setAttribute(null); setLimit(24); setOpen(true); onOpen?.(); };
  const choose = (selection: SnapMemberSelection | null) => {
    const issue = invalid(selection);
    if (issue) { reject(issue); return; }
    setRejection(null); setDraft(selection);
  };
  const commit = (selection: SnapMemberSelection | null) => {
    const issue = invalid(selection);
    if (issue) { reject(issue); return; }
    onChange(selection ? { ...selection } : null);
    setRejection(null);
    setOpen(false);
  };

  return <div className={`mn-cd-snap-paired${variant === "overlay" ? " mn-cd-snap-paired--overlay" : ""}`}>
    <button type="button" className={`mn-cd-snap-member-button${value ? " selected" : ""}${variant === "overlay" ? " mn-cd-snap-member-trigger-overlay" : ""}`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`${tr("chooseMember")}: ${member?.name || (value ? tr("unavailable") : tr("memberUnset"))}`} onClick={begin}>
      {variant === "overlay" ? <span className="mn-cd-snap-member-trigger-label">{tr("chooseMember")}</span> : <>
      <span className="mn-cd-snap-member-label">{tr("pairedMember")}</span>
      {member ? art(member, "mn-cd-snap-member-art") : <span className="mn-cd-snap-member-placeholder mn-cd-snap-member-art" aria-hidden="true"><span>+</span></span>}
      <span className="mn-cd-snap-member-name">{member ? member.vm?.characterName || member.name : value ? tr("unavailable") : tr("memberUnset")}</span>
      <span className="mn-cd-snap-member-meta">{member ? member.vm?.title || tr("memberId", { id: member.id }) : tr("chooseMember")}</span>
      {member ? <span className="mn-cd-snap-member-level">{value?.gekisouLevel === null ? tr("noGkSkill") : tr("level", { n: value?.gekisouLevel ?? 0 })}</span> : null}
      </>}
    </button>
    {value ? <button type="button" className="mn-cd-snap-member-clear" aria-label={tr("memberClear")} onClick={() => commit(null)}>×</button> : null}
    <Modal isOpen={open} onClose={() => setOpen(false)} title={tr("memberDialog")} closeLabel={tr("close")} size="xl">
      <div className="mn-cd-snap-picker mn-cd-snap-member-picker">
        <label className="mn-cd-snap-search"><Icon name="search" /><input type="search" value={query} placeholder={tr("memberSearchPlaceholder")}
          aria-label={tr("memberSearch")} onChange={(event) => { setQuery(event.target.value); setLimit(24); }} /></label>
        <div className="mn-cd-snap-member-filters">
          <div className="mn-cd-snap-filter-row" role="group" aria-label={t(locale, "cards.band")}>
            <FilterButton active={band === null} onClick={() => { setBand(null); setLimit(24); }}>{t(locale, "cards.allBands")}</FilterButton>
            {bands.map(([id, name]) => <FilterButton key={id} active={band === id} onClick={() => { setBand(id); setLimit(24); }}>{name}</FilterButton>)}
          </div>
          <div className="mn-cd-snap-filter-row" role="group" aria-label={t(locale, "cards.attribute")}>
            <FilterButton active={attribute === null} onClick={() => { setAttribute(null); setLimit(24); }}>{t(locale, "cards.allAttributes")}</FilterButton>
            {attributes.map((type) => <FilterButton key={type} active={attribute === type} onClick={() => { setAttribute(type); setLimit(24); }}>{t(locale, `cards.attributes.${type}`)}</FilterButton>)}
          </div>
        </div>
        <button type="button" className={`mn-cd-snap-none${draft === null ? " selected" : ""}`} aria-pressed={draft === null} onClick={() => choose(null)}>
          <span aria-hidden="true">–</span><strong>{tr("memberUnset")}</strong><span>{tr("memberNoneHint")}</span>
        </button>
        <p className="mn-cd-snap-results" role="status">{tr("memberResults", { n: filtered.length })}</p>
        <div className="mn-cd-snap-member-options">
          {filtered.slice(0, limit).map((entry) => {
            const selection = draftSnapMember(draft, entry.id), issue = invalid(selection);
            return <button key={entry.id} type="button" data-member-id={entry.id} disabled={!!issue} title={issue ? issueText(issue) : undefined}
            className={`mn-cd-snap-member-option${draft?.memberId === entry.id ? " selected" : ""}`} aria-pressed={draft?.memberId === entry.id}
            onClick={() => choose(selection)}>
            {art(entry, "mn-cd-snap-member-option-art")}
            <strong>{entry.vm?.characterName || entry.name}</strong>
            {entry.vm?.title ? <span className="mn-cd-snap-member-option-title">{entry.vm.title}</span> : null}
            <span className="mn-cd-snap-member-option-meta">{entry.vm?.bandName ? `${entry.vm.bandName} · ` : ""}{tr("memberId", { id: entry.id })}</span>
          </button>; })}
        </div>
        {!filtered.length ? <p className="mn-cd-snap-state">{tr("memberEmpty")}</p> : filtered.length > limit
          ? <button type="button" className="mn-cd-ghost mn-cd-snap-more" onClick={() => setLimit((previous) => previous + 24)}>{tr("showMore")}</button> : null}
        <div className="mn-cd-snap-member-confirm">
          <div className="mn-cd-snap-member-preview">
            {draftMember ? art(draftMember, "mn-cd-snap-member-preview-art") : null}
            <div><span>{tr("memberChosen")}</span><strong>{draftMember?.name || (draft ? tr("unavailable") : tr("memberUnset"))}</strong></div>
          </div>
          {draftMember ? <div className="mn-cd-snap-member-levels" role="group" aria-label={tr("gkLevel")}>
            <span>{tr("gkLevel")}</span>
            <div className="mn-cd-snap-filter-row"><FilterButton active={draft?.gekisouLevel === null}
              onClick={() => choose({ memberId: draftMember.id, gekisouLevel: null })}>{tr("noGkSkill")}</FilterButton>
              {levels.map((level) => <FilterButton key={level} active={draft?.gekisouLevel === level}
                onClick={() => choose({ memberId: draftMember.id, gekisouLevel: level })}>{tr("level", { n: level })}</FilterButton>)}
            </div>
          </div> : null}
          {rejection ? <p className="mn-cd-snap-state" role="alert">{issueText(rejection)}</p> : null}
          <button type="button" className="mn-cd-ghost mn-cd-snap-member-apply" disabled={!!invalid(draft)} title={invalid(draft) ? issueText(invalid(draft)!) : undefined}
            onClick={() => commit(draft)}>{tr("memberApply")}</button>
        </div>
      </div>
    </Modal>
  </div>;
}

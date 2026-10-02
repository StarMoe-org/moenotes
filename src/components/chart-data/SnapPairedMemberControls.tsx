import { useEffect, useMemo, useRef, useState } from "react";
import { t } from "@/i18n";
import type { AppLocale } from "@/config/locales";
import Modal from "@/components/shared/Modal";
import FilterButton from "@/components/shared/FilterButton";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import { MemberSquareArtwork } from "@/components/shared/CardSquareArtwork";
import type { SnapMemberSelection } from "@/lib/chart-data/snap-query";
import { draftSnapMember, type SearchableSnapMember } from "@/lib/chart-data/member-search";
import { validateSnapMemberSelection, type SnapLegalityContext, type SnapLegalityIssue } from "@/lib/chart-data/snap-legality";
import { memberCardSubject, type CardFilterSubject } from "@/lib/filter/card-filter";
import { Icon } from "./shared";

export interface SnapReferenceMember extends SearchableSnapMember {}

/** Members without artwork data keep their snapshot name and ID; card filters other than search skip them. */
function describeMember(entry: SnapReferenceMember): CardFilterSubject {
  const ids = `${entry.id} ${entry.name}`;
  return entry.vm
    ? { ...memberCardSubject(entry.vm), searchText: `${ids} ${entry.vm.characterName} ${entry.vm.bandName} ${entry.vm.title} ${entry.vm.searchText}` }
    : { id: entry.id, title: entry.name, rarity: 0, cardType: 0, bandId: 0, bandName: "", characters: [], searchText: ids };
}

/** The picker stages member and level together, so browsing does not start replay jobs. */
export default function SnapPairedMemberControls({ locale, members, value, onChange, onOpen, validateSelection, onReject, variant = "card" }: {
  locale: AppLocale;
  members: readonly SnapReferenceMember[];
  value: SnapMemberSelection | null;
  onChange: (member: SnapMemberSelection | null) => void;
  onOpen?: (() => void) | undefined;
  validateSelection?: ((selection: SnapMemberSelection | null) => SnapLegalityIssue | null) | undefined;
  onReject?: ((issue: SnapLegalityIssue) => void) | undefined;
  variant?: "card" | "overlay" | undefined;
}) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `chartData.snap.${key}`, values);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<SnapMemberSelection | null>(null);
  const [rejection, setRejection] = useState<SnapLegalityIssue | null>(null);
  // Lives outside the modal body, so the filters survive closing and reopening (as in the song picker).
  const picker = useCardFilters(members, locale, "snap-member", describeMember);
  const gridRef = useRef<HTMLUListElement>(null);
  const member = members.find((entry) => entry.id === value?.memberId);
  const draftMember = members.find((entry) => entry.id === draft?.memberId);
  const levels = draftMember ? [...new Set(draftMember.gkLevels)].filter((level) => Number.isSafeInteger(level) && level > 0).sort((a, b) => a - b) : [];
  const pickerContext = useMemo<SnapLegalityContext>(() => ({ members: new Map(members.map((entry) => [entry.id,
    { id: entry.id, characterId: entry.vm?.characterId ?? 0, gkLevels: entry.gkLevels }])), choices: [], supportCardIds: new Set() }), [members]);
  const invalid = (selection: SnapMemberSelection | null) => validateSnapMemberSelection(pickerContext, selection, -1) || validateSelection?.(selection) || null;
  const issueText = (issue: SnapLegalityIssue) => tr(`legality.${issue.code}`, { n: (issue.otherSlot ?? 0) + 1 });
  const reject = (issue: SnapLegalityIssue) => { setRejection(issue); onReject?.(issue); };
  const art = (entry: SnapReferenceMember, className: string) => entry.vm
    ? <MemberSquareArtwork key={`${entry.vm.id}:${entry.vm.assetId}`} locale={locale} card={entry.vm} className={className} />
    : <span className={`mn-cd-snap-member-placeholder ${className}`} aria-hidden="true"><Icon name="image" /></span>;
  const begin = () => { setDraft(value ? { ...value } : null); setRejection(null); setOpen(true); onOpen?.(); };
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

  const currentId = value?.memberId ?? null;
  useEffect(() => {
    if (!open || currentId === null) return;
    // After the panel has mounted: bring the current member into view.
    const frame = requestAnimationFrame(() => {
      gridRef.current?.querySelector(`[data-member-id="${currentId}"]`)?.scrollIntoView({ block: "center" });
    });
    return () => cancelAnimationFrame(frame);
  }, [open, currentId]);

  return <div className={`mn-cd-snap-paired${variant === "overlay" ? " mn-cd-snap-paired--overlay" : ""}`}>
    <button type="button" className={`mn-cd-snap-member-button${value ? " selected" : ""}${variant === "overlay" ? " mn-cd-snap-member-trigger-overlay" : ""}`} aria-haspopup="dialog" aria-expanded={open}
      aria-label={`${tr("chooseMember")}: ${member?.name || (value ? tr("unavailable") : tr("memberUnset"))}`} onClick={begin}>
      {variant === "overlay" ? <span className="mn-cd-snap-member-trigger-label">{member?.vm?.characterName || member?.name || tr("chooseMember")}</span> : <>
      <span className="mn-cd-snap-member-label">{tr("pairedMember")}</span>
      {member ? art(member, "mn-cd-snap-member-art") : <span className="mn-cd-snap-member-placeholder mn-cd-snap-member-art" aria-hidden="true"><span>+</span></span>}
      <span className="mn-cd-snap-member-name">{member ? member.vm?.characterName || member.name : value ? tr("unavailable") : tr("memberUnset")}</span>
      <span className="mn-cd-snap-member-meta">{member ? member.vm?.title || tr("memberId", { id: member.id }) : tr("chooseMember")}</span>
      {member ? <span className="mn-cd-snap-member-level">{value?.gekisouLevel === null ? tr("noGkSkill") : tr("level", { n: value?.gekisouLevel ?? 0 })}</span> : null}
      </>}
    </button>
    {value ? <button type="button" className="mn-cd-snap-member-clear" aria-label={tr("memberClear")} onClick={() => commit(null)}>×</button> : null}
    <Modal isOpen={open} onClose={() => setOpen(false)} title={tr("memberDialog")} closeLabel={tr("close")} size="xl">
      <div className="grid gap-5 lg:grid-cols-[15rem_minmax(0,1fr)] lg:items-start">
        <div className="min-w-0 lg:sticky lg:top-0">
          <CardFilters locale={locale} controller={picker} kind="member" variant="card" searchPlaceholder={tr("memberSearchPlaceholder")} />
        </div>

        <div className="min-w-0 space-y-3">
          <p className="px-1 text-xs font-medium text-[var(--mn-text-muted)]">{tr("profileHint")}</p>
          <button type="button" className={`mn-cd-snap-none${draft === null ? " selected" : ""}`} aria-pressed={draft === null} onClick={() => choose(null)}>
            <span aria-hidden="true">–</span><strong>{tr("memberUnset")}</strong><span>{tr("memberNoneHint")}</span>
          </button>
          {picker.sorted.length === 0 ? (
            <div className="mn-paper p-8 text-center">
              <p className="font-[var(--mn-font-display)] text-lg text-[var(--mn-text)]">{tr("memberEmpty")}</p>
              <button type="button" onClick={picker.reset}
                className="mn-focus mn-stamp-press mt-4 rounded-full border-[1.5px] border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
                {t(locale, "filter.reset")}
              </button>
            </div>
          ) : (
            <ul ref={gridRef} aria-label={tr("memberResults", { n: picker.sorted.length })} className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
              {picker.sorted.map((entry) => {
                const selection = draftSnapMember(draft, entry.id), issue = invalid(selection), selected = draft?.memberId === entry.id;
                return <li key={entry.id} data-member-id={entry.id} className="min-w-0">
                  <button type="button" disabled={!!issue} title={issue ? issueText(issue) : undefined} aria-pressed={selected} onClick={() => choose(selection)}
                    className={`mn-focus group flex w-full min-w-0 flex-col items-center gap-1 rounded-2xl border-[1.5px] p-1.5 text-center transition disabled:cursor-not-allowed disabled:opacity-40 ${
                      selected ? "border-[var(--mn-accent)] bg-[var(--mn-paper)] ring-2 ring-[var(--mn-accent)]" : "border-transparent enabled:hover:-translate-y-0.5 enabled:hover:border-[var(--mn-border)] enabled:hover:bg-[var(--mn-paper)]"}`}>
                    {art(entry, "w-full")}
                    <span className={`block w-full truncate text-xs font-black ${selected ? "text-[var(--mn-accent-deep)]" : "text-[var(--mn-text)]"}`}>{entry.vm?.characterName || entry.name}</span>
                    <span className="block w-full truncate text-[10px] font-medium text-[var(--mn-text-muted)]">{entry.vm?.title || tr("memberId", { id: entry.id })}</span>
                  </button>
                </li>;
              })}
            </ul>
          )}
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
      </div>
    </Modal>
  </div>;
}

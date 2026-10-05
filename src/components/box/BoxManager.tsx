import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { answerField, createCard, mergeBoxes, parseBox, CARD_FIELDS, type BoxCard, type CardBox, type CardFieldName, type CardKind } from "@/lib/box/model";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import Modal from "@/components/shared/Modal";
import { MemberSquareArtwork } from "@/components/shared/CardSquareArtwork";
import SupportCardArtwork from "@/components/support-cards/SupportCardArtwork";
import PlayerStateManager from "./PlayerStateManager";
import type { PlayerFieldCatalogue } from "@/lib/box/player-catalog";
import CardIdentitySelection from "./CardIdentitySelection";
import { ObservedLevelControl, StepControl } from "@/components/shared/CardGrowthControls";
import type { BoxMode } from "@/lib/box/session";
import CollectionIcon from "./CollectionIcon";
import CollectionActionMenu from "./CollectionActionMenu";
import "@/styles/card-box-collection.css";

export interface BoxCatalog { members: readonly CardViewModel[]; snaps: readonly SupportCardViewModel[] }
export interface BoxManagerProps extends BoxCatalog {
  locale: AppLocale; box: CardBox; mode: BoxMode; busy: boolean; playerCatalogue?: PlayerFieldCatalogue | null;
  commit: (box: CardBox, expectedRevision?: number) => Promise<boolean>;
  onRecognize?: (() => void) | undefined; onGuide?: (() => void) | undefined;
  onStorage?: (() => void) | undefined; onDelete?: (() => void) | undefined;
  /** Opens the game save picker; it then becomes the primary import action. */
  onImportSave?: (() => void) | undefined;
  /** The Box as its linked game save describes it. Cards are then shown read-only; edits still go to `box`. */
  view?: CardBox | undefined;
  /** Shown under the toolbar, e.g. the linked save or a sign-in hint. */
  notice?: ReactNode;
}
export interface BoxCardEditorProps extends BoxCatalog { locale: AppLocale; box: CardBox; cardKey: string | null; busy: boolean; commit: (box: CardBox, expectedRevision?: number) => Promise<boolean>; onClose: () => void;
  /** Shows the card's values without editing, for cards read from a game save. */
  readOnly?: boolean }
export function cardTitle(card: BoxCard, catalog: BoxCatalog): string {
  const id = card.identity.value;
  return card.kind === "member" ? catalog.members.find(item => String(item.id) === id)?.characterName ?? id ?? "?"
    : catalog.snaps.find(item => String(item.id) === id)?.name ?? id ?? "?";
}
export function cardSubtitle(card: BoxCard, catalog: BoxCatalog): string {
  return card.kind === "member" ? catalog.members.find(item => String(item.id) === card.identity.value)?.title ?? ""
    : catalog.snaps.find(item => String(item.id) === card.identity.value)?.characters.map(character => character.name).join(" · ") ?? "";
}
export function cardRarityLabel(card: BoxCard, catalog: BoxCatalog): string | null {
  const row = (card.kind === "member" ? catalog.members : catalog.snaps).find(item => String(item.id) === card.identity.value);
  if (!row) return null;
  return ({ 2: "R", 3: "SR", 4: "SSR", 10: "EX", 20: "BD" } as const)[row.rarity];
}
export function BoxArtwork({ card, catalog, locale }: { card: BoxCard; catalog: BoxCatalog; locale: AppLocale }) {
  const member = card.kind === "member" ? catalog.members.find(item => String(item.id) === card.identity.value) : undefined;
  const snap = card.kind === "snap" ? catalog.snaps.find(item => String(item.id) === card.identity.value) : undefined;
  return member ? <MemberSquareArtwork card={member} locale={locale} className="dw-card-art" level={card.fields.level.value ?? undefined} rank={card.fields.rank.value ?? undefined} /> : snap ? <SupportCardArtwork assetId={snap.assetId} characterIds={snap.characterIds} rarity={snap.rarity} cardType={snap.cardType} alt={snap.name} attributeLabel={t(locale, `cards.attributes.${snap.cardType}`)} fallbackLabel={snap.name} className="dw-card-art dw-snap-art" /> : <div className="dw-card-art dw-card-unknown">?</div>;
}
export function BoxCardEditor({ locale, box, cardKey, busy, commit, onClose, members, snaps, readOnly = false }: BoxCardEditorProps) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const scope = JSON.stringify([box.server, box.id, cardKey]);
  const latest = useRef({ box, cardKey, scope }); latest.current = { box, cardKey, scope };
  const generation = useRef(0);
  const [draft, setDraft] = useState<{ scope: string; card: BoxCard; revision: number } | null>(null);
  const [choosingIdentity, setChoosingIdentity] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const catalog = { members, snaps };
  const editing = draft?.scope === scope ? draft.card : null;
  const changed = draft?.revision !== box.revision;
  // Revision updates keep the draft intact; only opening or changing its Box/card captures a new revision.
  useEffect(() => {
    generation.current++;
    const input = latest.current, card = input.box.cards.find(card => card.key === input.cardKey);
    setDraft(card ? { scope: input.scope, card: structuredClone(card), revision: input.box.revision } : null);
    setChoosingIdentity(false); setSaveError(false);
    return () => { generation.current++; };
  }, [scope]);
  function reload() {
    const card = box.cards.find(card => card.key === cardKey);
    setDraft(card ? { scope, card: structuredClone(card), revision: box.revision } : null);
    setChoosingIdentity(false); setSaveError(false);
    if (!card) onClose();
  }
  function field(name: CardFieldName, value: string) {
    const numeric = value === "" ? null : Number(value);
    if (numeric !== null && (!Number.isSafeInteger(numeric) || numeric < 1 || (name !== "level" && numeric > 5))) return;
    const observation = { id: crypto.randomUUID(), value: numeric, source: "manual" as const, at: Date.now() };
    setDraft(previous => previous?.scope === scope ? { ...previous, card: { ...previous.card,
      fields: { ...previous.card.fields, [name]: answerField(previous.card.fields[name], observation) } } } : previous);
  }
  async function save(remove = false) {
    if (!draft || !editing || busy || changed) return;
    const attempt = generation.current;
    const saved = await commit({ ...box, cards: remove ? box.cards.filter(card => card.key !== editing.key)
      : box.cards.map(card => card.key === editing.key ? editing : card) }, draft.revision);
    if (latest.current.scope !== scope || generation.current !== attempt) return;
    setSaveError(!saved);
    if (saved) onClose();
  }
  if (readOnly) return <Modal historyNavigation={false} isOpen={editing !== null} onClose={onClose} title={editing ? cardTitle(editing, catalog) : tr("editCard")} closeLabel={tr("close")} size="lg">
    {editing && <div className="dw-edit"><div><BoxArtwork card={editing} catalog={catalog} locale={locale} /><h3>{cardTitle(editing, catalog)}</h3><span className="dw-card-subtitle">{cardSubtitle(editing, catalog)}</span></div><div className="dw-dialog">
      <p className="cb-read-only-note"><CollectionIcon name="game" />{tr("gameSave.readOnly")}</p>
      <dl className="cb-read-only-facts">{CARD_FIELDS.filter(name => editing.kind === "member" || name === "level" || name === "rank").map(name => <div key={name}><dt>{name === "level" ? tr("collection.cultivationLevel") : tr(name)}</dt>
        <dd aria-label={editing.fields[name].value === null ? tr("unknown") : undefined}>{editing.fields[name].value ?? "—"}</dd></div>)}</dl>
    </div></div>}
  </Modal>;
  return <>
    <Modal historyNavigation={false} isOpen={editing !== null} onClose={onClose} title={tr("editCard")} closeLabel={tr("close")} size="lg">
      {editing && <div className="dw-edit"><div><BoxArtwork card={editing} catalog={catalog} locale={locale} /><h3>{cardTitle(editing, catalog)}</h3><span className="dw-tag">{tr(editing.identity.status)}</span></div><div className="dw-dialog">
        {changed && <p className="dw-alert" role="alert">{tr("editChanged")} <button onClick={reload}>{tr("reloadEdit")}</button></p>}
        {saveError && <p className="dw-alert" role="alert">{tr("saveError")}</p>}
        <button type="button" onClick={() => setChoosingIdentity(true)}>{tr("changeCard")}</button>
        {editing.identity.needsReview && <p className="dw-muted">{tr("identityReview", { ids: editing.candidates.join(" / ") })}</p>}
        {CARD_FIELDS.filter(name => editing.kind === "member" || name === "level" || name === "rank").map(name => <div className="dw-field" key={name}><span className="dw-field-source">{tr(editing.fields[name].status)}</span>
          {name === "level" ? <ObservedLevelControl locale={locale} value={editing.fields[name].value} label={tr(name)} onChange={value => field(name, value === null ? "" : String(value))} />
            : <StepControl label={tr(name)} value={editing.fields[name].value ?? 0} options={[0, 1, 2, 3, 4, 5]} formatOption={value => value === 0 ? tr("unknown") : String(value)} onChange={value => field(name, value === 0 ? "" : String(value))} />}
          {editing.fields[name].needsReview && <div className="dw-conflicts"><span>{tr("chooseObservation")}</span>{editing.fields[name].history.map(item => <button type="button" key={item.id} onClick={() => field(name, item.value === null ? "" : String(item.value))}>{item.value ?? tr("unknown")} · {tr(item.source)} · {new Date(item.at).toLocaleDateString(locale)}</button>)}</div>}
          {editing.fields[name].history.length > 0 && <details className="dw-evidence"><summary>{tr("fieldHistory")}</summary><ul>{editing.fields[name].history.map(item => <li key={item.id}>{item.value ?? tr("unknown")} · {tr(item.source)} · {new Date(item.at).toLocaleString(locale)}{item.screenshot && <> · {item.screenshot.sourceId} [{item.screenshot.bbox.join(", ")}]</>}</li>)}</ul></details>}
        </div>)}
        <p className="dw-muted dw-small">{tr("skillIndependent")}</p><div className="dw-actions"><button className="dw-danger" disabled={busy || changed} onClick={() => void save(true)}>{tr("removeCard")}</button><button className="dw-primary" disabled={busy || changed} onClick={() => void save()}>{tr("save")}</button></div>
      </div></div>}
    </Modal>
    <Modal historyNavigation={false} isOpen={choosingIdentity && editing !== null} onClose={() => setChoosingIdentity(false)} title={tr("changeCard")} closeLabel={tr("close")} size="xl">
      {editing && <CardIdentitySelection key={editing.key} locale={locale} kind={editing.kind} catalog={catalog} value={editing.identity.value}
        disabledIds={box.cards.filter(card => card.key !== editing.key && card.kind === editing.kind).flatMap(card => card.identity.value ? [card.identity.value] : [])}
        onChange={value => {
          const observation = { id: crypto.randomUUID(), value, source: "manual" as const, at: Date.now() };
          setDraft(previous => previous?.scope === scope ? { ...previous, card: { ...previous.card, identity: answerField(previous.card.identity, observation) } } : previous);
          setChoosingIdentity(false);
        }} />}
    </Modal>
  </>;
}
export default function BoxManager({ locale, box, mode, busy, commit, members, snaps, playerCatalogue, onRecognize, onGuide, onStorage, onDelete, onImportSave, view, notice }: BoxManagerProps) {
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const collection = (key: string, values?: Record<string, string | number>) => tr(`collection.${key}`, values);
  const [tab, setTab] = useState<CardKind | "review" | "player">("member");
  const tabId = useId();
  const shown = view ?? box;
  // A linked save has no review queue.
  useEffect(() => { if (view && tab === "review") setTab("member"); }, [view, tab]);
  const tabs: readonly (CardKind | "review" | "player")[] = view ? ["member", "snap", "player"] : ["member", "snap", "review", "player"];
  const [query, setQuery] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [kind, setKind] = useState<CardKind>("member");
  const [invalid, setInvalid] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const catalog = { members, snaps };
  const review = (card: BoxCard) => card.identity.needsReview || card.identity.value === null || CARD_FIELDS.some(name => card.fields[name].needsReview);
  const visible = shown.cards.filter(card => (tab === "review" ? review(card) : card.kind === tab) && `${cardTitle(card, catalog)} ${cardSubtitle(card, catalog)} ${card.identity.value ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  function exportBox() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(box, null, 2)], { type: "application/json" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `moenotes-box-${box.server}.json`; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function importBox(input: File | undefined) {
    if (!input) return;
    setInvalid(false);
    try { if (input.size > 20_000_000) throw new Error("size"); setSaveError(!await commit(mergeBoxes(box, parseBox(await input.text())))); }
    catch { setInvalid(true); }
    if (file.current) file.current.value = "";
  }
  async function addCard(identity: string | null) {
    if (!identity || !(kind === "member" ? members : snaps).some(item => String(item.id) === identity)
      || box.cards.some(card => card.kind === kind && card.identity.value === identity)) { setInvalid(true); return; }
    const saved = await commit({ ...box, cards: [...box.cards, createCard(kind, crypto.randomUUID(), identity)] });
    setSaveError(!saved);
    if (saved) setAdding(false);
  }
  return <section className="dw-box-manager cb-manager">
    <div className="cb-collection-tools">
      <div className="cb-save-context"><span className={`cb-save-status ${mode === "temporary" ? "is-temporary" : ""}`} role="status" aria-live="polite"><CollectionIcon name={mode === "local" ? "check" : "storage"} />{collection(busy ? "saving" : mode === "local" ? "saved" : "temporary")}</span><span>{collection("updated", { date: new Date(box.updatedAt).toLocaleDateString(locale) })}</span></div>
      <div className="cb-collection-actions">
        {onImportSave && !view && <button type="button" className="dw-primary cb-import-action" disabled={busy} onClick={onImportSave}><CollectionIcon name="game" />{tr("gameSave.importAction")}</button>}
        {onRecognize && !view && <button type="button" className={onImportSave ? "cb-secondary-action" : "dw-primary cb-import-action"} disabled={busy} onClick={onRecognize}><CollectionIcon name="image" />{tr("screenshotImport")}</button>}
        {onGuide && !view && <button type="button" className="cb-secondary-action" onClick={onGuide}><CollectionIcon name="guide" />{collection("guide")}</button>}
        <CollectionActionMenu locale={locale} busy={busy} onAdd={view ? undefined : () => { setAdding(true); setInvalid(false); }} onExport={exportBox} onImport={view ? undefined : () => file.current?.click()} onStorage={onStorage} onDelete={onDelete} />
      </div>
    </div>
    {notice}
    <input className="dw-hidden" ref={file} type="file" accept="application/json,.json" aria-label={collection("import")} onChange={event => void importBox(event.target.files?.[0])} />
    <div className="cb-navigation-row"><div className="dw-tabs dw-box-tabs cb-tabs" role="tablist" aria-label={tr("boxTitle")}>
      {tabs.map(value => <button key={value} type="button" role="tab" id={`${tabId}-${value}`} data-box-tab={value} aria-controls={`${tabId}-panel`} aria-selected={tab === value} tabIndex={tab === value ? 0 : -1} onClick={() => setTab(value)} onKeyDown={event => {
        const index = tabs.indexOf(value);
        const next = event.key === "ArrowRight" ? (index + 1) % tabs.length : event.key === "ArrowLeft" ? (index + tabs.length - 1) % tabs.length : event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : null;
        if (next === null) return;
        event.preventDefault(); setTab(tabs[next]!);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=tab]")[next]?.focus();
      }}>{tr(value === "player" ? "playerTitle" : value)}{value !== "player" && <span>{shown.cards.filter(card => value === "review" ? review(card) : card.kind === value).length}</span>}</button>)}
    </div>{tab !== "player" && <input className="cb-card-search" type="search" name="card-search" autoComplete="off" aria-label={tr("searchCards")} placeholder={tr("searchCards")} value={query} onChange={event => setQuery(event.target.value)} />}</div>
    {invalid && <p role="alert" className="dw-alert">{tr("importError")}</p>}
    {saveError && <p role="alert" className="dw-alert">{tr("saveError")}</p>}
    <div className="cb-collection-content" role="tabpanel" id={`${tabId}-panel`} aria-labelledby={`${tabId}-${tab}`}>
    {tab === "player" ? <PlayerStateManager locale={locale} box={box} view={view} catalogue={playerCatalogue ?? null} busy={busy} commit={commit} /> : <>
    <div className="dw-card-grid">{visible.map(card => <button className="dw-box-card" key={card.key} disabled={busy} onClick={() => { setEditingKey(card.key); setSaveError(false); }}>
      <BoxArtwork card={card} catalog={catalog} locale={locale} /><strong>{cardTitle(card, catalog)}</strong><span className="dw-card-subtitle">{cardSubtitle(card, catalog)}</span>
      <span className="cb-card-rarity" aria-label={`${t(locale, "cards.rarity")} ${cardRarityLabel(card, catalog) ?? tr("review")}`}>{cardRarityLabel(card, catalog) ?? tr("review")}</span>
      <dl className="cb-card-facts">{(["level", "rank", ...(card.kind === "member" ? ["awake" as const] : [])] as const).map(name => <div key={name}><dt>{name === "level" ? tr("collection.cultivationLevel") : tr(name)}</dt><dd aria-label={card.fields[name].value === null ? tr("unknown") : undefined}>{card.fields[name].value ?? "—"}</dd></div>)}</dl>{review(card) && <span className="dw-tag dw-warning">{tr("review")}</span>}
    </button>)}</div>
    {!visible.length && <div className="dw-empty"><strong>{collection(query ? "noMatches" : tab === "review" ? "reviewComplete" : "emptyCards")}</strong><p>{query ? collection("searchHint") : view ? tr("gameSave.emptyCardsNote") : collection(tab === "review" ? "reviewCompleteNote" : "emptyCardsNote")}</p>{query && <button type="button" onClick={() => setQuery("")}>{collection("clearSearch")}</button>}</div>}
    {view ? <p className="cb-coverage cb-save-coverage"><CollectionIcon name="check" />{tr("gameSave.coverageNote")}</p> : <div className="dw-coverage cb-coverage">{(["member", "snap"] as const).map(value => <label key={value}><input type="checkbox" disabled={busy} checked={box.coverage[value].complete} onChange={event => void commit({ ...box, coverage: { ...box.coverage, [value]: { complete: event.target.checked, declaredAt: Date.now() } } })} />{tr(value === "member" ? "allMembers" : "allSnaps")}</label>)}<p>{tr("unknownPreserved")}</p></div>}
    </>}
    </div>
    <Modal historyNavigation={false} isOpen={adding} onClose={() => setAdding(false)} title={tr("addCard")} closeLabel={tr("close")} size="xl">
      <div className="dw-dialog"><p>{tr("manualSupplement")}</p><div className="dw-tabs" role="group" aria-label={tr("cardKind")}>{(["member", "snap"] as const).map(value => <button key={value} aria-pressed={kind === value} onClick={() => setKind(value)}>{tr(value)}</button>)}</div>
        <CardIdentitySelection key={kind} locale={locale} kind={kind} catalog={catalog} value={null} allowUnknown={false} confirmLabel={tr("addCard")}
          disabledIds={box.cards.filter(card => card.kind === kind).flatMap(card => card.identity.value ? [card.identity.value] : [])} onChange={value => !busy && void addCard(value)} />
        <p className="dw-muted">{tr("unknownPreserved")}</p></div>
    </Modal>
    <BoxCardEditor locale={locale} box={shown} cardKey={editingKey} busy={busy} commit={commit} onClose={() => setEditingKey(null)} readOnly={!!view} {...catalog} />
  </section>;
}

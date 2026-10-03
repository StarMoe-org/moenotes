import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath, normalizePathname } from "@/i18n/routing";
import { getRoutePathById } from "@/lib/route/registry";
import type { CardViewModel } from "@/lib/cards/data";
import type { SupportCardViewModel } from "@/lib/support-cards/data";
import type { MusicViewModel } from "@/lib/music/data";
import { listForServer, type ServerFaceted } from "@/lib/servers/facets";
import { ContentServerProvider, useContentServer } from "@/lib/servers/use-content-server";
import { mergeBoxes, parseBox, type BoxCard, type CardBox, type CardFieldName, type CardKind } from "@/lib/box/model";
import { answerDeckFields } from "@/lib/box/deck-answers";
import { createDeckPreview } from "@/lib/box/deck-preview";
import { useCardBox } from "@/components/box/use-card-box";
import BoxManager, { BoxArtwork, BoxCardEditor, cardTitle, cardSubtitle } from "@/components/box/BoxManager";
import PlayerStateManager from "@/components/box/PlayerStateManager";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import { type MusicDifficulty, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";
import DeckComposer from "./DeckComposer";
import NativeFormationGroup from "@/components/chart-data/NativeFormationGroup";
import Modal from "@/components/shared/Modal";
import type { PlayerFieldCatalogue } from "@/lib/box/player-catalog";
import { getCardBoxSession } from "@/lib/box/session";
import { mergeRecognizedBox, type RecognitionSourceStamp } from "@/lib/recognition/protocol";
import ScreenshotImport from "@/components/box/ScreenshotImport";
import { createRecognitionContext } from "@/lib/recognition/catalogue";
import CardIdentitySelection from "@/components/box/CardIdentitySelection";
import CardBoxGuide from "@/components/box/CardBoxGuide";
import CollectionIcon from "@/components/box/CollectionIcon";
import CollectionActionMenu from "@/components/box/CollectionActionMenu";
import { MemberSquareArtwork } from "@/components/shared/CardSquareArtwork";

export interface DeckWorkspaceProps {
  locale: AppLocale; page: "deck" | "box"; servers: GameServer[];
  members: ServerFaceted<CardViewModel>[]; snaps: ServerFaceted<SupportCardViewModel>[]; songs: ServerFaceted<MusicViewModel>[];
  playerCatalogues?: readonly PlayerFieldCatalogue[];
  recognitionSources?: readonly RecognitionSourceStamp[];
}
const goals = ["score", "gekisou", "stable", "skip", "power", "event"] as const;
type Goal = typeof goals[number];
export default function DeckWorkspace(props: DeckWorkspaceProps) {
  const { locale, servers } = props;
  const [page, setPage] = useState(props.page);
  const href = (id: string) => localizePath(getRoutePathById(id), locale);
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const [server, pickServer] = useContentServer(locale, servers);
  const storage = useCardBox(server);
  const { box, busy, mode } = storage;
  const members = useMemo(() => listForServer(props.members, server), [props.members, server]);
  const snaps = useMemo(() => listForServer(props.snaps, server), [props.snaps, server]);
  const songs = useMemo(() => listForServer(props.songs, server), [props.songs, server]);
  const catalog = useMemo(() => ({ members, snaps }), [members, snaps]);
  const playerCatalogue = props.playerCatalogues?.find(value => value.server === server) ?? null;
  const rawRecognitionSource = props.recognitionSources?.find(value => value.server === server);
  const recognition = useMemo(() => {
    if (!rawRecognitionSource) return { context: undefined, issue: "Master source stamp is unavailable" };
    try { return { context: createRecognitionContext(rawRecognitionSource, catalog), issue: "" }; }
    catch (error) { return { context: undefined, issue: error instanceof Error ? error.message : "Invalid card catalogue" }; }
  }, [rawRecognitionSource, catalog]);
  const [goal, setGoal] = useState<Goal>("score");
  const [song, setSong] = useState("");
  const [difficulty, setDifficulty] = useState<MusicDifficulty>("expert");
  const [scene, setScene] = useState("gekisou");
  const [rank, setRank] = useState("1");
  const [just, setJust] = useState(95);
  const [great, setGreat] = useState(3);
  const [threshold, setThreshold] = useState("1000000");
  const [duration, setDuration] = useState("10");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [required, setRequired] = useState<string[]>([]);
  const [step, setStep] = useState<"goal" | "need" | "result">("goal");
  const [setup, setSetup] = useState(false);
  const [management, setManagement] = useState(false);
  const [importing, setImporting] = useState(false);
  const [options, setOptions] = useState(false);
  const [optionsTab, setOptionsTab] = useState<"team" | "constraints">("team");
  const [constraintQuery, setConstraintQuery] = useState("");
  const [constraintFilter, setConstraintFilter] = useState<"all" | "required" | "excluded">("all");
  const [songPicker, setSongPicker] = useState(false);
  const [playerSettings, setPlayerSettings] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const [pendingScreenshots, setPendingScreenshots] = useState<readonly File[]>([]);
  const [draggingScreenshots, setDraggingScreenshots] = useState(false);
  const [backupError, setBackupError] = useState(false);
  const emptyBackup = useRef<HTMLInputElement>(null);
  const [editingCardKey, setEditingCardKey] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [choice, setChoice] = useState<"local" | "temporary">("local");
  const [resultSnapshot, setResultSnapshot] = useState("");
  const [resultBox, setResultBox] = useState<CardBox | null>(null);
  const [resultConstraints, setResultConstraints] = useState<{ excluded: string[]; required: string[] }>({ excluded: [], required: [] });
  const [questionKeys, setQuestionKeys] = useState<string[]>([]);
  const [sameSkill, setSameSkill] = useState<Record<string, boolean>>({});
  const [baselineMembers, setBaselineMembers] = useState<string[]>(Array(5).fill(""));
  const [baselineSnaps, setBaselineSnaps] = useState<(string | null)[]>(Array(5).fill(null));
  const [baselineSaved, setBaselineSaved] = useState(false);
  const [baselineScope, setBaselineScope] = useState<{ server: GameServer; boxId: string; revision: number } | null>(null);
  const [baselineSaveError, setBaselineSaveError] = useState(false);
  const baselineEditorEpoch = useRef(0);
  const [baselineTarget, setBaselineTarget] = useState<{ slot: number; kind: CardKind } | null>(null);
  const [copied, setCopied] = useState(false);
  const questionPanel = useRef<HTMLDivElement>(null);
  const teamPanel = useRef<HTMLDivElement>(null);
  const fingerprint = JSON.stringify([server, box?.id, box?.revision, mode, goal, song, difficulty, scene, rank, just, great, threshold, duration, excluded, required]);
  const stale = step === "result" && resultSnapshot !== fingerprint;
  const ownedMembers = box?.cards.filter(card => card.kind === "member") ?? [];
  const ownedSnaps = box?.cards.filter(card => card.kind === "snap") ?? [];
  const baselineCatalog = useMemo(() => {
    const ids = (kind: CardKind) => new Set(box?.cards.filter(card => card.kind === kind).flatMap(card => card.identity.value ? [card.identity.value] : []) ?? []);
    const heldMembers = ids("member"), heldSnaps = ids("snap");
    return { members: members.filter(card => heldMembers.has(String(card.id))), snaps: snaps.filter(card => heldSnaps.has(String(card.id))) };
  }, [box?.cards, members, snaps]);
  const baselineValid = baselineMembers.length === 5 && new Set(baselineMembers).size === 5
    && baselineMembers.every(id => baselineCatalog.members.some(card => String(card.id) === id))
    && new Set(baselineMembers.map(id => baselineCatalog.members.find(card => String(card.id) === id)?.characterId)).size === 5
    && baselineSnaps.length === 5 && baselineSnaps.every(id => id === null || baselineCatalog.snaps.some(card => String(card.id) === id))
    && new Set(baselineSnaps.filter(id => id !== null)).size === baselineSnaps.filter(id => id !== null).length;
  const baselineChanged = options && (baselineScope?.server !== server || baselineScope?.boxId !== box?.id || baselineScope?.revision !== box?.revision);
  // An owned team preview, never an evaluated or ranked recommendation.
  const sampleBox = step === "result" ? resultBox : box;
  const sampleExcluded = step === "result" ? resultConstraints.excluded : excluded;
  const sampleRequired = step === "result" ? resultConstraints.required : required;
  const preview = createDeckPreview(sampleBox, catalog, { excluded: sampleExcluded, required: sampleRequired });
  const sample = preview.members.filter((card): card is BoxCard => card !== null);
  const sampleSlots = Array.from({ length: 5 }, (_, index) => ({
    member: members.find(card => String(card.id) === preview.members[index]?.identity.value),
    support: snaps.find(card => String(card.id) === preview.snaps[index]?.identity.value),
    memberLevel: preview.members[index]?.fields.level.value ?? undefined, memberRank: preview.members[index]?.fields.rank.value ?? undefined,
    supportLevel: preview.snaps[index]?.fields.level.value ?? undefined, supportRank: preview.snaps[index]?.fields.rank.value ?? undefined,
  }));
  const askedFields: CardFieldName[] = ["level", "awake", "rank", ...(goal === "score" || goal === "stable" || goal === "gekisou" ? ["liveSkillLevel" as const] : []),
    ...(goal === "gekisou" || ((goal === "score" || goal === "stable") && scene === "gekisou") ? ["gekisouSkillLevel" as const] : [])];
  const currentTeam = createDeckPreview(box, catalog, { excluded, required });
  const missing = currentTeam.members.filter((card): card is BoxCard => card !== null)
    .filter(card => askedFields.some(name => card.fields[name].value === null || card.fields[name].needsReview || card.fields[name].status === "conflict"));
  const questions = step === "need" ? ownedMembers.filter(card => questionKeys.includes(card.key)) : missing;
  function showResult() { setResultSnapshot(fingerprint); setResultBox(box ? structuredClone(box) : null); setResultConstraints({ excluded: [...excluded], required: [...required] }); setStep("result"); setCopied(false);
    requestAnimationFrame(() => teamPanel.current?.closest<HTMLElement>(".dc-team")?.scrollIntoView({ block: "start" })); }
  async function answerSkills(keys: string[], name: CardFieldName, value: number | null) {
    if (!box) return;
    await storage.commit(answerDeckFields(box, keys, name, value, askedFields.includes("gekisouSkillLevel") ? sameSkill : {}));
  }
  function changePage(event: MouseEvent<HTMLAnchorElement>, next: "deck" | "box") {
    if (mode !== "temporary" || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); setPage(next); window.history.pushState(null, "", href(next === "box" ? "card-box" : "deck"));
  }
  function openOptions(tab: "team" | "constraints" = "team") {
    baselineEditorEpoch.current++;
    setBaselineMembers(box?.baseline ? [...box.baseline.members] : Array(5).fill(""));
    setBaselineSnaps(box?.baseline ? [...box.baseline.snaps] : Array(5).fill(null));
    setBaselineScope(box ? { server, boxId: box.id, revision: box.revision } : null);
    setBaselineSaveError(false); setBaselineSaved(false); setOptionsTab(tab); setOptions(true);
    setBaselineTarget(null);
  }
  function closeOptions() { baselineEditorEpoch.current++; setOptions(false); setBaselineTarget(null); }
  function moveBaseline(slot: number, direction: -1 | 1) {
    const next = slot + direction;
    setBaselineMembers(previous => previous.map((value, index) => index === slot ? previous[next]! : index === next ? previous[slot]! : value));
    setBaselineSnaps(previous => previous.map((value, index) => index === slot ? previous[next]! : index === next ? previous[slot]! : value));
    setBaselineSaved(false); setBaselineSaveError(false);
  }
  async function saveBaseline() {
    if (!box || !baselineScope || baselineChanged || !baselineValid) return;
    const epoch = baselineEditorEpoch.current;
    const saved = await storage.commit({ ...box, baseline: { members: baselineMembers, snaps: baselineSnaps } }, baselineScope.revision);
    if (epoch !== baselineEditorEpoch.current) return;
    setBaselineSaveError(!saved); setBaselineSaved(saved);
    if (saved) { setBaselineScope({ ...baselineScope, revision: baselineScope.revision + 1 }); setStep("goal"); }
  }
  useEffect(() => {
    const back = () => setPage(normalizePathname(window.location.pathname) === href("card-box") ? "box" : "deck");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [locale]);
  useEffect(() => { setStep("goal"); setExcluded([]); setRequired([]); setSong(""); setManagement(false); setSetup(false); setDeleting(false); setImporting(false);
    baselineEditorEpoch.current++; setOptions(false); setBaselineTarget(null); setBaselineScope(null); setEditingCardKey(null); setPlayerSettings(false); setGuideOpen(false); setBackupError(false); setSongPicker(false); setQuestionKeys([]); setSameSkill({}); setConstraintQuery(""); setConstraintFilter("all"); setPendingScreenshots([]); setDraggingScreenshots(false); }, [server]);
  function openScreenshotImport() { setManagement(false); setGuideOpen(false); setImporting(true); }
  function openGuide() { setManagement(false); setGuideOpen(true); }
  function openStorage() { setChoice(mode); setSetup(true); }
  function importImages(files: readonly File[]) {
    if (!files.length || busy) return;
    setPendingScreenshots(files); openScreenshotImport();
  }
  useEffect(() => {
    if (page !== "box" || importing) return;
    const paste = (event: ClipboardEvent) => {
      if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
      const target = event.target;
      if (target instanceof Element && target.closest('input,textarea,[contenteditable]:not([contenteditable="false"])')) return;
      const data = event.clipboardData;
      if (!data) return;
      const files = [...data.files].filter(file => file.type.startsWith("image/"));
      if (!files.length) for (const item of [...data.items]) {
        if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (!files.length) return;
      event.preventDefault(); importImages(files);
    };
    document.addEventListener("paste", paste);
    return () => document.removeEventListener("paste", paste);
  }, [page, importing, busy]);
  async function restoreBackup(input: File | undefined) {
    if (!input) return;
    setBackupError(false);
    try {
      if (input.size > 20_000_000) throw new Error("size");
      const incoming = parseBox(await input.text());
      if (incoming.server !== server) throw new Error("server");
      const session = getCardBoxSession(server);
      if (!session.getSnapshot().box && !await session.start(mode)) throw new Error("storage");
      if (!await session.commit(mergeBoxes(session.getSnapshot().box!, incoming))) throw new Error("save");
    } catch { setBackupError(true); }
    if (emptyBackup.current) emptyBackup.current.value = "";
  }
  async function saveScreenshot(observation: CardBox, destination: "local" | "temporary"): Promise<boolean> {
    const session = getCardBoxSession(server);
    if (!session.getSnapshot().box && !await session.start(destination)) return false;
    const latest = session.getSnapshot().box;
    if (!latest) return false;
    const saved = await session.commit(mergeRecognizedBox(latest, observation));
    return saved;
  }
  function reviewDetails() {
    setQuestionKeys(missing.map(card => card.key)); setStep("need");
    requestAnimationFrame(() => questionPanel.current?.closest<HTMLElement>(".dc-questions")?.scrollIntoView({ block: "start" }));
  }
  const selectedSong = songs.find(item => String(item.id) === song);
  const needsSong = goal === "score" || goal === "gekisou" || goal === "stable";
  const composer = (key: string, values?: Record<string, string | number>) => tr(`composer.${key}`, values);
  const collection = (key: string, values?: Record<string, string | number>) => tr(`collection.${key}`, values);
  function toggle(values: string[], key: string, update: (value: string[]) => void) { update(values.includes(key) ? values.filter(value => value !== key) : [...values, key]); }
  return <ContentServerProvider server={server} servers={servers}><div className={`dw-workspace ${page === "box" ? "dw-collection" : "dw-deck"}`} data-testid="deck-workspace">
    <header className="dw-header"><div><h1>{tr(page === "box" ? "boxTitle" : "title")}</h1><p>{page === "box" ? tr("boxDescription") : composer("workspaceNote")}</p></div><div className="dw-actions"><label className="dw-server">{tr("server")}<select aria-label={tr("server")} value={server} disabled={busy} onChange={event => pickServer(event.target.value as GameServer)}>{servers.map(value => <option key={value} value={value}>{t(locale, `gameServer.names.${value}`)}</option>)}</select></label><a className="dw-button" href={href(page === "box" ? "deck" : "card-box")} onClick={event => changePage(event, page === "box" ? "deck" : "box")}>{tr(page === "box" ? "goDeck" : "boxTitle")}</a></div></header>
    {storage.error && <p role="alert" className="dw-alert">{tr(`storageErrors.${storage.error}`)} <button disabled={busy || mode === "temporary"} onClick={() => void storage.reload()}>{tr("retry")}</button></p>}
    {page === "box" ? <section className={`cb-workspace dw-box-main${draggingScreenshots ? " is-dragging-screenshots" : ""}`} onDragOver={event => {
      if (busy || ![...event.dataTransfer.types].includes("Files")) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDraggingScreenshots(true);
    }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingScreenshots(false); }} onDrop={event => {
      const files = [...event.dataTransfer.files].filter(file => file.type.startsWith("image/"));
      setDraggingScreenshots(false); if (!files.length) return;
      event.preventDefault(); importImages(files);
    }}>
      {box ? <BoxManager key={`${server}:${box.id}`} locale={locale} box={box} mode={mode} busy={busy} commit={storage.commit} playerCatalogue={playerCatalogue} onRecognize={openScreenshotImport} onGuide={openGuide} onStorage={openStorage} onDelete={() => setDeleting(true)} {...catalog} /> : <>
        <div className="cb-collection-tools"><span className="cb-save-status" role="status">{collection(busy ? "loading" : "noBox")}</span><div className="cb-collection-actions"><button type="button" className="dw-primary cb-import-action" disabled={busy} onClick={openScreenshotImport}><CollectionIcon name="image" />{tr("screenshotImport")}</button><button type="button" className="cb-secondary-action" onClick={openGuide}><CollectionIcon name="guide" />{collection("guide")}</button><CollectionActionMenu locale={locale} busy={busy} onAdd={openStorage} onImport={() => emptyBackup.current?.click()} onStorage={openStorage} /></div></div>
        <input className="dw-hidden" ref={emptyBackup} type="file" accept="application/json,.json" aria-label={collection("import")} onChange={event => void restoreBackup(event.target.files?.[0])} />
        <div className="cb-empty-collection"><div className="cb-empty-copy"><h2>{collection("emptyTitle")}</h2><p>{collection("emptyDescription")}</p></div><div className="cb-empty-art" aria-hidden="true">{members.filter(card => card.rarity === 4).slice(0, 3).map(card => <div key={card.id}><MemberSquareArtwork card={card} locale={locale} /></div>)}</div></div>
      </>}
      {backupError && <p className="dw-alert" role="alert">{tr("importError")}</p>}
      <p className="cb-input-note">{collection("pasteDropHint")}<span>{collection("manualGrowth")}</span></p>
    </section> : <>
      <DeckComposer
        labels={{ goal: composer("goalTitle"), conditions: composer("conditionsTitle"), collection: composer("collectionTitle"),
          team: composer("teamTitle"), cards: composer("cardsTitle"), questions: composer("questionsTitle") }}
        goals={goals.map((value, index) => ({ id: value, title: tr(`goals.${value}`), description: tr(`goalNotes.${value}`), disabled: value === "event",
          icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={["M4 19 19 4M9 4h10v10", "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z", "M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z", "m8 4 12 8-12 8V4Z", "m12 3 9 9-9 9-9-9 9-9Z", "M4 6h16M4 12h16M4 18h16"][index]} /></svg> }))}
        selectedGoal={goal} onGoalChange={value => { setGoal(value as Goal); setStep("goal"); }}
        collection={<div className="dc-collection-summary">
          <div className="dc-collection-stats"><span><strong>{ownedMembers.length}</strong> {tr("member")}</span><span><strong>{ownedSnaps.length}</strong> {tr("snap")}</span>
            {box && <button type="button" className="dc-storage-label" onClick={openStorage}>{tr(mode)}</button>}</div>
          <div className="dc-collection-actions"><button type="button" disabled={busy} onClick={openScreenshotImport}>{tr("screenshotImport")}</button>
            {box && <button type="button" disabled={busy} onClick={() => setManagement(true)}>{tr("manage")}</button>}</div>
        </div>}
        conditions={<>
          {needsSong ? <>
            <button type="button" className="dc-song-button" onClick={() => setSongPicker(true)} aria-haspopup="dialog">
              {selectedSong ? <img className="dc-song-cover" src={selectedSong.jacketUrl} alt="" /> : <svg className="dc-song-cover" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 23V9l15-3v14M12 9l15-3M12 23c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Zm15-3c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Z" /></svg>}
              <span className="dc-song-summary"><small>{tr("song")}</small><strong>{selectedSong?.title ?? composer("emptySong")}</strong></span>
            </button>
            <div className="dc-field-pair"><label>{tr("difficulty")}<select aria-label={tr("difficulty")} value={difficulty} onChange={event => setDifficulty(event.target.value as MusicDifficulty)}>
              {MUSIC_DIFFICULTIES.filter(value => !selectedSong || selectedSong.difficulties.some(entry => entry.difficulty === value)).map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
              <label>{tr("scene")}<select aria-label={tr("scene")} value={goal === "gekisou" ? "gekisou" : scene} disabled={goal === "gekisou"} onChange={event => setScene(event.target.value)}><option value="free">{tr("free")}</option><option value="gekisou">{tr("gekisou")}</option></select></label></div>
            {(scene === "gekisou" || goal === "gekisou") && <label>{tr("rankAssumption")}<select aria-label={tr("rankAssumption")} value={rank} onChange={event => setRank(event.target.value)}>{["1", "2", "3"].map(value => <option key={value} value={value}>{tr("rankN", { n: value })}</option>)}</select></label>}
            {goal === "stable" && <label>{tr("threshold")}<input aria-label={tr("threshold")} type="number" min={1} value={threshold} onChange={event => setThreshold(event.target.value)} /></label>}
            <details className="dc-play-style"><summary>{composer("advanced")}</summary><label>{tr("justRate", { n: just })}<input aria-label={tr("justRate", { n: just })} type="range" min={0} max={100 - great} value={just} onChange={event => setJust(Number(event.target.value))} /></label>
              <label>{tr("greatRate", { n: great })}<input aria-label={tr("greatRate", { n: great })} type="range" min={0} max={100 - just} value={great} onChange={event => setGreat(Number(event.target.value))} /></label></details>
          </> : <p className="dw-muted">{composer("noSongNeeded")}</p>}
          <div className="dc-condition-actions"><button type="button" disabled={!box || busy} onClick={() => openOptions("constraints")}>{composer("searchConstraints")}{required.length + excluded.length > 0 && <span> · {required.length + excluded.length}</span>}</button>
            <button type="button" disabled={!box || busy} onClick={() => setPlayerSettings(true)}>{composer("playerBonuses")}</button></div>
        </>}
        team={<div ref={teamPanel} className="dc-team-body">
          {sample.length > 0 ? <>
            <p className="dc-team-caption" data-team-source={preview.source}>{composer(preview.source === "baseline" ? "currentTeam" : "fromCollection")}</p>
            <div className="dc-stage"><NativeFormationGroup locale={locale} slots={sampleSlots} label={composer("teamTitle")} /></div>
            <div className="dc-slot-labels">{preview.members.map((card, index) => <div key={index} title={card ? cardTitle(card, catalog) : tr("emptySlot")}>
              <span className={index === 2 ? "dc-leader" : ""}>{index === 2 ? composer("leaderShort") : index + 1}</span>
              <strong>{card ? cardTitle(card, catalog) : tr("emptySlot")}</strong></div>)}</div>
            {sample.length < 5 && <p className="dc-team-caption">{composer("partialTeam")}</p>}
          </> : <div className="dc-empty-team"><div className="dc-empty-slots" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={index === 2 ? "is-leader" : ""}>+</span>)}</div>
            <h3>{composer("emptyTitle")}</h3><p>{composer("emptyDescription")}</p></div>}
          {stale && <div className="dc-stale" role="status"><strong>{tr("staleTitle")}</strong><button type="button" onClick={showResult}>{composer("refreshPreview")}</button></div>}
        </div>}
        teamActions={box && <button type="button" disabled={busy || !ownedMembers.length} onClick={() => openOptions("team")}>{composer("editTeam")}</button>}
        notice={sample.length > 0 && <p className="dc-engine-note">{composer("engineNote")}</p>}
        primaryAction={<div className="dc-main-actions">
          <button type="button" className="dc-primary" disabled={busy} onClick={() => {
            if (!ownedMembers.length) { openScreenshotImport(); return; }
            if (missing.length && step !== "need" && step !== "result") reviewDetails(); else showResult();
          }}>{!ownedMembers.length ? tr("screenshotImport") : step === "need" ? composer("skipDetails") : step === "result" ? composer("refreshPreview") : missing.length ? composer("reviewDetails", { count: missing.length }) : composer("previewTeam")}</button>
          {step === "result" && missing.length > 0 && <button type="button" onClick={reviewDetails}>{composer("reviewDetails", { count: missing.length })}</button>}
          {step === "result" && <button type="button" disabled={stale} onClick={async () => {
            try { await navigator.clipboard.writeText([composer("engineNote"), ...sampleSlots.map((slot, index) => `${index + 1}: ${slot.member?.characterName ?? "—"} / ${slot.support?.name ?? "—"}`)].join("\n")); setCopied(true); } catch { setCopied(false); }
          }}>{tr(copied ? "copied" : "copyLayout")}</button>}
          {!ownedMembers.length && <button type="button" className="dc-manual-start" onClick={() => box ? setManagement(true) : setSetup(true)}>{composer("manualShort")}</button>}
        </div>}
        questions={step === "need" && <div ref={questionPanel} className="dc-question-list">
          <p className="dc-question-intro">{tr("unknownPreserved")}</p>
          {askedFields.includes("liveSkillLevel") && <div className="dc-bulk-skills"><strong>{tr("liveSkillLevel")}</strong><div>{([1, 5, null] as const).map(value => <button type="button" key={value ?? "clear"} disabled={busy} onClick={() => void answerSkills(questionKeys, "liveSkillLevel", value)}>{tr(value === null ? "clear" : value === 1 ? "allLv1" : "allLv5")}</button>)}</div></div>}
          {questions.map(card => <article className="dc-question-card" key={card.key} data-card-key={card.key}>
            <div className="dc-question-header"><BoxArtwork card={card} catalog={catalog} locale={locale} /><div><strong>{cardTitle(card, catalog)}</strong><small>{cardSubtitle(card, catalog)}</small></div>
              <button type="button" disabled={busy} aria-label={composer("editThisCard", { name: cardTitle(card, catalog) })} onClick={() => setEditingCardKey(card.key)}>{tr("edit")}</button></div>
            <dl className="dc-question-facts">{askedFields.filter(name => name !== "liveSkillLevel" && name !== "gekisouSkillLevel").map(name => <div key={name}><dt>{tr(name)}</dt><dd>{card.fields[name].value ?? composer("unfilled")}</dd></div>)}</dl>
            {askedFields.includes("gekisouSkillLevel") && <label className="dc-same-skill"><input type="checkbox" checked={sameSkill[card.key] ?? false} disabled={busy} onChange={event => setSameSkill(previous => ({ ...previous, [card.key]: event.target.checked }))} />{tr("sameSkill")}</label>}
            <div className="dc-question-skills">{(["liveSkillLevel", "gekisouSkillLevel"] as const).filter(name => askedFields.includes(name)).map(name => <div key={name} className="dc-skill-field"><strong>{tr(name)}</strong><div className="dc-skill-levels" role="group" aria-label={tr(name)}>
              {[1, 2, 3, 4, 5].map(value => <button type="button" key={value} disabled={busy} aria-pressed={card.fields[name].value === value} onClick={() => void answerSkills([card.key], name, value)}>{value}</button>)}<button type="button" disabled={busy} aria-pressed={card.fields[name].value === null} onClick={() => void answerSkills([card.key], name, null)}>{tr("clear")}</button>
            </div></div>)}</div>
          </article>)}
          <div className="dc-question-actions"><button type="button" className="dc-details-finish" disabled={busy} onClick={showResult}>{composer("previewTeam")}</button></div>
        </div>}
        cards={box && ownedMembers.length + ownedSnaps.length > 0 && <>
          <div className="dc-mini-cards">{[...ownedMembers.slice(0, 5), ...ownedSnaps.slice(0, 3)].map(card => <button type="button" className="dc-mini-card" key={card.key} disabled={busy} aria-label={composer("editThisCard", { name: cardTitle(card, catalog) })} onClick={() => setEditingCardKey(card.key)}>
            <BoxArtwork card={card} catalog={catalog} locale={locale} /><span>{cardTitle(card, catalog)}</span></button>)}</div>
          <button type="button" className="dc-view-all" onClick={() => setManagement(true)}>{composer("moreCards", { count: box.cards.length })}</button>
        </>}
      />
    </>}
    <Modal historyNavigation={false} isOpen={setup} onClose={() => setSetup(false)} title={tr(box ? "storageChoice" : "createBox")} closeLabel={tr("close")}><div className="dw-dialog"><p>{tr("storagePrompt")}</p><div className="dw-storage-options">{(["local", "temporary"] as const).map(value => <button className={choice === value ? "is-selected" : ""} aria-pressed={choice === value} key={value} onClick={() => setChoice(value)}><strong>{tr(value)}</strong><span>{tr(value === "local" ? "localNote" : "temporaryNote")}</span></button>)}</div><p className="dw-muted">{tr("accountStorageUnavailable")}</p>{storage.error && <p className="dw-alert" role="alert">{tr(`storageErrors.${storage.error}`)}</p>}<button disabled={busy} className="dw-primary" onClick={async () => { if (await storage.start(choice)) { setSetup(false); if (page === "deck") setManagement(true); } }}>{tr(box ? "save" : "continue")}</button></div></Modal>
    <Modal historyNavigation={false} isOpen={management && box !== null} onClose={() => setManagement(false)} title={tr("boxTitle")} closeLabel={tr("close")} size="xl">{box && <BoxManager key={`${server}:${box.id}`} locale={locale} box={box} mode={mode} busy={busy} commit={storage.commit} playerCatalogue={playerCatalogue} onRecognize={openScreenshotImport} onGuide={openGuide} onStorage={() => { setManagement(false); openStorage(); }} onDelete={() => { setManagement(false); setDeleting(true); }} {...catalog} />}</Modal>
    {box && <BoxCardEditor locale={locale} box={box} cardKey={editingCardKey} busy={busy} commit={storage.commit} onClose={() => setEditingCardKey(null)} {...catalog} />}
    <MusicSelectDialog key={server} locale={locale} songs={songs} open={songPicker} onClose={() => setSongPicker(false)}
      current={selectedSong ? { musicId: selectedSong.id, difficulty } : null} sortPage="deck-song"
      onSelect={selection => { setSong(String(selection.song.id)); setDifficulty(selection.difficulty); }} />
    <Modal historyNavigation={false} isOpen={playerSettings && box !== null} onClose={() => setPlayerSettings(false)} title={tr("playerTitle")} closeLabel={tr("close")} size="lg">
      {box && <PlayerStateManager key={`${server}:${box.id}`} locale={locale} box={box} catalogue={playerCatalogue} busy={busy} commit={storage.commit} embedded />}
    </Modal>
    <ScreenshotImport locale={locale} server={server} source={recognition.context?.source} sourceIssue={recognition.issue} box={box} mode={mode} catalog={catalog} isOpen={importing} onClose={() => { setImporting(false); setPendingScreenshots([]); }} onSave={saveScreenshot} pendingFiles={pendingScreenshots} onPendingFilesConsumed={() => setPendingScreenshots([])} />
    <CardBoxGuide key={server} locale={locale} members={members} snaps={snaps} isOpen={guideOpen} onClose={() => setGuideOpen(false)} onStartImport={openScreenshotImport} />
    <Modal historyNavigation={false} isOpen={options} onClose={closeOptions} title={composer(optionsTab === "team" ? "teamEditorTitle" : "constraintsTitle")} closeLabel={tr("close")} size="lg"><div className="dw-dialog dc-options">
      <div className="dc-option-tabs" role="group" aria-label={composer("searchConstraints")}><button type="button" aria-pressed={optionsTab === "team"} onClick={() => setOptionsTab("team")}>{composer("editTeam")}</button><button type="button" aria-pressed={optionsTab === "constraints"} onClick={() => setOptionsTab("constraints")}>{composer("searchConstraints")}</button></div>
      {optionsTab === "constraints" ? <>
        <p className="dw-muted">{composer("constraintDescription")}</p>
        <input className="dc-option-search" aria-label={tr("searchCards")} placeholder={tr("searchCards")} value={constraintQuery} onChange={event => setConstraintQuery(event.target.value)} />
        <div className="dc-option-tabs" role="group" aria-label={composer("constraintsTitle")}>{(["all", "required", "excluded"] as const).map(value => <button type="button" key={value} aria-pressed={constraintFilter === value} onClick={() => setConstraintFilter(value)}>{composer(value === "all" ? "constraintAll" : value === "required" ? "constraintRequired" : "constraintExcluded")}</button>)}</div>
        {(box?.cards ?? []).filter(card => (constraintFilter === "all" || (constraintFilter === "required" ? required : excluded).includes(card.key))
          && `${cardTitle(card, catalog)} ${cardSubtitle(card, catalog)} ${card.identity.value ?? ""}`.toLowerCase().includes(constraintQuery.toLowerCase())).map(card => <div key={card.key} className="dc-constraint-card"><BoxArtwork card={card} catalog={catalog} locale={locale} /><div><strong>{cardTitle(card, catalog)}</strong><small>{cardSubtitle(card, catalog)}</small></div>
            <label><input type="checkbox" checked={required.includes(card.key)} disabled={excluded.includes(card.key) || required.filter(key => box?.cards.find(other => other.key === key)?.kind === card.kind).length >= 5 && !required.includes(card.key)} onChange={() => toggle(required, card.key, setRequired)} />{tr("required")}</label><label><input type="checkbox" checked={excluded.includes(card.key)} disabled={required.includes(card.key)} onChange={() => toggle(excluded, card.key, setExcluded)} />{tr("excluded")}</label></div>)}
        <label>{tr("searchTime")}<select value={duration} onChange={event => setDuration(event.target.value)}>{["3", "10", "30"].map(value => <option key={value} value={value}>{tr("seconds", { n: value })}</option>)}</select></label>
      </> : box && <><p className="dw-muted">{composer("savedTeamDescription")}</p>
        {baselineChanged && <p role="alert" className="dw-alert">{composer("teamChanged")} <button type="button" onClick={() => openOptions("team")}>{composer("reloadTeam")}</button></p>}
        {baselineSaveError && <p role="alert" className="dw-alert">{composer("teamSaveFailed")}</p>}
        {Array.from({ length: 5 }, (_, slot) => <div className="dw-baseline-row" key={slot} data-baseline-slot={slot}>
        <div className="dc-slot-control"><span className={slot === 2 ? "dw-tag dw-leader" : ""}>{tr(slot === 2 ? "leader" : "slot", { n: slot + 1 })}</span>
          <div><button type="button" disabled={busy || baselineChanged || slot === 0} aria-label={composer("moveSlotUp", { n: slot + 1 })} onClick={() => moveBaseline(slot, -1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 14 6-6 6 6" /></svg></button>
            <button type="button" disabled={busy || baselineChanged || slot === 4} aria-label={composer("moveSlotDown", { n: slot + 1 })} onClick={() => moveBaseline(slot, 1)}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m6 10 6 6 6-6" /></svg></button></div></div>
        {(["member", "snap"] as const).map(kind => {
          const id = kind === "member" ? baselineMembers[slot] : baselineSnaps[slot];
          const currentCard = (kind === "member" ? ownedMembers : ownedSnaps).find(card => card.identity.value === id);
          return <button type="button" className="dw-baseline-card" data-kind={kind} key={kind} disabled={busy} aria-haspopup="dialog"
            aria-label={`${tr("baseline")} · ${tr(kind)} ${slot + 1}`} onClick={() => setBaselineTarget({ slot, kind })}>
            {currentCard ? <BoxArtwork card={currentCard} catalog={catalog} locale={locale} /> : <span className="dw-baseline-empty" aria-hidden="true">+</span>}
            <span><small>{tr(kind)}</small><strong>{currentCard ? cardTitle(currentCard, catalog) : tr(kind === "member" ? "chooseCard" : "emptySlot")}</strong></span>
          </button>;
        })}
      </div>)}<button type="button" className="dw-primary" disabled={busy || baselineChanged || !baselineValid} onClick={() => void saveBaseline()}>{tr(baselineSaved ? "baselineSaved" : "saveBaseline")}</button></>}
      <button type="button" onClick={closeOptions}>{tr("done")}</button></div></Modal>
    <Modal historyNavigation={false} isOpen={options && baselineTarget !== null} onClose={() => setBaselineTarget(null)}
      title={`${tr("baseline")} · ${tr(baselineTarget?.kind ?? "member")} · ${tr(baselineTarget?.slot === 2 ? "leader" : "slot", { n: (baselineTarget?.slot ?? 0) + 1 })}`} closeLabel={tr("close")} size="xl">
      {baselineTarget && <CardIdentitySelection key={`${baselineTarget.kind}:${baselineTarget.slot}`} locale={locale} kind={baselineTarget.kind} catalog={baselineCatalog}
        value={baselineTarget.kind === "member" ? baselineMembers[baselineTarget.slot] || null : baselineSnaps[baselineTarget.slot] ?? null}
        allowUnknown={baselineTarget.kind === "snap"} clearLabel={tr("emptySlot")} disabledLabel={tr("alreadyInTeam")}
        disabledIds={baselineTarget.kind === "member"
          ? baselineCatalog.members.filter(card => baselineMembers.some((id, slot) => slot !== baselineTarget.slot
            && baselineCatalog.members.find(member => String(member.id) === id)?.characterId === card.characterId)).map(card => String(card.id))
          : baselineSnaps.flatMap((id, slot) => slot !== baselineTarget.slot && id ? [id] : [])}
        onChange={id => {
          if (baselineTarget.kind === "member") setBaselineMembers(previous => previous.map((value, slot) => slot === baselineTarget.slot ? id ?? "" : value));
          else setBaselineSnaps(previous => previous.map((value, slot) => slot === baselineTarget.slot ? id : value));
          setBaselineSaved(false); setBaselineTarget(null);
        }} />}
    </Modal>
    <Modal historyNavigation={false} isOpen={deleting} onClose={() => setDeleting(false)} title={tr("deleteBox")} closeLabel={tr("close")}><div className="dw-dialog"><p>{tr("deleteNote")}</p><button className="dw-danger" disabled={busy} onClick={async () => { if (await storage.remove()) setDeleting(false); }}>{tr("confirmDelete")}</button></div></Modal>
  </div></ContentServerProvider>;
}

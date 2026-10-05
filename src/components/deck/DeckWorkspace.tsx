import { Fragment, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
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
import { boxAccountJson, gameSaveAccountJson } from "@/lib/deck/account-envelope";
import { CHALLENGE_POINT_COSTS, DEFAULT_DECK_GOAL, EVENT_GOALS, EVERYDAY_GOALS, MAX_BOOST, computes, computesGoal, defaultDeckGoalInput, goalGap, heldEvent,
  playsGekisou, readsAccuracy, isChallengeInput, isNetworkInput, recommendationRequest, solverGoalKind, goalVenues, isEventPayoffGoal, type ChallengePointCost, type DeckEvent, type DeckGoal, type DeckGoalInput, type DeckVenue, type DeckArenaMusic } from "@/lib/deck/goals";
import { parseMasterDate } from "@/lib/schedule";
import { safeGetLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { useDeckSolver } from "./use-deck-solver";
import DeckResult from "./DeckResult";
import { useCardBox } from "@/components/box/use-card-box";
import BoxManager, { BoxArtwork, BoxCardEditor, cardTitle, cardSubtitle } from "@/components/box/BoxManager";
import PlayerStateManager from "@/components/box/PlayerStateManager";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import { type MusicDifficulty, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";
import DeckComposer from "./DeckComposer";
import DeckGoalConditions from "./DeckGoalConditions";
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
import { gameSaveServer } from "@/config/account";
import { GAME_SERVERS } from "@/config/servers";
import type { GameSaveMeta } from "@/lib/account/game-saves";
import { deriveGameSaveBox, unavailableGameSaveBox, type GameSaveTables } from "@/lib/box/game-save";
import { fetchGameSave, forgetLoadedGameSave, keepGameSave, type LoadedGameSave } from "@/lib/box/game-save-source";
import { deleteCachedGameSave } from "@/lib/box/save-cache";
import { readLocalBox } from "@/lib/box/store";
import { GameSaveBanner, GameSaveHint, GameSavePicker } from "@/components/box/GameSave";
import { useGameSaveList, useLinkedGameSave } from "@/components/box/use-game-save";
import CloudBoxPanel from "@/components/box/CloudBoxPanel";

export interface DeckWorkspaceProps {
  locale: AppLocale; page: "deck" | "box"; servers: GameServer[];
  members: ServerFaceted<CardViewModel>[]; snaps: ServerFaceted<SupportCardViewModel>[]; songs: ServerFaceted<MusicViewModel>[];
  playerCatalogues?: readonly PlayerFieldCatalogue[];
  recognitionSources?: readonly RecognitionSourceStamp[];
  /** Per server, the Master subset a linked game save is read with. */
  saveTables?: readonly GameSaveTables[];
  /** Per server, the events that offer event goals. */
  deckEvents?: readonly { server: GameServer; events: readonly DeckEvent[] }[];
  deckArenas?: readonly { server: GameServer; songs: readonly DeckArenaMusic[] }[];
}
const GOAL_STORAGE_KEY = "moenotes.deck.goal";
/** Public sources of the deck engine: the scoring model and the search over teams. */
const DECK_SOURCES = [
  { key: "model", url: "https://github.com/empty-sekai/ournotes-deck/tree/main/crates/ournotes-sim" },
  { key: "search", url: "https://github.com/empty-sekai/ournotes-deck/tree/main/crates/ournotes-search" },
] as const;
const GOAL_ICONS: Readonly<Record<DeckGoal, string>> = {
  challenge: "M5 21V4m0 0h11l-2 4 2 4H5", challengePoints: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-3-5h6", eventPoints: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z", eventItems: "M4 8h16v12H4zM2 4h20v4H2zM12 4v16",
  mission: "M4 4h16v16H4zM8 12l3 3 5-6", arena: "M4 20V8l8-5 8 5v12M8 20v-8h8v8", skip: "m4 4 12 8-12 8V4Zm16 0v16", challengeSkip: "m4 4 12 8-12 8V4Zm16 0v16",
  battle: "M4 19 19 4M9 4h10v10", free: "m8 4 12 8-12 8V4Z", power: "m12 3 9 9-9 9-9-9 9-9Z",
};
function readStoredGoal(): DeckGoal {
  const value = safeGetLocalStorage(GOAL_STORAGE_KEY);
  return value && ([...EVENT_GOALS, ...EVERYDAY_GOALS] as string[]).includes(value) ? value as DeckGoal : DEFAULT_DECK_GOAL;
}
export default function DeckWorkspace(props: DeckWorkspaceProps) {
  const { locale, servers } = props;
  const [page, setPage] = useState(props.page);
  const href = (id: string) => localizePath(getRoutePathById(id), locale);
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const [server, pickServer] = useContentServer(locale, servers);
  const storage = useCardBox(server);
  const { busy, mode } = storage;
  /** The stored Box: every write starts from it. */
  const stored = storage.box;
  const members = useMemo(() => listForServer(props.members, server), [props.members, server]);
  const snaps = useMemo(() => listForServer(props.snaps, server), [props.snaps, server]);
  const songs = useMemo(() => listForServer(props.songs, server), [props.songs, server]);
  const catalog = useMemo(() => ({ members, snaps }), [members, snaps]);
  const playerCatalogue = props.playerCatalogues?.find(value => value.server === server) ?? null;
  const saveTables = props.saveTables?.find(value => value.server === server) ?? null;
  const saveList = useGameSaveList(server);
  const linkedSave = useLinkedGameSave(stored?.save ?? null);
  const linked = !!stored?.save;
  const derivation = useMemo(() => stored?.save && linkedSave.state.status === "ready"
    ? deriveGameSaveBox(stored, stored.save, linkedSave.state.save.player, saveTables, playerCatalogue) : null, [stored, linkedSave.state, saveTables, playerCatalogue]);
  /** What the page shows: the stored Box, or while a save is linked, the Box the save describes. */
  const box = useMemo(() => !stored?.save ? stored : derivation?.box ?? unavailableGameSaveBox(stored), [stored, derivation]);
  const [savePicker, setSavePicker] = useState(false);
  const rawRecognitionSource = props.recognitionSources?.find(value => value.server === server);
  const recognition = useMemo(() => {
    if (!rawRecognitionSource) return { context: undefined, issue: "Master source stamp is unavailable" };
    try { return { context: createRecognitionContext(rawRecognitionSource, catalog), issue: "" }; }
    catch (error) { return { context: undefined, issue: error instanceof Error ? error.message : "Invalid card catalogue" }; }
  }, [rawRecognitionSource, catalog]);
  const [goalInput, setGoalInput] = useState<DeckGoalInput>(() => defaultDeckGoalInput());
  const updateGoal = (patch: Partial<DeckGoalInput>) => setGoalInput(previous => ({ ...previous,
    ...(patch.venue !== undefined || patch.goal !== undefined ? { rewardContextConfirmed: false, selectedRewards: [] } : {}), ...patch }));
  useEffect(() => { updateGoal({ goal: readStoredGoal() }); }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const event = useMemo(() => heldEvent(props.deckEvents?.find(value => value.server === server)?.events ?? [], now, parseMasterDate), [props.deckEvents, server, now]);
  useEffect(() => { updateGoal({ selectedRewards: [], rewardContextConfirmed: false, localEventPoints: null, localChallengePoints: null }); }, [event?.id]);
  const solver = useDeckSolver(server, page === "deck");
  const capabilities = solver.engine.status === "ready" ? solver.engine.capabilities : null;
  const [excluded, setExcluded] = useState<string[]>([]);
  const [required, setRequired] = useState<string[]>([]);
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
  const [baselineMembers, setBaselineMembers] = useState<string[]>(Array(5).fill(""));
  const [baselineSnaps, setBaselineSnaps] = useState<(string | null)[]>(Array(5).fill(null));
  const [baselineSaved, setBaselineSaved] = useState(false);
  const [baselineScope, setBaselineScope] = useState<{ server: GameServer; boxId: string; revision: number } | null>(null);
  const [baselineSaveError, setBaselineSaveError] = useState(false);
  const baselineEditorEpoch = useRef(0);
  const [baselineTarget, setBaselineTarget] = useState<{ slot: number; kind: CardKind } | null>(null);
  const [runError, setRunError] = useState("");
  const teamPanel = useRef<HTMLDivElement>(null);
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
  // The owned team shown before a run: the saved formation, or the first eligible cards; never a ranked recommendation.
  const preview = createDeckPreview(box, catalog, { excluded, required });
  const sample = preview.members.filter((card): card is BoxCard => card !== null);
  const sampleSlots = Array.from({ length: 5 }, (_, index) => ({
    member: members.find(card => String(card.id) === preview.members[index]?.identity.value),
    support: snaps.find(card => String(card.id) === preview.snaps[index]?.identity.value),
    memberLevel: preview.members[index]?.fields.level.value ?? undefined, memberRank: preview.members[index]?.fields.rank.value ?? undefined,
    supportLevel: preview.snaps[index]?.fields.level.value ?? undefined, supportRank: preview.snaps[index]?.fields.rank.value ?? undefined,
  }));
  // Preserve the player's requested goal and play. Unsupported conditions block the run rather than changing it.
  const goal = goalInput.goal;
  const effectiveInput: DeckGoalInput = { ...goalInput };
  const gap = goalGap(effectiveInput, event);
  const supported = !capabilities || computes(capabilities, effectiveInput);
  const idsOf = (keys: readonly string[], kind: CardKind) => keys.flatMap(key => {
    const card = box?.cards.find(item => item.key === key && item.kind === kind);
    return card?.identity.value ? [card.identity.value] : [];
  });
  const constraints = { includeMembers: idsOf(required, "member"), excludeMembers: idsOf(excluded, "member"), excludeSnaps: idsOf(excluded, "snap") };
  const runKey = JSON.stringify([server, box?.id, box?.revision, stored?.save?.sha256 ?? null, solver.engine.status === "ready" ? solver.engine.datasetId : null, effectiveInput, constraints, event?.id ?? null]);
  const job = solver.job;
  const stale = job.status !== "idle" && job.status !== "running" && job.key !== runKey;
  function runSolver() {
    setRunError("");
    if (solver.engine.status !== "ready" || !box || gap || !supported) return;
    try {
      const target = { datasetId: solver.engine.datasetId, server: gameSaveServer(server) };
      let accountJson: string;
      if (stored?.save) {
        if (linkedSave.state.status !== "ready") throw new Error(tr("solver.saveNotReady"));
        accountJson = gameSaveAccountJson(target, stored, linkedSave.state.save);
      } else {
        if (!saveTables) throw new Error(tr("solver.tablesUnavailable"));
        accountJson = boxAccountJson(target, box, saveTables);
      }
      solver.run(runKey, accountJson, recommendationRequest(effectiveInput, { event, now: Date.now(), constraints }));
      requestAnimationFrame(() => teamPanel.current?.closest<HTMLElement>(".dc-team")?.scrollIntoView({ block: "start", behavior: "smooth" }));
    } catch (error) { setRunError(error instanceof Error ? error.message : String(error)); }
  }
  async function answerAll(keys: string[], name: CardFieldName, value: number) {
    if (!stored || linked) return;
    await storage.commit(answerDeckFields(stored, keys, name, value, {}));
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
    if (!stored) return;
    const saved = await storage.commit({ ...stored, baseline: { members: baselineMembers, snaps: baselineSnaps } }, baselineScope.revision);
    if (epoch !== baselineEditorEpoch.current) return;
    setBaselineSaveError(!saved); setBaselineSaved(saved);
    if (saved) setBaselineScope({ ...baselineScope, revision: baselineScope.revision + 1 });
  }
  useEffect(() => {
    const back = () => setPage(normalizePathname(window.location.pathname) === href("card-box") ? "box" : "deck");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [locale]);
  useEffect(() => { setExcluded([]); setRequired([]); updateGoal({ musicId: null, challengeMusicId: null, arenaMusicId: null, rewardContextConfirmed: false, selectedRewards: [], localEventPoints: null, localChallengePoints: null }); setRunError(""); setManagement(false); setSetup(false); setDeleting(false); setImporting(false);
    baselineEditorEpoch.current++; setOptions(false); setBaselineTarget(null); setBaselineScope(null); setEditingCardKey(null); setPlayerSettings(false); setGuideOpen(false); setBackupError(false); setSongPicker(false); setConstraintQuery(""); setConstraintFilter("all"); setPendingScreenshots([]); setDraggingScreenshots(false); setSavePicker(false); }, [server]);
  function openScreenshotImport() { if (linked) return; setManagement(false); setGuideOpen(false); setImporting(true); }
  function openGuide() { setManagement(false); setGuideOpen(true); }
  function openStorage() { setChoice(mode); setSetup(true); }
  function importImages(files: readonly File[]) {
    if (!files.length || busy || linked) return;
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
  const returnTo = href(page === "box" ? "card-box" : "deck");
  function openSavePicker() { setManagement(false); setGuideOpen(false); setSavePicker(true); }
  /** Stores the checked bytes, then links them; a Box is created in the current storage mode when there is none. */
  async function linkGameSave(meta: GameSaveMeta, save: LoadedGameSave): Promise<boolean> {
    if (save.sha256 !== meta.sha256) return false;
    try { await keepGameSave(save, meta.uploadedAt); } catch { return false; }
    const session = getCardBoxSession(server);
    if (!session.getSnapshot().box && !await session.start(mode)) return false;
    const latest = session.getSnapshot().box;
    if (!latest) return false;
    return session.commit({ ...latest, save: { server: meta.server, accountId: meta.accountId, sha256: save.sha256, uploadedAt: meta.uploadedAt } });
  }
  async function updateGameSave(meta: GameSaveMeta): Promise<boolean> {
    if (!stored?.save || meta.server !== stored.save.server || meta.accountId !== stored.save.accountId) return false;
    const save = await fetchGameSave(meta.server, meta.accountId);
    if (save.sha256 !== meta.sha256) { await saveList.refresh(); return false; }
    return linkGameSave(meta, save);
  }
  /** Another server's Box of this browser that links the same account keeps the cached save. */
  async function linkedElsewhere(server: GameServer, saveServer: string, accountId: string): Promise<boolean> {
    for (const other of GAME_SERVERS.filter(value => value !== server && gameSaveServer(value) === saveServer)) {
      const snapshot = getCardBoxSession(other).getSnapshot();
      const otherBox = snapshot.mode === "temporary" ? snapshot.box : await readLocalBox(other).catch(() => null);
      if (otherBox?.save?.accountId === accountId) return true;
    }
    return false;
  }
  async function unlinkGameSave(): Promise<boolean> {
    if (!stored?.save) return false;
    const link = stored.save;
    if (!await storage.commit({ ...stored, save: null })) return false;
    forgetLoadedGameSave(link.server, link.accountId);
    if (!await linkedElsewhere(server, link.server, link.accountId)) await deleteCachedGameSave(link.server, link.accountId).catch(() => undefined);
    return true;
  }
  const saveBanner = stored?.save ? <GameSaveBanner locale={locale} link={stored.save} state={linkedSave.state} derivation={derivation} list={saveList} busy={busy}
    returnTo={returnTo} onRetry={linkedSave.retry} onUpdate={updateGameSave} onUnlink={unlinkGameSave} /> : null;
  const saveNotice = saveBanner ?? <GameSaveHint locale={locale} server={server} list={saveList} returnTo={returnTo} />;
  const arenas = props.deckArenas?.find(row => row.server === server)?.songs ?? [];
  const selectedSong = songs.find(item => item.id === (isChallengeInput(effectiveInput)
    ? event?.challengeMusics.find(row => row.id === goalInput.challengeMusicId)?.musicId
    : solverGoalKind(effectiveInput) === "arenaLive" ? arenas.find(row => row.id === goalInput.arenaMusicId)?.musicId : goalInput.musicId));
  const composer = (key: string, values?: Record<string, string | number>) => tr(`composer.${key}`, values);
  const collection = (key: string, values?: Record<string, string | number>) => tr(`collection.${key}`, values);
  function goalCard(value: DeckGoal) {
    const coming = !!capabilities && !computesGoal(capabilities, value);
    return { id: value, title: tr(`goals.${value}`), description: tr(`goalNotes.${value}`), disabled: coming, badge: coming ? tr("comingSoon") : undefined,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={GOAL_ICONS[value]} /></svg> };
  }
  const formatEnd = (endAt: string) => {
    const time = parseMasterDate(endAt);
    return time === null ? endAt : new Intl.DateTimeFormat(locale, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(time);
  };
  const engine = solver.engine;
  const saveReady = !linked || linkedSave.state.status === "ready";
  const canRun = engine.status === "ready" && supported && !gap && saveReady;
  const blocker = engine.status === "loading" ? tr("solver.loading") : engine.status === "unavailable" ? tr(`solver.unavailable.${engine.reason}`)
    : engine.status === "failed" ? "" : !supported ? tr("comingSoon") : gap ? tr(`solver.gap.${gap}`) : !saveReady ? tr("solver.saveNotReady") : "";
  function engineNotice() {
    if (engine.status === "failed") return <p className="dc-engine-note" role="alert">{tr(`solver.failure.${engine.code}`)} <button type="button" onClick={solver.retry}>{tr("retry")}</button></p>;
    if (runError) return <p className="dc-engine-note" role="alert">{runError}</p>;
    return null;
  }
  function toggle(values: string[], key: string, update: (value: string[]) => void) { update(values.includes(key) ? values.filter(value => value !== key) : [...values, key]); }
  return <ContentServerProvider server={server} servers={servers}><div className={`dw-workspace ${page === "box" ? "dw-collection" : "dw-deck"}`} data-testid="deck-workspace">
    <header className="dw-header"><div><h1>{tr(page === "box" ? "boxTitle" : "title")}{page === "deck" && <span className="dw-beta">{tr("beta")}</span>}</h1><p>{page === "box" ? tr("boxDescription") : composer("workspaceNote")}</p>
      {page === "deck" && <p className="dw-sources"><a href={href("deck-guide")}>{tr("deckGuide.link")}</a> · {tr("sources.label")}: {DECK_SOURCES.map((source, index) => <Fragment key={source.key}>{index > 0 && " · "}<a href={source.url} target="_blank" rel="noopener noreferrer">{tr(`sources.${source.key}`)}</a></Fragment>)}</p>}</div><div className="dw-actions"><label className="dw-server">{tr("server")}<select aria-label={tr("server")} value={server} disabled={busy} onChange={event => pickServer(event.target.value as GameServer)}>{servers.map(value => <option key={value} value={value}>{t(locale, `gameServer.names.${value}`)}</option>)}</select></label><a className="dw-button" href={href(page === "box" ? "deck" : "card-box")} onClick={event => changePage(event, page === "box" ? "deck" : "box")}>{tr(page === "box" ? "goDeck" : "boxTitle")}</a></div></header>
    {storage.error && <p role="alert" className="dw-alert">{tr(`storageErrors.${storage.error}`)} <button disabled={busy || mode === "temporary"} onClick={() => void storage.reload()}>{tr("retry")}</button></p>}
    <CloudBoxPanel locale={locale} server={server} box={stored} busy={busy} returnTo={returnTo} />
    {page === "box" ? <section className={`cb-workspace dw-box-main${draggingScreenshots ? " is-dragging-screenshots" : ""}`} onDragOver={event => {
      if (busy || ![...event.dataTransfer.types].includes("Files")) return;
      event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setDraggingScreenshots(true);
    }} onDragLeave={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDraggingScreenshots(false); }} onDrop={event => {
      const files = [...event.dataTransfer.files].filter(file => file.type.startsWith("image/"));
      setDraggingScreenshots(false); if (!files.length) return;
      event.preventDefault(); importImages(files);
    }}>
      {stored && box ? <BoxManager key={`${server}:${stored.id}`} locale={locale} box={stored} view={linked ? box : undefined} notice={saveNotice} mode={mode} busy={busy} commit={storage.commit} playerCatalogue={playerCatalogue} onRecognize={openScreenshotImport} onImportSave={openSavePicker} onGuide={openGuide} onStorage={openStorage} onDelete={() => setDeleting(true)} {...catalog} /> : <>
        <div className="cb-collection-tools"><span className="cb-save-status" role="status">{collection(busy ? "loading" : "noBox")}</span><div className="cb-collection-actions"><button type="button" className="dw-primary cb-import-action" disabled={busy} onClick={openSavePicker}><CollectionIcon name="game" />{tr("gameSave.importAction")}</button><button type="button" className="cb-secondary-action" disabled={busy} onClick={openScreenshotImport}><CollectionIcon name="image" />{tr("screenshotImport")}</button><button type="button" className="cb-secondary-action" onClick={openGuide}><CollectionIcon name="guide" />{collection("guide")}</button><CollectionActionMenu locale={locale} busy={busy} onAdd={openStorage} onImport={() => emptyBackup.current?.click()} onStorage={openStorage} /></div></div>
        {saveNotice}
        <input className="dw-hidden" ref={emptyBackup} type="file" accept="application/json,.json" aria-label={collection("import")} onChange={event => void restoreBackup(event.target.files?.[0])} />
        <div className="cb-empty-collection"><div className="cb-empty-copy"><h2>{collection("emptyTitle")}</h2><p>{collection("emptyDescription")}</p></div><div className="cb-empty-art" aria-hidden="true">{members.filter(card => card.rarity === 4).slice(0, 3).map(card => <div key={card.id}><MemberSquareArtwork card={card} locale={locale} /></div>)}</div></div>
      </>}
      {backupError && <p className="dw-alert" role="alert">{tr("importError")}</p>}
      <p className="cb-input-note">{linked ? <span>{tr("gameSave.vipNote")}</span> : <>{collection("pasteDropHint")}<span>{collection("saveGrowth")}</span></>}</p>
    </section> : <>
      <DeckComposer
        labels={{ goal: composer("goalTitle"), conditions: composer("conditionsTitle"), collection: composer("collectionTitle"),
          team: composer("teamTitle"), cards: composer("cardsTitle"), questions: composer("questionsTitle") }}
        goalGroups={[
          { id: "event", title: event ? tr("goalGroups.event", { name: event.name, end: formatEnd(event.endAt) }) : tr("goalGroups.eventNone"),
            goals: event ? EVENT_GOALS.map(value => goalCard(value)) : [] },
          { id: "everyday", title: tr("goalGroups.everyday"), goals: EVERYDAY_GOALS.map(value => goalCard(value)) },
        ]}
        selectedGoal={goal} onGoalChange={value => { updateGoal({ goal: value as DeckGoal, ...(value === "challengePoints" && ["challengeLive", "challengeSkip"].includes(goalInput.venue) ? { venue: "freeLive" } : {}) }); safeSetLocalStorage(GOAL_STORAGE_KEY, value); }}
        collection={<div className="dc-collection-summary">
          <div className="dc-collection-stats"><span><strong>{ownedMembers.length}</strong> {tr("member")}</span><span><strong>{ownedSnaps.length}</strong> {tr("snap")}</span>
            {box && <span className="dc-collection-source" data-source={linked ? "game-save" : "box"}><CollectionIcon name={linked ? "game" : "image"} />{tr(linked ? "gameSave.sourceSave" : "gameSave.sourceBox")}
              {stored?.save && <small>{linkedSave.state.status === "ready" ? tr("gameSave.uploadedAt", { date: new Date(stored.save.uploadedAt).toLocaleDateString(locale) })
                : tr(linkedSave.state.status === "loading" ? "gameSave.loadingShort" : "gameSave.unavailableShort")}</small>}</span>}
            {box && <button type="button" className="dc-storage-label" onClick={openStorage}>{tr(mode)}</button>}</div>
          <div className="dc-collection-actions">{!linked && <button type="button" disabled={busy} onClick={openSavePicker}>{tr("gameSave.importAction")}</button>}
            {!linked && <button type="button" disabled={busy} onClick={openScreenshotImport}>{tr("screenshotImport")}</button>}
            {box && <button type="button" disabled={busy} onClick={() => setManagement(true)}>{tr("manage")}</button>}</div>
        </div>}
        conditions={<>
          {isEventPayoffGoal(goal) ? <label>{tr("venue")}<select aria-label={tr("venue")} value={goalInput.venue} onChange={change => updateGoal({ venue: change.target.value as DeckVenue })}>
            {goalVenues(goal).map(value => <option key={value} value={value} disabled={!!capabilities && !computes(capabilities, { goal, venue: value })}>{tr(`venues.${value}`)}</option>)}</select></label> : null}
          {solverGoalKind(effectiveInput) === "arenaLive" ? <label>{tr("arenaSong")}<select value={goalInput.arenaMusicId ?? ""} onChange={change => updateGoal({ arenaMusicId: change.target.value ? Number(change.target.value) : null })}><option value="">{tr(arenas.length ? "chooseArena" : "noArena")}</option>{arenas.map(row => <option key={row.id} value={row.id}>{songs.find(song => song.id === row.musicId)?.title ?? row.musicId}</option>)}</select></label> : isChallengeInput(effectiveInput) ? <div className="dc-challenge-songs" role="group" aria-label={tr("challengeSong")}>
            {(event?.challengeMusics ?? []).map(row => {
              const music = songs.find(item => item.id === row.musicId);
              return <button type="button" key={row.id} className="dc-song-button" aria-pressed={goalInput.challengeMusicId === row.id} onClick={() => updateGoal({ challengeMusicId: row.id })}>
                {music ? <img className="dc-song-cover" src={music.jacketUrl} alt="" /> : <span className="dc-song-cover" aria-hidden="true" />}
                <span className="dc-song-summary"><strong>{music?.title ?? row.musicId}</strong></span></button>;
            })}</div>
            : (goal !== "power" || goalInput.powerSong) && <button type="button" className="dc-song-button" onClick={() => setSongPicker(true)} aria-haspopup="dialog">
              {selectedSong ? <img className="dc-song-cover" src={selectedSong.jacketUrl} alt="" /> : <svg className="dc-song-cover" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M12 23V9l15-3v14M12 9l15-3M12 23c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Zm15-3c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Z" /></svg>}
              <span className="dc-song-summary"><small>{tr("song")}</small><strong>{selectedSong?.title ?? composer("emptySong")}</strong></span>
            </button>}
          {goal !== "power" && <div className="dc-field-pair">
            <label>{tr("difficulty")}<select aria-label={tr("difficulty")} value={goalInput.difficulty} onChange={change => updateGoal({ difficulty: change.target.value as MusicDifficulty })}>
              {MUSIC_DIFFICULTIES.filter(value => !selectedSong || selectedSong.difficulties.some(entry => entry.difficulty === value)).map(value => <option key={value} value={value}>{value.toUpperCase()}</option>)}</select></label>
            {isEventPayoffGoal(goal) && <label>{tr("consumption")}{isChallengeInput(effectiveInput)
              ? <select aria-label={tr("consumption")} value={goalInput.challengePoints} onChange={change => updateGoal({ challengePoints: Number(change.target.value) as ChallengePointCost })}>
                {CHALLENGE_POINT_COSTS.map(value => <option key={value} value={value}>{tr("challengePoints", { n: value })}</option>)}</select>
              : <select aria-label={tr("consumption")} value={goalInput.boosts} onChange={change => updateGoal({ boosts: Number(change.target.value) })}>
                {Array.from({ length: MAX_BOOST + 1 }, (_, value) => <option key={value} value={value}>{tr("boosts", { n: value })}</option>)}</select>}</label>}
          </div>}
          <DeckGoalConditions locale={locale} input={effectiveInput} event={event} capabilities={capabilities} onChange={updateGoal} />
          {goal === "power" && <div className="dc-checks">
            <label><input type="checkbox" checked={goalInput.powerSong} onChange={change => updateGoal({ powerSong: change.target.checked })} />{tr("powerSong")}</label>
            {event && <label><input type="checkbox" checked={goalInput.eventParameter} onChange={change => updateGoal({ eventParameter: change.target.checked })} />{tr("powerEvent")}</label>}
          </div>}
          {isNetworkInput(effectiveInput) && <p className="dw-muted">{tr("rankFixed")}</p>}
          {readsAccuracy(effectiveInput) && <details className="dc-play-style"><summary>{composer("advanced")}</summary>
            <label>{tr("greatRate", { n: effectiveInput.greatPercent })}<input aria-label={tr("greatRate", { n: effectiveInput.greatPercent })} type="range" min={0} max={playsGekisou(effectiveInput) ? 100 - effectiveInput.justPercent : 100}
              value={effectiveInput.greatPercent} onChange={change => updateGoal({ greatPercent: Number(change.target.value) })} /></label>
            {playsGekisou(effectiveInput) && <label>{tr("justRate", { n: effectiveInput.justPercent })}<input aria-label={tr("justRate", { n: effectiveInput.justPercent })} type="range" min={0} max={100 - effectiveInput.greatPercent}
              value={effectiveInput.justPercent} onChange={change => updateGoal({ justPercent: Number(change.target.value) })} /></label>}
            {capabilities && (!capabilities.accuracy.great || playsGekisou(effectiveInput) && !capabilities.accuracy.just) ? <p className="dw-muted">{tr("accuracyComing")}</p>
              : <p className="dw-muted">{tr(playsGekisou(effectiveInput) ? "accuracyNoteGekisou" : "accuracyNote")}</p>}
            {isEventPayoffGoal(goal) && isNetworkInput(effectiveInput) && <label>{tr("othersAverage")}<input type="number" min={0} inputMode="numeric" placeholder={tr("othersAverageSame")}
              value={goalInput.othersAverageScore ?? ""} onChange={change => updateGoal({ othersAverageScore: change.target.value === "" ? null : Number(change.target.value) })} /></label>}
          </details>}
          <div className="dc-condition-actions"><button type="button" disabled={!box || busy} onClick={() => openOptions("constraints")}>{composer("searchConstraints")}{required.length + excluded.length > 0 && <span> · {required.length + excluded.length}</span>}</button>
            <button type="button" disabled={!box || busy} onClick={() => setPlayerSettings(true)}>{composer("playerBonuses")}</button></div>
        </>}
        team={<div ref={teamPanel} className="dc-team-body">
          {job.status !== "idle" ? <DeckResult locale={locale} job={job} goal={goal} stale={stale} timeLimit={goalInput.timeLimit} box={box} catalog={catalog} linked={linked} busy={busy}
            onStop={solver.stop} onRerun={runSolver} onEditCard={setEditingCardKey} onPlayer={() => setPlayerSettings(true)} onAnswerAll={(keys, name, value) => void answerAll(keys, name, value)} />
          : sample.length > 0 ? <>
            <p className="dc-team-caption" data-team-source={preview.source}>{composer(preview.source === "baseline" ? "currentTeam" : "fromCollection")}</p>
            <div className="dc-stage"><NativeFormationGroup locale={locale} slots={sampleSlots} label={composer("teamTitle")} /></div>
            <div className="dc-slot-labels">{preview.members.map((card, index) => <div key={index} title={card ? cardTitle(card, catalog) : tr("emptySlot")}>
              <span className={index === 2 ? "dc-leader" : ""}>{index === 2 ? composer("leaderShort") : index + 1}</span>
              <strong>{card ? cardTitle(card, catalog) : tr("emptySlot")}</strong></div>)}</div>
          </> : <div className="dc-empty-team"><div className="dc-empty-slots" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={index === 2 ? "is-leader" : ""}>+</span>)}</div>
            <h3>{composer("emptyTitle")}</h3><p>{composer("emptyDescription")}</p></div>}
        </div>}
        teamActions={box && job.status === "idle" && <button type="button" disabled={busy || !ownedMembers.length} onClick={() => openOptions("team")}>{composer("editTeam")}</button>}
        notice={engineNotice()}
        primaryAction={<div className="dc-main-actions">
          {job.status === "running" ? <button type="button" className="dc-primary" onClick={solver.stop}>{tr("solver.stop")}</button>
            : <button type="button" className="dc-primary" disabled={busy || (!!ownedMembers.length && !canRun)} onClick={() => {
              if (!ownedMembers.length) { if (!linked) openSavePicker(); return; }
              runSolver();
            }}>{!ownedMembers.length ? tr(linked ? "gameSave.loadingShort" : "gameSave.importAction") : tr(job.status === "idle" ? "solver.start" : "solver.rerun")}</button>}
          {ownedMembers.length > 0 && job.status !== "running" && blocker && <small className="dc-blocker">{blocker}</small>}
          {!ownedMembers.length && !linked && <button type="button" className="dc-manual-start" onClick={() => box ? setManagement(true) : setSetup(true)}>{composer("manualShort")}</button>}
        </div>}
        cards={box && ownedMembers.length + ownedSnaps.length > 0 && <>
          <div className="dc-mini-cards">{[...ownedMembers.slice(0, 5), ...ownedSnaps.slice(0, 3)].map(card => <button type="button" className="dc-mini-card" key={card.key} disabled={busy} aria-label={composer("editThisCard", { name: cardTitle(card, catalog) })} onClick={() => setEditingCardKey(card.key)}>
            <BoxArtwork card={card} catalog={catalog} locale={locale} /><span>{cardTitle(card, catalog)}</span></button>)}</div>
          <button type="button" className="dc-view-all" onClick={() => setManagement(true)}>{composer("moreCards", { count: box.cards.length })}</button>
        </>}
      />
    </>}
    <Modal historyNavigation={false} isOpen={setup} onClose={() => setSetup(false)} title={tr(box ? "storageChoice" : "createBox")} closeLabel={tr("close")}><div className="dw-dialog"><p>{tr("storagePrompt")}</p><div className="dw-storage-options">{(["local", "temporary"] as const).map(value => <button className={choice === value ? "is-selected" : ""} aria-pressed={choice === value} key={value} onClick={() => setChoice(value)}><strong>{tr(value)}</strong><span>{tr(value === "local" ? "localNote" : "temporaryNote")}</span></button>)}</div><p className="dw-muted">{tr("cloud.storageNote")}</p>{storage.error && <p className="dw-alert" role="alert">{tr(`storageErrors.${storage.error}`)}</p>}<button disabled={busy} className="dw-primary" onClick={async () => { if (await storage.start(choice)) { setSetup(false); if (page === "deck") setManagement(true); } }}>{tr(box ? "save" : "continue")}</button></div></Modal>
    <Modal historyNavigation={false} isOpen={management && box !== null} onClose={() => setManagement(false)} title={tr("boxTitle")} closeLabel={tr("close")} size="xl">{stored && box && <BoxManager key={`${server}:${stored.id}`} locale={locale} box={stored} view={linked ? box : undefined} notice={saveNotice} mode={mode} busy={busy} commit={storage.commit} playerCatalogue={playerCatalogue} onRecognize={openScreenshotImport} onImportSave={openSavePicker} onGuide={openGuide} onStorage={() => { setManagement(false); openStorage(); }} onDelete={() => { setManagement(false); setDeleting(true); }} {...catalog} />}</Modal>
    {box && <BoxCardEditor locale={locale} box={box} cardKey={editingCardKey} busy={busy} commit={storage.commit} onClose={() => setEditingCardKey(null)} readOnly={linked} {...catalog} />}
    <MusicSelectDialog key={`songs:${server}`} locale={locale} songs={songs} open={songPicker} onClose={() => setSongPicker(false)}
      current={selectedSong ? { musicId: selectedSong.id, difficulty: goalInput.difficulty } : null} sortPage="deck-song"
      onSelect={selection => updateGoal({ musicId: selection.song.id, difficulty: selection.difficulty })} />
    <Modal historyNavigation={false} isOpen={playerSettings && box !== null} onClose={() => setPlayerSettings(false)} title={tr("playerTitle")} closeLabel={tr("close")} size="lg">
      {stored && <PlayerStateManager key={`${server}:${stored.id}`} locale={locale} box={stored} view={linked ? box ?? undefined : undefined} catalogue={playerCatalogue} busy={busy} commit={storage.commit} embedded />}
    </Modal>
    <ScreenshotImport locale={locale} server={server} source={recognition.context?.source} sourceIssue={recognition.issue} box={box} mode={mode} catalog={catalog} isOpen={importing} onClose={() => { setImporting(false); setPendingScreenshots([]); }} onSave={saveScreenshot} pendingFiles={pendingScreenshots} onPendingFilesConsumed={() => setPendingScreenshots([])} />
    <CardBoxGuide key={`guide:${server}`} locale={locale} members={members} snaps={snaps} isOpen={guideOpen} onClose={() => setGuideOpen(false)} onStartImport={openScreenshotImport} />
    <GameSavePicker locale={locale} server={server} isOpen={savePicker} onClose={() => setSavePicker(false)} list={saveList} busy={busy} onLink={linkGameSave} returnTo={returnTo} onScreenshot={openScreenshotImport} />
    <Modal historyNavigation={false} isOpen={options} onClose={closeOptions} title={composer(optionsTab === "team" ? "teamEditorTitle" : "constraintsTitle")} closeLabel={tr("close")} size="lg"><div className="dw-dialog dc-options">
      <div className="dc-option-tabs" role="group" aria-label={composer("searchConstraints")}><button type="button" aria-pressed={optionsTab === "team"} onClick={() => setOptionsTab("team")}>{composer("editTeam")}</button><button type="button" aria-pressed={optionsTab === "constraints"} onClick={() => setOptionsTab("constraints")}>{composer("searchConstraints")}</button></div>
      {optionsTab === "constraints" ? <>
        <p className="dw-muted">{composer("constraintDescription")}</p>
        <input className="dc-option-search" aria-label={tr("searchCards")} placeholder={tr("searchCards")} value={constraintQuery} onChange={event => setConstraintQuery(event.target.value)} />
        <div className="dc-option-tabs" role="group" aria-label={composer("constraintsTitle")}>{(["all", "required", "excluded"] as const).map(value => <button type="button" key={value} aria-pressed={constraintFilter === value} onClick={() => setConstraintFilter(value)}>{composer(value === "all" ? "constraintAll" : value === "required" ? "constraintRequired" : "constraintExcluded")}</button>)}</div>
        {(box?.cards ?? []).filter(card => (constraintFilter === "all" || (constraintFilter === "required" ? required : excluded).includes(card.key))
          && `${cardTitle(card, catalog)} ${cardSubtitle(card, catalog)} ${card.identity.value ?? ""}`.toLowerCase().includes(constraintQuery.toLowerCase())).map(card => <div key={card.key} className="dc-constraint-card"><BoxArtwork card={card} catalog={catalog} locale={locale} /><div><strong>{cardTitle(card, catalog)}</strong><small>{cardSubtitle(card, catalog)}</small></div>
            {card.kind === "member" && <label><input type="checkbox" checked={required.includes(card.key)} disabled={excluded.includes(card.key) || required.filter(key => box?.cards.find(other => other.key === key)?.kind === card.kind).length >= 5 && !required.includes(card.key)} onChange={() => toggle(required, card.key, setRequired)} />{tr("required")}</label>}<label><input type="checkbox" checked={excluded.includes(card.key)} disabled={required.includes(card.key)} onChange={() => toggle(excluded, card.key, setExcluded)} />{tr("excluded")}</label></div>)}
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

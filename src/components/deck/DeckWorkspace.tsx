"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import Button from "@mui/material/Button";
import Slider from "@mui/material/Slider";
import { withMd3 } from "@/components/md3/Md3Provider";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { Icon } from "@/components/shared/icons";
import { DeckNumberField, DeckSegmented, DeckSelect, DeckSwitchRow } from "./DeckControls";
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
import { EMPTY_CARD_FILTERS, memberCardSubject, supportCardSubject, type CardFilterSubject } from "@/lib/filter/card-filter";
import { mergeBoxBackup, parseBox, type BoxCard, type BoxSaveLink, type CardBox, type CardFieldName, type CardKind } from "@/lib/box/model";
import { answerDeckFields } from "@/lib/box/deck-answers";
import { boxAccountJson, gameSaveAccountJson } from "@/lib/deck/account-envelope";
import { CHALLENGE_POINT_COSTS, DEFAULT_DECK_GOAL, EVENT_GOALS, EVERYDAY_GOALS, MAX_BOOST, computes, computesGoal, defaultDeckGoalInput, goalGap, heldEvent,
  playsGekisou, readsAccuracy, effectiveAggregation, usesEventItemRewards, rewardLayoutOf, isChallengeInput, isNetworkInput, challengeRateRequest, recommendationRequest, solverGoalKind, supportsCrossSongMean, goalVenues, isEventPayoffGoal, type ChallengePointCost, type DeckEvent, type DeckGoal, type DeckGoalInput, type DeckVenue, type DeckArenaMusic } from "@/lib/deck/goals";
import { arenaPeriod, arenaSongMatchesBand, resolveArenaRule, type DeckArenaCatalog, type DeckArenaMode, type DeckArenaRuleSource } from "@/lib/deck/arena";
import DeckArenaControls, { type DeckArenaSongEntry } from "./DeckArenaControls";
import { displayUtcLabel, formatMasterDate, parseMasterDate } from "@/lib/schedule";
import { useDisplayTimeZone } from "@/lib/schedule/use-display-time-zone";
import { safeGetLocalStorage, safeRemoveLocalStorage, safeSetLocalStorage } from "@/lib/storage/safe-storage";
import { EVENT_REWARDS, defaultRewardPlan } from "@/lib/deck/reward-mix";
import { challengeWorth } from "@/lib/deck/answer";
import { useDeckSolver } from "./use-deck-solver";
import { deckDataGap } from "@/lib/deck/data-coverage";
import DeckResult, { type DeckRateBasis } from "./DeckResult";
import { useCardBoxView } from "@/components/box/use-card-box";
import BoxManager, { BoxArtwork, BoxCardEditor, cardTitle, cardSubtitle } from "@/components/box/BoxManager";
import PlayerStateManager from "@/components/box/PlayerStateManager";
import MusicSelectDialog from "@/components/music/MusicSelectDialog";
import { type MusicDifficulty, MUSIC_DIFFICULTIES } from "@/lib/music/difficulty";
import DeckComposer from "./DeckComposer";
import HaneokaExport from "./HaneokaExport";
import DeckGoalConditions from "./DeckGoalConditions";
import DeckRewardMix from "./DeckRewardMix";
import DeckObjective from "./DeckObjective";
import Modal from "@/components/shared/Modal";
import CardFilters, { useCardFilters } from "@/components/shared/CardFilters";
import type { PlayerFieldCatalogue } from "@/lib/box/player-catalog";
import { getCardBoxSession } from "@/lib/box/session";
import { mergeRecognizedBox, type RecognitionSourceStamp } from "@/lib/recognition/protocol";
import ScreenshotImport from "@/components/box/ScreenshotImport";
import { createRecognitionContext } from "@/lib/recognition/catalogue";
import CardBoxGuide from "@/components/box/CardBoxGuide";
import CollectionIcon from "@/components/box/CollectionIcon";
import CollectionActionMenu from "@/components/box/CollectionActionMenu";
import { MemberSquareArtwork } from "@/components/shared/CardSquareArtwork";
import { gameSaveServer } from "@/config/account";
import { GAME_SERVERS } from "@/config/servers";
import type { GameSaveMeta } from "@/lib/account/game-saves";
import type { GameSaveTables } from "@/lib/box/game-save";
import { defaultGameSave, fetchGameSave, forgetLoadedGameSave, keepGameSave, type LoadedGameSave } from "@/lib/box/game-save-source";
import { loadGameAccounts } from "@/lib/account/game-accounts";
import { pruneCachedGameSaves } from "@/lib/box/save-cache";
import { readLocalBox } from "@/lib/box/store";
import { GameSaveBanner, GameSaveHint, GameSavePicker, StarMoeBoxTokenNotice } from "@/components/box/GameSave";
import { useGameSaveList } from "@/components/box/use-game-save";
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
  deckArenas?: readonly { server: GameServer; songs: readonly DeckArenaMusic[]; catalog?: DeckArenaCatalog }[];
}
const GOAL_STORAGE_KEY = "moenotes.deck.goal";
/** Set per server after the user unlinks the uploaded save: the Box then keeps its own facts until a save is linked again. */
const OWN_FACTS_KEY = "moenotes.box.own-facts";
/** One automatic save action, keyed by the listed version it acts on. */
interface AutoAttempt { key: string; tries: number; running: boolean }
function startAttempt(slot: { current: AutoAttempt | null }, key: string): AutoAttempt | null {
  const attempt = slot.current?.key === key ? slot.current : { key, tries: 0, running: false };
  if (attempt.running || attempt.tries >= 2) return null;
  attempt.running = true; attempt.tries++;
  slot.current = attempt;
  return attempt;
}
function finishAttempt(attempt: AutoAttempt, done: boolean): void {
  attempt.running = false;
  if (done) attempt.tries = 2;
}
/** Public sources of the deck engine: Haneoka team builder and the scoring/search references. */
const DECK_SOURCES = [
  { key: "haneoka", url: "https://github.com/haneoka-gakuen/ournotes-team-builder" },
  { key: "model", url: "https://github.com/empty-sekai/ournotes-deck/tree/main/crates/ournotes-sim" },
  { key: "search", url: "https://github.com/empty-sekai/ournotes-deck/tree/main/crates/ournotes-search" },
] as const;
const GOAL_ICONS: Readonly<Record<DeckGoal, string>> = {
  challenge: "M5 21V4m0 0h11l-2 4 2 4H5", challengePoints: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 4v10m-3-5h6", eventPoints: "m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3 3-7Z", eventItems: "M4 8h16v12H4zM2 4h20v4H2zM12 4v16",
  mission: "M4 4h16v16H4zM8 12l3 3 5-6", arena: "M4 20V8l8-5 8 5v12M8 20v-8h8v8", skip: "m4 4 12 8-12 8V4Zm16 0v16", challengeSkip: "m4 4 12 8-12 8V4Zm16 0v16",
  battle: "M4 19 19 4M9 4h10v10", free: "m8 4 12 8-12 8V4Z", power: "m12 3 9 9-9 9-9-9 9-9Z",
};
/** The goal card of the three event rewards; the reward plan chooses which of them is the goal. */
const REWARDS_CARD = "eventRewards";
/** A box card of the restriction list with the catalogue facts the shared card filters read. */
type ConstraintEntry = { card: BoxCard; subject: CardFilterSubject };
const describeConstraint = (entry: ConstraintEntry) => entry.subject;
function readStoredGoal(): DeckGoal {
  const value = safeGetLocalStorage(GOAL_STORAGE_KEY);
  return value && ([...EVENT_GOALS, ...EVERYDAY_GOALS] as string[]).includes(value) ? value as DeckGoal : DEFAULT_DECK_GOAL;
}
function DeckWorkspace(props: DeckWorkspaceProps) {
  const { locale, servers } = props;
  const timeZone = useDisplayTimeZone();
  const [page, setPage] = useState(props.page);
  const href = (id: string) => localizePath(getRoutePathById(id), locale);
  const tr = (key: string, values?: Record<string, string | number>) => t(locale, `deckWorkspace.${key}`, values);
  const [server, pickServer] = useContentServer(locale, servers);
  const playerCatalogue = props.playerCatalogues?.find(value => value.server === server) ?? null;
  const saveTables = props.saveTables?.find(value => value.server === server) ?? null;
  /** What the page shows (`box`): the stored Box, or while a save is linked, the Box the save describes. */
  const { storage, linkedSave, derivation, box } = useCardBoxView(server, saveTables, playerCatalogue);
  const { busy, mode } = storage;
  /** The stored Box: every write starts from it. */
  const stored = storage.box;
  const members = useMemo(() => listForServer(props.members, server), [props.members, server]);
  const snaps = useMemo(() => listForServer(props.snaps, server), [props.snaps, server]);
  const songs = useMemo(() => listForServer(props.songs, server), [props.songs, server]);
  const catalog = useMemo(() => ({ members, snaps }), [members, snaps]);
  const saveList = useGameSaveList(server);
  const linked = !!stored?.save;
  const [savePicker, setSavePicker] = useState(false);
  const ownFactsKey = `${OWN_FACTS_KEY}.${server}`;
  /** Null until read. While false, a signed-in Box reads the account's uploaded save. */
  const [ownFacts, setOwnFacts] = useState<boolean | null>(null);
  useEffect(() => { setOwnFacts(safeGetLocalStorage(ownFactsKey) === "1"); }, [ownFactsKey]);
  const rawRecognitionSource = props.recognitionSources?.find(value => value.server === server);
  const recognition = useMemo(() => {
    if (!rawRecognitionSource) return { context: undefined, issue: "Master source stamp is unavailable" };
    try { return { context: createRecognitionContext(rawRecognitionSource, catalog), issue: "" }; }
    catch (error) { return { context: undefined, issue: error instanceof Error ? error.message : "Invalid card catalogue" }; }
  }, [rawRecognitionSource, catalog]);
  const [goalInput, setGoalInput] = useState<DeckGoalInput>(() => defaultDeckGoalInput());
  const updateGoal = (patch: Partial<DeckGoalInput>) => setGoalInput(previous => ({ ...previous, ...patch }));
  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    if (params?.get("goal") === "arena") {
      updateGoal({ goal: "arena", venue: "arenaLive" });
      const league = Number(params.get("league"));
      if (Number.isInteger(league) && league > 0) setArenaLeagueId(league);
      if (params.get("source") === "custom") {
        setUserArenaSource("custom");
        const band = Number(params.get("band"));
        const attr = Number(params.get("attr"));
        const m1 = Number(params.get("m1"));
        const m2 = Number(params.get("m2"));
        const m3 = Number(params.get("m3"));
        if (Number.isInteger(band) && band >= 1 && band <= 5) setArenaCustomBandId(band);
        if (Number.isInteger(attr) && ((attr >= 0 && attr <= 5) || attr === 99)) setArenaCustomMusicType(attr);
        if ([m1, m2, m3].every((m) => Number.isInteger(m) && m >= 0 && m <= 3)) {
          setArenaCustomMissions([m1, m2, m3]);
        }
      } else {
        setUserArenaSource("auto");
      }
      return;
    }
    updateGoal({ goal: readStoredGoal() });
  }, []);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(timer); }, []);
  const event = useMemo(() => heldEvent(props.deckEvents?.find(value => value.server === server)?.events ?? [], now, parseMasterDate), [props.deckEvents, server, now]);
  const solver = useDeckSolver(server, page === "deck");
  const capabilities = solver.engine.status === "ready" ? solver.engine.capabilities : null;
  const [excluded, setExcluded] = useState<string[]>([]);
  const [required, setRequired] = useState<string[]>([]);
  const [leaderKey, setLeaderKey] = useState<string | null>(null);
  const [noSnaps, setNoSnaps] = useState(false);
  const [userArenaSource, setUserArenaSource] = useState<DeckArenaRuleSource | null>(null);
  const [arenaLeagueId, setArenaLeagueId] = useState<number>(1);
  const [arenaCustomBandId, setArenaCustomBandId] = useState<number>(1);
  const [arenaCustomMusicType, setArenaCustomMusicType] = useState<number>(0);
  const [arenaCustomMissions, setArenaCustomMissions] = useState<[number, number, number]>([0, 0, 0]);
  const [arenaMode, setArenaMode] = useState<DeckArenaMode>("shared");
  const [arenaPool, setArenaPool] = useState<DeckArenaSongEntry[]>([]);
  const [arenaPickerOpen, setArenaPickerOpen] = useState(false);
  const [setup, setSetup] = useState(false);
  const [management, setManagement] = useState(false);
  const [importing, setImporting] = useState(false);
  const [constraintsOpen, setConstraintsOpen] = useState(false);
  const [constraintFilter, setConstraintFilter] = useState<"all" | "required" | "excluded">("all");
  const [constraintKind, setConstraintKind] = useState<CardKind>("member");
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
  const [runError, setRunError] = useState("");
  /** The challenge live that rated challenge points for the shown run. */
  const [rateBasis, setRateBasis] = useState<DeckRateBasis | null>(null);
  const teamPanel = useRef<HTMLDivElement>(null);
  const ownedMembers = box?.cards.filter(card => card.kind === "member") ?? [];
  const ownedSnaps = box?.cards.filter(card => card.kind === "snap") ?? [];
  // Keep the stored objective preference while using the selected scene's effective objective.
  const goal = goalInput.goal;
  const serverArenaData = props.deckArenas?.find(row => row.server === server);
  const arenas = serverArenaData?.songs ?? [];
  const arenaCatalog = serverArenaData?.catalog ?? null;
  const useModernArena = solverGoalKind(goalInput) === "arenaLive" && !!arenaCatalog && arenaCatalog.leagues.length > 0 && (!capabilities || capabilities.arenaRules === true);
  const validLeagueId = arenaCatalog?.leagues.some(l => l.id === arenaLeagueId) ? arenaLeagueId : (arenaCatalog?.leagues[0]?.id ?? 1);
  const autoArenaPeriod = useMemo(() => arenaPeriod(arenaCatalog, validLeagueId, now), [arenaCatalog, validLeagueId, now]);
  const arenaRuleSource: DeckArenaRuleSource = userArenaSource ?? (autoArenaPeriod.season && autoArenaPeriod.regulation ? "auto" : "custom");
  const effectiveArenaMode: DeckArenaMode = isEventPayoffGoal(goal) ? "individual" : arenaMode;
  const resolvedArena = useMemo(() => useModernArena ? resolveArenaRule({
    catalog: arenaCatalog,
    ruleSource: arenaRuleSource,
    leagueId: validLeagueId,
    customBandId: arenaCustomBandId,
    customMusicType: arenaCustomMusicType,
    customMissions: arenaCustomMissions,
    mode: effectiveArenaMode,
    now,
  }) : null, [useModernArena, arenaCatalog, arenaRuleSource, validLeagueId, arenaCustomBandId, arenaCustomMusicType, arenaCustomMissions, effectiveArenaMode, now]);
  useEffect(() => {
    const nextAt = resolvedArena?.period.nextAt;
    if (!nextAt || nextAt <= now) return;
    const delay = Math.min(2_147_483_647, Math.max(250, nextAt - Date.now() + 50));
    const timer = setTimeout(() => setNow(Date.now()), delay);
    return () => clearTimeout(timer);
  }, [resolvedArena?.period.nextAt, now]);
  const activeArenaBandId = resolvedArena?.rule?.bandId ?? null;
  const bandNames = useMemo(() => {
    const map = new Map<number, string>();
    for (const card of members) if (card.bandId && card.bandName && !map.has(card.bandId)) map.set(card.bandId, card.bandName);
    for (const song of songs) if (song.bandId && song.bandName && !map.has(song.bandId)) map.set(song.bandId, song.bandName);
    return map;
  }, [members, songs]);
  const arenaEligibleSongs = useMemo(
    () => (activeArenaBandId === null ? [] : songs.filter(song => arenaSongMatchesBand(song, activeArenaBandId, now))),
    [songs, activeArenaBandId, now],
  );
  const filteredArenaPool = useMemo(() => {
    if (!useModernArena) return [];
    const allowed = new Set(arenaEligibleSongs.map(song => song.id));
    const list = arenaPool.filter(entry => allowed.has(entry.musicId));
    if (isEventPayoffGoal(goal)) return list.slice(0, 1);
    return effectiveArenaMode === "shared" ? list.slice(0, 5) : list;
  }, [useModernArena, arenaEligibleSongs, arenaPool, goal, effectiveArenaMode]);
  const canAllSongs = !!capabilities?.crossSong && goal !== "power" && !(useModernArena && effectiveArenaMode === "shared");
  const effectiveInput: DeckGoalInput = {
    ...goalInput,
    allSongs: !!goalInput.allSongs && solver.engine.status === "ready" && canAllSongs,
    aggregation: useModernArena && effectiveArenaMode === "shared" ? "expected" : effectiveAggregation(goalInput),
    ...(useModernArena ? {
      arenaRule: resolvedArena?.rule ?? null,
      arenaSongEntries: filteredArenaPool,
      ...(filteredArenaPool.length === 1 ? { musicId: filteredArenaPool[0]!.musicId, difficulty: filteredArenaPool[0]!.difficulty } : {}),
    } : {}),
  };
  const scopeCatalog = solver.engine.status === "ready" ? solver.engine.catalog : null;
  const scopeKind = solverGoalKind(effectiveInput);
  const allOverriddenNonLuck = effectiveInput.songRules?.missions.every(m => m === 1 || m === 3) ?? false;
  const eligibleSongs = scopeCatalog?.musics.filter(song =>
    song.difficulties.includes(effectiveInput.difficulty)
    && (!playsGekisou(effectiveInput) || scopeKind === "arenaLive" || allOverriddenNonLuck || song.hasLuck !== null),
  ) ?? [];
  const eligibleIds = new Set(eligibleSongs.map(song => song.id));
  const arenaEligibleIdSet = new Set(arenaEligibleSongs.map(song => song.id));
  const songScope = effectiveInput.allSongs ? scopeKind === "arenaLive"
    ? (useModernArena
      ? { field: "musicIds" as const, ids: eligibleSongs.filter(song => arenaEligibleIdSet.has(song.id)).map(song => song.id) }
      : { field: "arenaMusicIds" as const, ids: scopeCatalog?.arenaMusics.filter(song => eligibleIds.has(song.musicId)).map(song => song.id) ?? [] })
    : isChallengeInput(effectiveInput) ? { field: "challengeMusicIds" as const, ids: scopeCatalog?.challengeMusics.filter(song => song.eventId === event?.id && eligibleIds.has(song.musicId)).map(song => song.id) ?? [] }
    : { field: "musicIds" as const, ids: eligibleSongs.map(song => song.id) } : undefined;
  const gap = songScope && !songScope.ids.length ? "song" : goalGap(effectiveInput, event);
  const dataGap = solver.engine.status === "ready" ? deckDataGap(effectiveInput, event, solver.engine.catalog,
    arenas, capabilities) : null;
  const supported = capabilities ? computes(capabilities, effectiveInput) : !usesEventItemRewards(effectiveInput) && !rewardLayoutOf(effectiveInput) && effectiveInput.aggregation === "expected";
  const memberBandById = useMemo(() => new Map(members.map(card => [String(card.id), card.bandId])), [members]);
  const idsOf = (keys: readonly string[], kind: CardKind, filterArenaBand = false) => keys.flatMap(key => {
    const card = box?.cards.find(item => item.key === key && item.kind === kind);
    if (!card?.identity.value) return [];
    if (filterArenaBand && activeArenaBandId !== null && memberBandById.get(card.identity.value) !== activeArenaBandId) return [];
    return [card.identity.value];
  });
  const resolvedLeaderId = leaderKey ? idsOf([leaderKey], "member", useModernArena)[0] ?? null : null;
  const constraints = {
    leader: resolvedLeaderId,
    includeMembers: idsOf(required, "member", useModernArena),
    excludeMembers: idsOf(excluded, "member"),
    excludeSnaps: idsOf(excluded, "snap"),
    noSnaps,
  };
  /** The kind the restriction list shows: one at a time, since members and Snaps rate on different rarity scales. */
  const shownConstraintKind: CardKind = ownedMembers.length && ownedSnaps.length ? constraintKind : ownedMembers.length ? "member" : "snap";
  const constraintEntries = useMemo<ConstraintEntry[]>(() => {
    const memberById = new Map(members.map(card => [String(card.id), card]));
    const snapById = new Map(snaps.map(card => [String(card.id), card]));
    return (box?.cards ?? []).filter(card => card.kind === shownConstraintKind).map(card => {
      const id = card.identity.value ?? "";
      const member = card.kind === "member" ? memberById.get(id) : undefined;
      const snap = card.kind === "snap" ? snapById.get(id) : undefined;
      const known = member ? memberCardSubject(member) : snap ? supportCardSubject(snap) : null;
      // Unidentified cards keep rarity 0, so they show only while no rarity, attribute or band is chosen.
      const subject = known ?? { id: 0, title: cardTitle(card, catalog), rarity: 0, cardType: 0, bandId: 0, bandName: "", characters: [], searchText: "" };
      return { card, subject: { ...subject, searchText: `${subject.searchText} ${cardTitle(card, catalog)} ${cardSubtitle(card, catalog)} ${id}` } };
    });
  }, [box, members, snaps, catalog, shownConstraintKind]);
  // The all / required / excluded tab narrows the list without changing the filter options it offers.
  const matchConstraintScope = useCallback((entry: ConstraintEntry) => constraintFilter === "all"
    || (constraintFilter === "required" ? required.includes(entry.card.key) || leaderKey === entry.card.key : excluded.includes(entry.card.key)), [constraintFilter, required, leaderKey, excluded]);
  const constraintCards = useCardFilters(constraintEntries, locale, "deck-constraints", describeConstraint, { match: matchConstraintScope });
  const { setFilters: setConstraintCardFilters } = constraintCards;
  // Rarity scales and bands differ between members and Snaps: whenever the shown kind changes (picked, or the box lost
  // the other kind), start from no filters but keep the search, so no filter stays on without its chip.
  useEffect(() => { setConstraintCardFilters(current => ({ ...EMPTY_CARD_FILTERS, query: current.query })); }, [shownConstraintKind, setConstraintCardFilters]);
  const runKey = JSON.stringify([server, box?.id, box?.revision, stored?.save?.sha256 ?? null, solver.engine.status === "ready" ? solver.engine.datasetId : null, effectiveInput, constraints, event?.id ?? null]);
  const job = solver.job;
  const stale = job.status !== "idle" && job.status !== "running" && job.key !== runKey;
  function runSolver() {
    setRunError("");
    if (solver.engine.status !== "ready" || !box || gap || dataGap || !supported) return;
    try {
      const target = { datasetId: solver.engine.datasetId, server: gameSaveServer(server) };
      let accountJson: string;
      if (stored?.save) {
        if (linkedSave.state.status !== "ready") throw new Error(tr("solver.saveNotReady"));
        accountJson = gameSaveAccountJson(target, stored, linkedSave.state.save);
      } else {
        if (!saveTables) throw new Error(tr("solver.tablesUnavailable"));
        accountJson = boxAccountJson(target, box, saveTables, { fallbackBandItems: true });
      }
      const context = { event, now: Date.now(), constraints }, cost = effectiveInput.challengePoints;
      const rate = challengeRateRequest(effectiveInput, context);
      setRateBasis(rate === null ? null : { song: songs.find(item => item.id === event?.challengeMusics.find(row => row.id === effectiveInput.challengeMusicId)?.musicId)?.title ?? String(effectiveInput.challengeMusicId),
        difficulty: effectiveInput.rateDifficulty, cost });
      solver.run(runKey, accountJson, { rate, request: answer => {
        if (!answer) return recommendationRequest(effectiveInput, context, { ...(songScope ? { songScope } : {}) });
        const worth = challengeWorth(answer, cost);
        return worth ? recommendationRequest(effectiveInput, context, { worth, ...(songScope ? { songScope } : {}) }) : null;
      } });
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
  function openConstraints() { setConstraintsOpen(true); }
  useEffect(() => {
    const back = () => setPage(normalizePathname(window.location.pathname) === href("card-box") ? "box" : "deck");
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [locale]);
  useEffect(() => { setExcluded([]); setRequired([]); setLeaderKey(null); setNoSnaps(false); setUserArenaSource(null); setArenaLeagueId(1); setArenaCustomBandId(1); setArenaCustomMusicType(0); setArenaCustomMissions([0, 0, 0]); setArenaPool([]); setArenaPickerOpen(false);
    updateGoal({ musicId: null, challengeMusicId: null, arenaMusicId: null }); setRunError(""); setManagement(false); setSetup(false); setDeleting(false); setImporting(false);
    setConstraintsOpen(false); setEditingCardKey(null); setPlayerSettings(false); setGuideOpen(false); setBackupError(false); setSongPicker(false); setConstraintFilter("all");
    setConstraintKind("member"); setConstraintCardFilters(EMPTY_CARD_FILTERS); setPendingScreenshots([]); setDraggingScreenshots(false); setSavePicker(false); }, [server]);
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
      if (!await session.commit(mergeBoxBackup(session.getSnapshot().box!, incoming))) throw new Error("save");
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
  /** Checks the source around cache storage; a Box is created in the current storage mode when there is none. */
  async function linkGameSave(meta: GameSaveMeta, save: LoadedGameSave, expectedSave?: BoxSaveLink | null): Promise<boolean> {
    if (save.server !== meta.server || save.accountId !== meta.accountId || save.sha256 !== meta.sha256) return false;
    const session = getCardBoxSession(server);
    if (!session.getSnapshot().box && expectedSave) return false;
    if (!session.getSnapshot().box && !await session.start(mode)) return false;
    const previous = session.getSnapshot().box?.save;
    const link = { server: meta.server, accountId: meta.accountId, sha256: save.sha256, uploadedAt: meta.uploadedAt };
    const linked = await session.linkSave(link, expectedSave, () => keepGameSave(save, meta.uploadedAt));
    if (linked) {
      await pruneSaveCache(link).catch(() => undefined);
      if (previous && (previous.server !== link.server || previous.accountId !== link.accountId)) await pruneSaveCache(previous).catch(() => undefined);
    }
    return linked;
  }
  async function updateGameSave(meta: GameSaveMeta): Promise<boolean> {
    const expectedSave = stored?.save;
    if (!expectedSave || meta.server !== expectedSave.server || meta.accountId !== expectedSave.accountId) return false;
    const save = await fetchGameSave(meta.server, meta.accountId);
    if (save.sha256 !== meta.sha256) { await saveList.refresh(); return false; }
    return linkGameSave(meta, save, expectedSave);
  }
  /** Persistent and current-visit Boxes can retain different versions of the same account. */
  async function pruneSaveCache(link: BoxSaveLink): Promise<void> {
    const referenced = new Set<string>();
    for (const other of GAME_SERVERS.filter(value => gameSaveServer(value) === link.server)) {
      const local = await readLocalBox(other);
      for (const box of [local, getCardBoxSession(other).getSnapshot().box]) {
        if (box?.save?.server === link.server && box.save.accountId === link.accountId) referenced.add(box.save.sha256);
      }
    }
    await pruneCachedGameSaves(link.server, link.accountId, referenced);
  }
  /** The user's own choice in the picker; it also ends an earlier opt-out. */
  async function pickGameSave(meta: GameSaveMeta, save: LoadedGameSave): Promise<boolean> {
    const linked = await linkGameSave(meta, save);
    if (linked) { safeRemoveLocalStorage(ownFactsKey); setOwnFacts(false); }
    return linked;
  }
  async function unlinkGameSave(): Promise<boolean> {
    if (!stored?.save) return false;
    const link = stored.save;
    // Opt out first: the render that sees the unlinked Box must not link the upload again.
    safeSetLocalStorage(ownFactsKey, "1"); setOwnFacts(true);
    if (!await storage.commit({ ...stored, save: null })) { safeRemoveLocalStorage(ownFactsKey); setOwnFacts(false); return false; }
    forgetLoadedGameSave(link.server, link.accountId, link.sha256);
    await pruneSaveCache(link).catch(() => undefined);
    return true;
  }
  // Signed in, the uploaded save comes first: link the default upload when the Box has no save, and follow newer
  // uploads of the linked player. Each listed version gets at most two attempts (a write can meet a busy session);
  // the picker and the banner's update remain for anything later.
  const autoLink = useRef<AutoAttempt | null>(null);
  useEffect(() => {
    const saves = saveList.saves;
    if (busy || stored?.save || ownFacts !== false || saveList.access !== "signed-in" || !saves?.length) return;
    const attempt = startAttempt(autoLink, `${server}:${saves.map(save => save.sha256).join(",")}`);
    if (!attempt) return;
    void (async () => {
      const players = new Set(saves.map(save => save.accountId));
      const verified = players.size > 1 ? (await loadGameAccounts()).accounts.filter(account => account.server === server && account.verified).map(account => account.profileId) : [];
      const meta = defaultGameSave(saves, verified);
      if (!meta) return true;
      const save = await fetchGameSave(meta.server, meta.accountId);
      if (save.sha256 !== meta.sha256) { await saveList.refresh(); return true; }
      return safeGetLocalStorage(ownFactsKey) === "1" || await linkGameSave(meta, save, null);
    })().catch(() => false).then(done => finishAttempt(attempt, done));
  }, [busy, stored?.save, ownFacts, saveList.access, saveList.saves, server]);
  const follow = useRef<AutoAttempt | null>(null);
  useEffect(() => {
    const link = stored?.save;
    if (busy || !link || saveList.access !== "signed-in" || !saveList.saves) return;
    const meta = saveList.saves.find(save => save.accountId === link.accountId);
    if (!meta || meta.sha256 === link.sha256 || meta.uploadedAt < link.uploadedAt) return;
    const attempt = startAttempt(follow, `${server}:${meta.sha256}`);
    if (!attempt) return;
    void updateGameSave(meta).catch(() => false).then(done => finishAttempt(attempt, done));
  }, [busy, stored?.save, saveList.access, saveList.saves, server]);
  // The linked version left the account: list again so the newer upload is followed.
  useEffect(() => { if (linkedSave.state.status === "changed") void saveList.refresh(); }, [linkedSave.state.status]);
  // Uploads happen in the App, usually while this page is in the background.
  useEffect(() => {
    if (saveList.access !== "signed-in") return;
    let listedAt = Date.now();
    const relist = () => {
      if (document.visibilityState !== "visible" || Date.now() - listedAt < 30_000) return;
      listedAt = Date.now();
      void saveList.refresh();
    };
    document.addEventListener("visibilitychange", relist);
    return () => document.removeEventListener("visibilitychange", relist);
  }, [saveList.access]);
  const saveBanner = stored?.save ? <GameSaveBanner locale={locale} link={stored.save} state={linkedSave.state} derivation={derivation} list={saveList} busy={busy}
    returnTo={returnTo} onRetry={linkedSave.retry} onUpdate={updateGameSave} onUnlink={unlinkGameSave} /> : null;
  /** Uploads exist but the Box reads none on its own: the user unlinked, or several players uploaded. */
  const pickPrompt = !stored?.save && !!saveList.saves?.length && (ownFacts === true || new Set(saveList.saves.map(save => save.accountId)).size > 1);
  const saveNotice = saveBanner ?? <GameSaveHint locale={locale} server={server} list={saveList} returnTo={returnTo} onPick={pickPrompt ? openSavePicker : undefined} />;
  const selectedSong = songs.find(item => item.id === (isChallengeInput(effectiveInput)
    ? event?.challengeMusics.find(row => row.id === goalInput.challengeMusicId)?.musicId
    : solverGoalKind(effectiveInput) === "arenaLive"
      ? (useModernArena ? filteredArenaPool[0]?.musicId : arenas.find(row => row.id === goalInput.arenaMusicId)?.musicId)
      : goalInput.musicId));
  const challengeSongs = (event?.challengeMusics ?? []).map(row => {
    const music = songs.find(item => item.id === row.musicId);
    return { id: row.id, title: music?.title ?? String(row.musicId), jacketUrl: music?.jacketUrl ?? null, difficulties: music?.difficulties.map(entry => entry.difficulty) ?? [] };
  });
  const composer = (key: string, values?: Record<string, string | number>) => tr(`composer.${key}`, values);
  const collection = (key: string, values?: Record<string, string | number>) => tr(`collection.${key}`, values);
  function goalCard(value: DeckGoal) {
    const coming = capabilities ? !computesGoal(capabilities, value) : value === "eventItems" && solver.engine.status === "ready";
    return { id: value, title: tr(`goals.${value}`), description: tr(coming && value === "eventItems" ? "solver.eventItemsUnsupported" : `goalNotes.${value}`), disabled: coming, badge: coming ? tr(value === "eventItems" ? "objective.unsupported" : "comingSoon") : undefined,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={GOAL_ICONS[value]} /></svg> };
  }
  function rewardsCard() {
    const coming = !!capabilities && !EVENT_REWARDS.some(value => computesGoal(capabilities, value));
    return { id: REWARDS_CARD, title: tr("goals.eventRewards"), description: tr("goalNotes.eventRewards"), disabled: coming, badge: coming ? tr("comingSoon") : undefined,
      icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><path d={GOAL_ICONS.eventPoints} /></svg> };
  }
  function selectGoal(id: string) {
    if (id === REWARDS_CARD && isEventPayoffGoal(goal)) return;
    const next = id === REWARDS_CARD ? EVENT_REWARDS.find(value => !capabilities || computesGoal(capabilities, value)) ?? "eventPoints" : id as DeckGoal;
    updateGoal({ goal: next, ...(next !== goal ? { rewards: defaultRewardPlan() } : {}), ...(next === "challengePoints" && ["challengeLive", "challengeSkip"].includes(goalInput.venue) ? { venue: "freeLive" } : {}) });
    safeSetLocalStorage(GOAL_STORAGE_KEY, next);
  }
  const formatEnd = (endAt: string) => {
    const time = formatMasterDate(endAt, locale, true, timeZone);
    return time ? `${time} ${displayUtcLabel(endAt, timeZone)}` : endAt;
  };
  const engine = solver.engine;
  const saveReady = !linked || linkedSave.state.status === "ready";
  const canRun = engine.status === "ready" && supported && !gap && !dataGap && saveReady;
  const blocker = engine.status === "loading" ? tr("solver.loading") : engine.status === "unavailable" ? tr(`solver.unavailable.${engine.reason}`)
    : engine.status === "failed" ? "" : !supported ? tr(rewardLayoutOf(effectiveInput) ? effectiveInput.aggregation === "expected" ? "rewardMix.unavailable" : "rewardMix.expectedOnly" : goal === "eventItems" ? "solver.eventItemsUnsupported" : "comingSoon") : gap ? tr(`solver.gap.${gap}`) : !saveReady ? tr("solver.saveNotReady") : "";
  const runBlocker = ownedMembers.length ? "" : tr(linked && !saveReady ? "solver.saveNotReady" : "solver.emptyBox");
  const activeConstraintCount = required.length + excluded.length + (leaderKey ? 1 : 0) + (noSnaps ? 1 : 0);
  const requiredConstraintCount = new Set([...required, ...(leaderKey ? [leaderKey] : [])]).size;
  function engineNotice() {
    if (engine.status === "failed") {
      return (
        <div className="dc-engine-note" role="alert">
          <Icon name="info" className="h-[18px] w-[18px] shrink-0" />
          <span className="dc-engine-note-text">{tr(`solver.failure.${engine.code}`)}</span>
          <Button variant="text" size="small" onClick={solver.retry}>{tr("retry")}</Button>
        </div>
      );
    }
    if (dataGap === "eventItemRewards") return <p className="dc-engine-note" role="status">{tr("solver.eventItemRewardsUnsupported")}</p>;
    if (dataGap === "luck") return <p className="dc-engine-note" role="status">{tr("solver.luckUnsupported")}</p>;
    if (dataGap === "luckGreat") return <p className="dc-engine-note" role="status">{tr("solver.luckGreatUnsupported")}</p>;
    if (dataGap) {
      return (
        <div className="dc-engine-note" role="status">
          <Icon name="info" className="h-[18px] w-[18px] shrink-0" />
          <span className="dc-engine-note-text">{tr(dataGap === "missions" ? "solver.missionsUnavailable" : "solver.dataUpdating")}</span>
          <Button variant="text" size="small" onClick={solver.retry}>{tr("retry")}</Button>
        </div>
      );
    }
    if (runError) return <p className="dc-engine-note" role="alert">{runError}</p>;
    return null;
  }
  function toggle(values: string[], key: string, update: (value: string[]) => void) { update(values.includes(key) ? values.filter(value => value !== key) : [...values, key]); }
  return <ContentServerProvider server={server} servers={servers}><div className={`dw-workspace ${page === "box" ? "dw-collection" : "dw-deck"}`} data-testid="deck-workspace">
    <header className="dw-header">
      <div className="dw-header-copy">
        <h1>{tr(page === "box" ? "boxTitle" : "title")}{page === "deck" && <span className="dw-beta">{tr("beta")}</span>}</h1>
        <p>{page === "box" ? tr("boxDescription") : composer("workspaceNote")}</p>
        {page === "deck" && (
          <p className="dw-sources">
            <a href={href("deck-guide")}>{tr("deckGuide.link")}</a> · {tr("sources.label")}:{" "}
            {DECK_SOURCES.map((source, index) => (
              <Fragment key={source.key}>
                {index > 0 && " · "}
                <a href={source.url} target="_blank" rel="noopener noreferrer">{tr(`sources.${source.key}`)}</a>
              </Fragment>
            ))}
          </p>
        )}
      </div>
      <div className="dw-actions dw-header-actions">
        <div className={busy ? "pointer-events-none opacity-60" : undefined}>
          <GameServerSwitch locale={locale} value={server} onChange={pickServer} servers={servers} />
        </div>
        {page === "box" && (
          <Button variant="tonal" href={href("deck")} onClick={(event: MouseEvent<HTMLAnchorElement>) => changePage(event, "deck")}>
            {tr("goDeck")}
          </Button>
        )}
      </div>
    </header>
    <StarMoeBoxTokenNotice locale={locale} />
    {storage.error && (
      <div role="alert" className="dw-md3-alert">
        <Icon name="info" className="h-5 w-5 shrink-0" />
        <span>{tr(`storageErrors.${storage.error}`)}</span>
        <Button variant="text" size="small" disabled={busy || mode === "temporary"} onClick={() => void storage.reload()}>
          {tr("retry")}
        </Button>
      </div>
    )}
    {page === "box" && <CloudBoxPanel locale={locale} server={server} box={stored} busy={busy} returnTo={returnTo} />}
    {page === "box" ? <section className={`cb-workspace dw-box-main ${draggingScreenshots ? " is-dragging-screenshots" : ""}`} onDragOver={event => {
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
      {backupError && (
        <div className="dw-md3-alert" role="alert">
          <Icon name="info" className="h-5 w-5 shrink-0" />
          <span>{tr("importError")}</span>
        </div>
      )}
      <p className="cb-input-note">{linked ? <span>{tr("gameSave.vipNote")}</span> : <>{collection("pasteDropHint")}<span>{collection("saveGrowth")}</span></>}</p>
    </section> : <DeckComposer
        labels={{ setup: composer("setupTitle"), collection: composer("collectionTitle"), goal: composer("goalTitle"), conditions: composer("conditionsTitle"), results: composer("resultsTitle") }}
        goalGroups={[
          { id: "event", title: event ? tr("goalGroups.event", { name: event.name, end: formatEnd(event.endAt) }) : tr("goalGroups.eventNone"),
            goals: event ? [...EVENT_GOALS.filter(value => !isEventPayoffGoal(value)).map(value => goalCard(value)), rewardsCard()] : [] },
          { id: "everyday", title: tr("goalGroups.everyday"), goals: EVERYDAY_GOALS.map(value => goalCard(value)) },
        ]}
        selectedGoal={isEventPayoffGoal(goal) ? REWARDS_CARD : goal} onGoalChange={selectGoal}
        collection={<>{ownedMembers.length > 0 ? <div className="dc-pool">
          <div className="dc-pool-counts">
            <span className="dc-pool-stat"><strong>{ownedMembers.length}</strong><span>{tr("member")}</span></span>
            <span className="dc-pool-stat"><strong>{ownedSnaps.length}</strong><span>{tr("snap")}</span></span>
          </div>
          <p className="dc-pool-source" data-source={linked ? "game-save" : "box"}>
            <CollectionIcon name={linked ? "game" : "image"} />
            <span>{[tr(linked ? "gameSave.sourceSave" : "gameSave.sourceBox"),
              ...(stored?.save ? [linkedSave.state.status === "ready" ? tr("gameSave.uploadedAt", { date: new Date(stored.save.uploadedAt).toLocaleDateString(locale) })
                : tr(linkedSave.state.status === "loading" ? "gameSave.loadingShort" : "gameSave.unavailableShort")] : []), tr(mode)].join(" · ")}</span>
          </p>
          <Button className="dc-pool-manage" variant="tonal" size="small" disabled={busy} onClick={() => setManagement(true)}>{tr("manage")}</Button>
        </div> : <div className="dc-pool" data-empty="true">
          <p className="dc-pool-empty">{linked ? tr(linkedSave.state.status === "loading" ? "gameSave.loading" : "solver.saveNotReady") : tr("solver.emptyBox")}</p>
          <div className="dc-pool-actions">{linked ? <Button variant="tonal" size="small" disabled={busy} onClick={() => setManagement(true)}>{tr("manage")}</Button> : <>
            <Button size="small" disabled={busy} onClick={openSavePicker} startIcon={<CollectionIcon name="game" />}>{tr("gameSave.importAction")}</Button>
            <Button variant="tonal" size="small" disabled={busy} onClick={openScreenshotImport} startIcon={<CollectionIcon name="image" />}>{tr("screenshotImport")}</Button>
            <Button variant="text" size="small" disabled={busy} onClick={() => box ? setManagement(true) : setSetup(true)}>{box ? tr("manage") : composer("manualShort")}</Button></>}</div>
        </div>}
          <HaneokaExport locale={locale} box={box} disabled={busy || !box?.cards.length || linked && linkedSave.state.status !== "ready"} />
        </>}
        conditions={<>
          {canAllSongs && (
            <DeckSwitchRow
              label={tr("solver.allSongs")}
              checked={!!effectiveInput.allSongs}
              onChange={(checked) => updateGoal({ allSongs: checked })}
            />
          )}
          {canAllSongs && effectiveInput.allSongs && supportsCrossSongMean(effectiveInput) && capabilities?.crossSongMean && (
            <DeckSegmented
              label={tr("solver.multiSongModeLabel")}
              value={effectiveInput.multiSongMode ?? "individual"}
              onChange={(multiSongMode) => updateGoal({ multiSongMode })}
              hint={tr((effectiveInput.multiSongMode ?? "individual") === "mean" ? "solver.multiSongMeanNote" : "solver.multiSongIndividualNote")}
              options={[
                { value: "individual" as const, label: tr("solver.multiSongIndividual") },
                { value: "mean" as const, label: tr("solver.multiSongMean") },
              ]}
            />
          )}
          {isEventPayoffGoal(goal) ? (
            <DeckSelect
              label={tr("venue")}
              value={goalInput.venue}
              onChange={(venue) => updateGoal({ venue })}
              options={goalVenues(goal).map((value) => ({
                value: value as DeckVenue,
                label: tr(`venues.${value}`),
                disabled: !!capabilities && !computes(capabilities, { goal, venue: value }),
              }))}
            />
          ) : null}
          {solverGoalKind(effectiveInput) === "arenaLive" ? (
            useModernArena && arenaCatalog && resolvedArena ? <DeckArenaControls
              locale={locale}
              catalog={arenaCatalog}
              period={resolvedArena.period}
              rule={resolvedArena.rule}
              ruleSource={arenaRuleSource}
              leagueId={validLeagueId}
              customBandId={arenaCustomBandId}
              customMusicType={arenaCustomMusicType}
              customMissions={arenaCustomMissions}
              mode={effectiveArenaMode}
              canChooseMode={!isEventPayoffGoal(goal)}
              allSongs={!!effectiveInput.allSongs}
              entries={filteredArenaPool}
              eligibleSongs={arenaEligibleSongs}
              bandNames={bandNames}
              formatEnd={formatEnd}
              onRuleSourceChange={setUserArenaSource}
              onLeagueChange={setArenaLeagueId}
              onCustomBandChange={setArenaCustomBandId}
              onCustomMusicTypeChange={setArenaCustomMusicType}
              onCustomMissionChange={(index, mission) => setArenaCustomMissions(prev => {
                const next: [number, number, number] = [prev[0], prev[1], prev[2]];
                next[index] = mission;
                return next;
              })}
              onModeChange={nextMode => {
                setArenaMode(nextMode);
                if (nextMode === "shared") updateGoal({ allSongs: false, aggregation: "expected" });
              }}
              onEntriesChange={setArenaPool}
              onOpenSongPicker={() => setArenaPickerOpen(true)}
            />
            : (
              <DeckSelect
                label={tr("arenaSong")}
                disabled={!!effectiveInput.allSongs}
                value={goalInput.arenaMusicId === null ? "" : String(goalInput.arenaMusicId)}
                onChange={(raw) => updateGoal({ arenaMusicId: raw ? Number(raw) : null })}
                options={[
                  { value: "", label: tr(arenas.length ? "chooseArena" : "noArena") },
                  ...arenas.map((row) => ({
                    value: String(row.id),
                    label: songs.find((song) => song.id === row.musicId)?.title ?? String(row.musicId),
                  })),
                ]}
              />
            )
          ) : isChallengeInput(effectiveInput) ? <div className="dc-challenge-songs" role="group" aria-label={tr("challengeSong")}>
            {(event?.challengeMusics ?? []).map(row => {
              const music = songs.find(item => item.id === row.musicId);
              return <button type="button" key={row.id} className="dc-song-button md3-state" disabled={!!effectiveInput.allSongs} aria-pressed={goalInput.challengeMusicId === row.id} onClick={() => updateGoal({ challengeMusicId: row.id })}>
                {music ? <img className="dc-song-cover" src={music.jacketUrl} alt="" /> : <span className="dc-song-cover dc-song-cover--empty" aria-hidden="true" />}
                <span className="dc-song-summary"><strong>{music?.title ?? row.musicId}</strong></span></button>;
            })}</div>
            : (goal !== "power" || goalInput.powerSong) && <button type="button" className="dc-song-button md3-state" disabled={!!effectiveInput.allSongs} onClick={() => setSongPicker(true)} aria-haspopup="dialog">
              {selectedSong ? <img className="dc-song-cover" src={selectedSong.jacketUrl} alt="" /> : <span className="dc-song-cover dc-song-cover--empty" aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" width="22" height="22"><path d="M12 23V9l15-3v14M12 9l15-3M12 23c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Zm15-3c0 2-2 4-4 4s-4-1-4-3 2-4 4-4 4 1 4 3Z" /></svg></span>}
              <span className="dc-song-summary"><small>{tr("song")}</small><strong>{selectedSong?.title ?? composer("emptySong")}</strong></span>
              <Icon name="chevronRight" className="dc-song-chevron h-[18px] w-[18px]" />
            </button>}
          {goal !== "power" && (!(useModernArena && !effectiveInput.allSongs) || isEventPayoffGoal(goal)) && <div className="dc-field-pair">
            {!(useModernArena && !effectiveInput.allSongs) && (
              <DeckSelect
                label={tr("difficulty")}
                value={goalInput.difficulty}
                onChange={(difficulty) => updateGoal({ difficulty: difficulty as MusicDifficulty })}
                options={MUSIC_DIFFICULTIES.filter(
                  (value) => !selectedSong || selectedSong.difficulties.some((entry) => entry.difficulty === value),
                ).map((value) => ({ value, label: value.toUpperCase() }))}
              />
            )}
            {isEventPayoffGoal(goal) && (isChallengeInput(effectiveInput) ? (
              <DeckSelect
                label={tr("consumption")}
                value={goalInput.challengePoints}
                onChange={(challengePoints) => updateGoal({ challengePoints: challengePoints as ChallengePointCost })}
                options={CHALLENGE_POINT_COSTS.map((value) => ({
                  value,
                  label: tr("challengePoints", { n: value }),
                }))}
              />
            ) : (
              <DeckSelect
                label={tr("consumption")}
                value={goalInput.boosts}
                onChange={(boosts) => updateGoal({ boosts })}
                options={Array.from({ length: MAX_BOOST + 1 }, (_, value) => ({
                  value,
                  label: tr("boosts", { n: value }),
                }))}
              />
            ))}
          </div>}
          <DeckRewardMix locale={locale} input={effectiveInput} capabilities={capabilities} challengeSongs={challengeSongs}
            onChange={patch => { updateGoal(patch); if (patch.goal) safeSetLocalStorage(GOAL_STORAGE_KEY, patch.goal); }} />
          {!(useModernArena && effectiveArenaMode === "shared") && <DeckObjective locale={locale} input={effectiveInput} capabilities={capabilities} onChange={aggregation => updateGoal({ aggregation })} />}
          <DeckGoalConditions locale={locale} input={effectiveInput} capabilities={capabilities} onChange={updateGoal} />
          {goal === "power" && (
            <div className="dc-switch-group">
              <DeckSwitchRow
                label={tr("powerSong")}
                checked={goalInput.powerSong}
                onChange={(powerSong) => updateGoal({ powerSong })}
              />
              {event && (
                <DeckSwitchRow
                  label={tr("powerEvent")}
                  checked={goalInput.eventParameter}
                  onChange={(eventParameter) => updateGoal({ eventParameter })}
                />
              )}
            </div>
          )}
          {isNetworkInput(effectiveInput) && (!capabilities || capabilities.gekisouRank ? (
            <DeckSelect
              label={tr("gekisouRankLabel")}
              value={goalInput.gekisouRank ?? 1}
              onChange={(gekisouRank) => updateGoal({ gekisouRank })}
              options={[1, 2, 3, 4, 5].map((place) => ({
                value: place,
                label: tr("gekisouRankOption", { n: place }),
              }))}
            />
          ) : <p className="dc-field-hint">{tr("rankFixed")}</p>)}
          {readsAccuracy(effectiveInput) && (
            <details className="dc-play-style">
              <summary className="dc-play-style-summary md3-state">
                <span className="dc-play-style-title">
                  <Icon name="tune" className="h-[18px] w-[18px] text-on-surface-variant" />
                  <span>{composer("advanced")}</span>
                </span>
                <Icon name="chevronDown" className="dc-play-style-chevron h-[18px] w-[18px]" />
              </summary>
              <div className="dc-play-style-body">
                <div className="dc-slider-field">
                  <div className="dc-slider-head">
                    <span>{tr("greatRate", { n: effectiveInput.greatPercent })}</span>
                    <strong>{effectiveInput.greatPercent}%</strong>
                  </div>
                  <Slider
                    size="small"
                    min={0}
                    max={playsGekisou(effectiveInput) ? 100 - effectiveInput.justPercent : 100}
                    value={effectiveInput.greatPercent}
                    aria-label={tr("greatRate", { n: effectiveInput.greatPercent })}
                    onChange={(_, next) => updateGoal({ greatPercent: Array.isArray(next) ? next[0] ?? 0 : next })}
                  />
                </div>
                {playsGekisou(effectiveInput) && (
                  <div className="dc-slider-field">
                    <div className="dc-slider-head">
                      <span>{tr("justRate", { n: effectiveInput.justPercent })}</span>
                      <strong>{effectiveInput.justPercent}%</strong>
                    </div>
                    <Slider
                      size="small"
                      min={0}
                      max={100 - effectiveInput.greatPercent}
                      value={effectiveInput.justPercent}
                      aria-label={tr("justRate", { n: effectiveInput.justPercent })}
                      onChange={(_, next) => updateGoal({ justPercent: Array.isArray(next) ? next[0] ?? 0 : next })}
                    />
                  </div>
                )}
                {capabilities && (!capabilities.accuracy.great || playsGekisou(effectiveInput) && !capabilities.accuracy.just)
                  ? <p className="dc-field-hint">{tr("accuracyComing")}</p>
                  : <p className="dc-field-hint">{tr(playsGekisou(effectiveInput) ? "accuracyNoteGekisou" : "accuracyNote")}</p>}
                {isEventPayoffGoal(goal) && isNetworkInput(effectiveInput) && (
                  <DeckNumberField
                    label={tr("othersAverage")}
                    min={0}
                    inputMode="numeric"
                    placeholder={tr("othersAverageSame")}
                    value={goalInput.othersAverageScore}
                    onChange={(othersAverageScore) => updateGoal({ othersAverageScore })}
                  />
                )}
              </div>
            </details>
          )}
          <div className="dc-condition-actions">
            <Button
              variant={activeConstraintCount > 0 ? "tonal" : "outlined"}
              size="small"
              disabled={!box || busy}
              onClick={openConstraints}
              startIcon={<Icon name="filter" className="h-[18px] w-[18px]" />}
            >
              {composer("searchConstraints")}
              {activeConstraintCount > 0 && <span className="dc-count">{activeConstraintCount}</span>}
            </Button>
            <Button
              variant="outlined"
              size="small"
              disabled={!box || busy}
              onClick={() => setPlayerSettings(true)}
              startIcon={<Icon name="tune" className="h-[18px] w-[18px]" />}
            >
              {composer("playerBonuses")}
            </Button>
          </div>
        </>}
        run={<>
          {engineNotice()}
          {job.status === "running" ? (
            <Button
              className="dc-run-button"
              variant="tonal"
              size="large"
              fullWidth
              startIcon={<Icon name="pause" className="h-[18px] w-[18px]" />}
              onClick={solver.stop}
            >
              {tr("solver.stop")}
            </Button>
          ) : (
            <Button
              className="dc-run-button"
              variant="filled"
              size="large"
              fullWidth
              startIcon={<Icon name="play" className="h-[18px] w-[18px]" />}
              disabled={busy || !ownedMembers.length || !canRun}
              onClick={runSolver}
            >
              {tr(job.status === "idle" ? "solver.start" : "solver.rerun")}
            </Button>
          )}
          {capabilities?.resume && job.status === "done" && job.answer.status === "ok" && job.answer.result && !job.answer.result.optimality.proven && !stale && (
            <Button variant="text" fullWidth disabled={busy || !canRun} onClick={solver.resume}>{tr("solver.resumeSearch")}</Button>
          )}
          {job.status !== "running" && (runBlocker || blocker) && <small className="dc-blocker">{runBlocker || blocker}</small>}
        </>}
        results={<div ref={teamPanel} className="dc-team-body">
          {job.status !== "idle" ? <DeckResult locale={locale} job={job} goal={goal} rateBasis={rateBasis} stale={stale} timeLimit={goalInput.timeLimit} box={box} catalog={catalog} linked={linked} busy={busy}
            onStop={solver.stop} onRerun={runSolver} songNames={Object.fromEntries([...songs.map(song => [song.id, song.title] as const), ...arenas.map(arena => [-arena.id, songs.find(song => song.id === arena.musicId)?.title ?? String(arena.musicId)] as const)])} onEditCard={setEditingCardKey} onPlayer={() => setPlayerSettings(true)} onAnswerAll={(keys, name, value) => void answerAll(keys, name, value)} />
          : <div className="dc-empty-team"><div className="dc-empty-slots" aria-hidden="true">{Array.from({ length: 5 }, (_, index) => <span key={index} className={index === 2 ? "is-leader" : ""} />)}</div>
            <h3>{composer(ownedMembers.length ? "readyTitle" : "emptyTitle")}</h3><p>{composer(ownedMembers.length ? "readyDescription" : "emptyDescription")}</p></div>}
        </div>}
      />}
    <Modal historyNavigation={false} isOpen={setup} onClose={() => setSetup(false)} title={tr(box ? "storageChoice" : "createBox")} closeLabel={tr("close")}>
      <div className="dw-md3-dialog">
        <p className="dw-dialog-lead">{tr("storagePrompt")}</p>
        <div className="dw-storage-options">
          {(["local", "temporary"] as const).map((value) => (
            <button
              type="button"
              key={value}
              aria-pressed={choice === value}
              className={`dw-storage-card md3-state ${choice === value ? "is-selected" : ""}`.trim()}
              onClick={() => setChoice(value)}
            >
              <strong>{tr(value)}</strong>
              <span>{tr(value === "local" ? "localNote" : "temporaryNote")}</span>
            </button>
          ))}
        </div>
        <p className="dc-field-hint">{tr("cloud.storageNote")}</p>
        {storage.error && (
          <div className="dw-md3-alert" role="alert">
            <Icon name="info" className="h-5 w-5 shrink-0" />
            <span>{tr(`storageErrors.${storage.error}`)}</span>
          </div>
        )}
        <div className="dw-dialog-actions">
          <Button variant="text" onClick={() => setSetup(false)}>{tr("close")}</Button>
          <Button
            variant="filled"
            disabled={busy}
            onClick={async () => {
              if (await storage.start(choice)) {
                setSetup(false);
                if (page === "deck") setManagement(true);
              }
            }}
          >
            {tr(box ? "save" : "continue")}
          </Button>
        </div>
      </div>
    </Modal>
    <Modal historyNavigation={false} isOpen={management && box !== null} onClose={() => setManagement(false)} title={tr("boxTitle")} closeLabel={tr("close")} size="xl">{stored && box && <CloudBoxPanel locale={locale} server={server} box={stored} busy={busy} returnTo={returnTo} />}{stored && box && <BoxManager key={`${server}:${stored.id}`} locale={locale} box={stored} view={linked ? box : undefined} notice={saveNotice} mode={mode} busy={busy} commit={storage.commit} playerCatalogue={playerCatalogue} onRecognize={openScreenshotImport} onImportSave={openSavePicker} onGuide={openGuide} onStorage={() => { setManagement(false); openStorage(); }} onDelete={() => { setManagement(false); setDeleting(true); }} {...catalog} />}</Modal>
    {box && <BoxCardEditor locale={locale} box={box} cardKey={editingCardKey} busy={busy} commit={storage.commit} onClose={() => setEditingCardKey(null)} readOnly={linked} {...catalog} />}
    <MusicSelectDialog key={`songs:${server}`} locale={locale} songs={songs} open={songPicker} onClose={() => setSongPicker(false)}
      current={selectedSong ? { musicId: selectedSong.id, difficulty: goalInput.difficulty } : null} sortPage="deck-song"
      onSelect={selection => updateGoal({ musicId: selection.song.id, difficulty: selection.difficulty })} />
    <MusicSelectDialog key={`arena-songs:${server}:${activeArenaBandId ?? 0}`} locale={locale} songs={arenaEligibleSongs} open={arenaPickerOpen} onClose={() => setArenaPickerOpen(false)}
      current={filteredArenaPool[0] ?? null} sortPage="deck-arena-song"
      onSelect={selection => {
        setArenaPool(prev => {
          const entry: DeckArenaSongEntry = { musicId: selection.song.id, difficulty: selection.difficulty };
          if (isEventPayoffGoal(goal)) return [entry];
          if (prev.some(item => item.musicId === entry.musicId && item.difficulty === entry.difficulty)) return prev;
          const max = effectiveArenaMode === "shared" ? 5 : 20;
          return [...prev, entry].slice(0, max);
        });
      }} />
    <Modal historyNavigation={false} isOpen={playerSettings && box !== null} onClose={() => setPlayerSettings(false)} title={tr("playerTitle")} closeLabel={tr("close")} size="xl">
      {stored && <PlayerStateManager key={`${server}:${stored.id}`} locale={locale} box={stored} view={linked ? box ?? undefined : undefined} catalogue={playerCatalogue} busy={busy} commit={storage.commit} embedded />}
    </Modal>
    <ScreenshotImport locale={locale} server={server} source={recognition.context?.source} sourceIssue={recognition.issue} box={box} mode={mode} catalog={catalog} isOpen={importing} onClose={() => { setImporting(false); setPendingScreenshots([]); }} onSave={saveScreenshot} pendingFiles={pendingScreenshots} onPendingFilesConsumed={() => setPendingScreenshots([])} />
    <CardBoxGuide key={`guide:${server}`} locale={locale} members={members} snaps={snaps} isOpen={guideOpen} onClose={() => setGuideOpen(false)} onStartImport={openScreenshotImport} />
    <GameSavePicker locale={locale} server={server} isOpen={savePicker} onClose={() => setSavePicker(false)} list={saveList} busy={busy} onLink={pickGameSave} returnTo={returnTo} onScreenshot={openScreenshotImport} />
    <Modal historyNavigation={false} isOpen={constraintsOpen} onClose={() => setConstraintsOpen(false)} title={composer("constraintsTitle")} closeLabel={tr("close")} size="lg">
      <div className="dw-md3-dialog dc-options">
        <p className="dc-field-hint">{composer("constraintDescription")}</p>
        <DeckSwitchRow
          label={composer("noSnaps")}
          checked={noSnaps}
          onChange={setNoSnaps}
        />
        <div className="dc-constraint-toolbar">
          {ownedMembers.length > 0 && ownedSnaps.length > 0 && (
            <DeckSegmented
              size="small"
              fullWidth={false}
              ariaLabel={composer("constraintKind")}
              value={shownConstraintKind}
              onChange={setConstraintKind}
              options={(["member", "snap"] as const).map((kind) => ({
                value: kind,
                label: tr(kind),
              }))}
            />
          )}
          <DeckSegmented
            size="small"
            fullWidth={false}
            ariaLabel={composer("constraintsTitle")}
            value={constraintFilter}
            onChange={setConstraintFilter}
            options={(["all", "required", "excluded"] as const).map((value) => ({
              value,
              label:
                value === "all"
                  ? composer("constraintAll")
                  : value === "required"
                    ? `${composer("constraintRequired")}${requiredConstraintCount ? ` (${requiredConstraintCount})` : ""}`
                    : `${composer("constraintExcluded")}${excluded.length ? ` (${excluded.length})` : ""}`,
            }))}
          />
        </div>
        <CardFilters locale={locale} kind={shownConstraintKind === "member" ? "member" : "support"} controller={constraintCards} variant="card" searchPlaceholder={tr("searchCards")} />
        <div className="dc-constraint-list">
          {constraintCards.sorted.map(({ card }) => {
            const isLeader = leaderKey === card.key;
            const isRequired = required.includes(card.key);
            const isExcluded = excluded.includes(card.key);
            const memberRequiredCount = required.filter((key) => box?.cards.find((other) => other.key === key)?.kind === card.kind).length;
            return (
              <div key={card.key} className="dc-constraint-card">
                <BoxArtwork card={card} catalog={catalog} locale={locale} square />
                <div className="dc-constraint-info">
                  <strong>{cardTitle(card, catalog)}</strong>
                  <small>{cardSubtitle(card, catalog)}</small>
                </div>
                <div className="dc-constraint-actions">
                  {card.kind === "member" && (
                    <button
                      type="button"
                      className="md3-filter-chip md3-state dc-constraint-chip"
                      aria-pressed={isLeader}
                      disabled={isExcluded}
                      onClick={() => setLeaderKey((prev) => (prev === card.key ? null : card.key))}
                    >
                      {isLeader && <Icon name="check" className="h-4 w-4" />}
                      <span>{composer("leaderShort")}</span>
                    </button>
                  )}
                  {card.kind === "member" && (
                    <button
                      type="button"
                      className="md3-filter-chip md3-state dc-constraint-chip"
                      aria-pressed={isRequired}
                      disabled={isExcluded || (memberRequiredCount >= 5 && !isRequired)}
                      onClick={() => toggle(required, card.key, setRequired)}
                    >
                      {isRequired && <Icon name="check" className="h-4 w-4" />}
                      <span>{tr("required")}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="md3-filter-chip md3-state dc-constraint-chip dc-constraint-chip--exclude"
                    aria-pressed={isExcluded}
                    disabled={isRequired || isLeader}
                    onClick={() => toggle(excluded, card.key, setExcluded)}
                  >
                    {isExcluded && <Icon name="close" className="h-4 w-4" />}
                    <span>{tr("excluded")}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        {!constraintCards.sorted.length && <p className="dc-field-hint">{tr("emptyCards")}</p>}
        <div className="dw-dialog-actions">
          {(activeConstraintCount > 0) && (
            <Button
              variant="text"
              onClick={() => {
                setLeaderKey(null);
                setRequired([]);
                setExcluded([]);
                setNoSnaps(false);
              }}
            >
              {t(locale, "filters.reset")}
            </Button>
          )}
          <Button variant="filled" onClick={() => setConstraintsOpen(false)}>{tr("done")}</Button>
        </div>
      </div>
    </Modal>
    <Modal historyNavigation={false} isOpen={deleting} onClose={() => setDeleting(false)} title={tr("deleteBox")} closeLabel={tr("close")}>
      <div className="dw-md3-dialog">
        <p className="dw-dialog-lead">{tr("deleteNote")}</p>
        <div className="dw-dialog-actions">
          <Button variant="text" onClick={() => setDeleting(false)}>{tr("close")}</Button>
          <Button
            variant="filled"
            color="error"
            disabled={busy}
            onClick={async () => {
              if (await storage.remove()) setDeleting(false);
            }}
          >
            {tr("confirmDelete")}
          </Button>
        </div>
      </div>
    </Modal>
  </div></ContentServerProvider>;
}
export default withMd3(DeckWorkspace);

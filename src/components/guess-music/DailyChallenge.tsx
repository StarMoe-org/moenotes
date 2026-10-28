"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Button from "@mui/material/Button";
import { accountLoginUrl } from "@/config/account";
import type { AppLocale } from "@/config/locales";
import { isGameServer, type GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { refreshAccount } from "@/lib/account/client";
import { useAccount } from "@/lib/account/use-account";
import { moveReleaseUrls } from "@/lib/assets/release";
import {
  DailyApiError,
  classifyDailyError,
  clearStoredRun,
  createDailyApi,
  formatCountdown,
  isAbortError,
  loadStoredRun,
  msUntil,
  pruneStoredRuns,
  saveStoredRun,
  type DailyErrorKind,
  type DailyFinishResult,
  type DailyInfo,
  type DailyMode,
  type DailySession,
  type DailyTierId,
  type DailyTierInfo,
  type DailyTierStatus,
  type StoredDailyRun,
} from "@/lib/guess-music/daily-client";
import { buildSongLibrary } from "@/lib/guess-music/pool";
import { MAX_STRIKES } from "@/lib/guess-music/scoring";
import type { GuessSong } from "@/lib/guess-music/songs";
import { listForServer, type ServerFaceted } from "@/lib/servers/facets";
import DailyLeaderboard from "./DailyLeaderboard";
import DailyResults from "./DailyResults";
import DailyRound from "./DailyRound";
import GuessIcon from "./GuessIcon";

/** Whether this visitor can play ranked runs right now. */
type RankedAccess = "loading" | "ready" | "login" | "unavailable";

type View =
  | { kind: "overview" }
  | { kind: "playing"; run: StoredDailyRun }
  | { kind: "finishing"; run: StoredDailyRun }
  | { kind: "result"; result: DailyFinishResult; alreadyPlayed: boolean };

function freshRun(session: DailySession): StoredDailyRun {
  return {
    date: session.date,
    tier: session.tier,
    mode: session.mode,
    sessionId: session.sessionId,
    ranked: session.ranked,
    rounds: session.rounds,
    round: session.resumeRound,
    totalScore: session.totalScore,
    combo: session.combo,
    answered: [],
    wrongGuesses: [],
  };
}

function signIn(locale: AppLocale): void {
  window.location.assign(accountLoginUrl(locale, window.location.href));
}

export interface DailyChallengeProps {
  locale: AppLocale;
  songs: ServerFaceted<GuessSong>[];
  /** A run is on screen: the page hides its tabs, so the clip and the timer never carry on behind another tab. */
  onPlayingChange: (playing: boolean) => void;
  /** No daily challenge here: offer free play instead. */
  onPlayFree: () => void;
}

/**
 * The daily challenge: today's three tiers, each with a ranked run (StarMoe Passport, once a day, on the leaderboard)
 * and an unranked practice run on another question set, plus the leaderboards. The questions, clips and scores live
 * in starmoe-api; this page only plays them.
 */
export default function DailyChallenge({ locale, songs, onPlayingChange, onPlayFree }: DailyChallengeProps) {
  const tr = useCallback((key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params), [locale]);
  const account = useAccount();
  // The session cookie rides along; a 401 means it is gone, and the account is asked again.
  const api = useMemo(() => createDailyApi({ onSignedOut: () => void refreshAccount() }), []);

  const [info, setInfo] = useState<DailyInfo | null>(null);
  const [infoError, setInfoError] = useState<DailyErrorKind | null>(null);
  const [infoAttempt, setInfoAttempt] = useState(0);
  const [view, setView] = useState<View>({ kind: "overview" });
  const [pending, setPending] = useState<{ tier: DailyTierId; mode: DailyMode } | null>(null);
  const [tierError, setTierError] = useState<{ tier: DailyTierId; text: string } | null>(null);
  const [finishError, setFinishError] = useState<DailyErrorKind | null>(null);
  const [boardTier, setBoardTier] = useState<DailyTierId>("easy");
  const [boardKey, setBoardKey] = useState(0);
  // Bumped whenever this tab's stored runs change, so the tier cards read them again.
  const [, setStoreVersion] = useState(0);
  const hasInfoRef = useRef(false);
  const resetForRef = useRef<string | null>(null);
  // The run on screen, for callbacks that must not change with every answer.
  const runRef = useRef<StoredDailyRun | null>(null);

  const playing = view.kind === "playing";
  useEffect(() => onPlayingChange(playing), [playing, onPlayingChange]);
  useEffect(() => () => onPlayingChange(false), [onPlayingChange]);

  // "me" follows the session cookie: ask again once the account is known, and whenever it changes.
  const accountKey = account?.status === "signed-in" ? `in:${account.user.id ?? account.user.name ?? ""}` : (account?.status ?? "loading");
  useEffect(() => {
    const controller = new AbortController();
    api
      .getInfo(controller.signal)
      .then((data) => {
        hasInfoRef.current = true;
        setInfo(data);
        setInfoError(data.ready ? null : "notReady");
        pruneStoredRuns(data.date);
      })
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        // A failed background refresh keeps what is on screen.
        if (!hasInfoRef.current) setInfoError(classifyDailyError(error));
      });
    return () => controller.abort();
  }, [api, infoAttempt, accountKey]);

  // The questions come from the server's game data: show and match them with that server's songs.
  const server: GameServer = info && isGameServer(info.server) ? info.server : "tw";
  const library = useMemo(() => {
    if (!info) return null;
    const items = listForServer(songs, server).map((song) => moveReleaseUrls(song, server));
    return buildSongLibrary(items, Date.now());
  }, [songs, server, info]);

  const ranked: RankedAccess = !info || account === null ? "loading" : !info.authEnabled || account.status === "unavailable" ? "unavailable" : account.status === "signed-in" ? "ready" : "login";
  const errorText = useCallback((kind: DailyErrorKind) => tr(`daily.errors.${kind}`), [tr]);
  const today = info?.date ?? "";

  const saveRun = useCallback((run: StoredDailyRun) => {
    runRef.current = run;
    saveStoredRun(run);
    setView((current) => (current.kind === "playing" ? { kind: "playing", run } : current));
  }, []);

  const dropRun = useCallback((run: Pick<StoredDailyRun, "date" | "tier" | "mode">) => {
    clearStoredRun(run.date, run.tier, run.mode);
    setStoreVersion((n) => n + 1);
  }, []);

  const showResult = useCallback(
    (result: DailyFinishResult, alreadyPlayed: boolean) => {
      dropRun(result);
      setView({ kind: "result", result, alreadyPlayed });
      setBoardTier(result.tier);
      if (result.ranked) {
        setBoardKey((n) => n + 1);
        setInfoAttempt((n) => n + 1);
      }
      window.scrollTo({ top: 0 });
    },
    [dropRun],
  );

  const finish = useCallback(
    async (run: StoredDailyRun) => {
      setView({ kind: "finishing", run });
      setFinishError(null);
      try {
        showResult(await api.finish(run.sessionId), false);
      } catch (error) {
        const kind = classifyDailyError(error);
        if (kind === "sessionExpired") {
          dropRun(run);
          setTierError({ tier: run.tier, text: errorText(kind) });
          setView({ kind: "overview" });
          return;
        }
        setFinishError(kind);
      }
    },
    [api, dropRun, errorText, showResult],
  );

  const play = useCallback(
    (run: StoredDailyRun) => {
      runRef.current = run;
      saveStoredRun(run);
      setStoreVersion((n) => n + 1);
      if (run.round >= run.rounds) void finish(run);
      else {
        setView({ kind: "playing", run });
        window.scrollTo({ top: 0 });
      }
    },
    [finish],
  );

  const start = useCallback(
    async (tier: DailyTierId, mode: DailyMode, fresh = false) => {
      if (!info || pending) return;
      if (mode === "ranked" && ranked === "login") {
        signIn(locale);
        return;
      }
      setTierError(null);
      const saved = loadStoredRun(info.date, tier, mode);
      // A practice run kept in this tab resumes without asking the server.
      if (mode === "practice" && saved && !fresh) {
        play(saved);
        return;
      }
      setPending({ tier, mode });
      try {
        const session = await api.createSession(tier, mode);
        let run = freshRun(session);
        if (saved && saved.sessionId === session.sessionId) {
          const sameRound = saved.round === session.resumeRound;
          run = {
            ...saved,
            rounds: session.rounds,
            round: session.resumeRound,
            totalScore: session.totalScore,
            combo: session.combo,
            wrongGuesses: sameRound ? saved.wrongGuesses : [],
            timerStartedAt: sameRound ? saved.timerStartedAt : undefined,
          };
        }
        play(run);
      } catch (error) {
        if (error instanceof DailyApiError && error.code === "already_played" && error.result) {
          showResult(error.result, true);
          return;
        }
        const kind = classifyDailyError(error);
        if (kind === "tierUnavailable") {
          // The instrumentals went away since the page loaded: the card says so itself.
          setInfo((current) => current && { ...current, tiers: current.tiers.map((item) => (item.id === tier ? { ...item, available: false } : item)) });
          return;
        }
        if (kind === "signedOut" || kind === "rankedUnavailable") setInfoAttempt((n) => n + 1);
        setTierError({ tier, text: errorText(kind) });
      } finally {
        setPending(null);
      }
    },
    [api, errorText, info, locale, pending, play, ranked, showResult],
  );

  const onFatal = useCallback(
    (kind: DailyErrorKind) => {
      const run = runRef.current;
      if (run) {
        dropRun(run);
        setTierError({ tier: run.tier, text: errorText(kind) });
      }
      setView({ kind: "overview" });
      setInfoAttempt((n) => n + 1);
    },
    [dropRun, errorText],
  );

  const onDone = useCallback(() => {
    const run = runRef.current;
    if (run) void finish(run);
  }, [finish]);

  const backToOverview = useCallback(() => {
    setView({ kind: "overview" });
    setStoreVersion((n) => n + 1);
    setInfoAttempt((n) => n + 1);
  }, []);

  const onReset = useCallback(() => {
    if (!info || resetForRef.current === info.nextResetAt) return;
    resetForRef.current = info.nextResetAt;
    setInfoAttempt((n) => n + 1);
  }, [info]);

  const retryInfo = () => {
    setInfoError(null);
    setInfo(null);
    hasInfoRef.current = false;
    setInfoAttempt((n) => n + 1);
  };

  if (!info && !infoError) return <StatePanel busy text={tr("daily.loading")} />;
  if (infoError || !info) {
    const kind = infoError ?? "server";
    return (
      <StatePanel
        title={tr(kind === "notReady" ? "daily.errors.notReadyTitle" : kind === "unavailable" ? "daily.errors.unavailableTitle" : "daily.errors.loadFailed")}
        text={errorText(kind)}
        actions={
          <>
            <Button variant="outlined" onClick={onPlayFree} startIcon={<GuessIcon name="tune" />}>
              {tr("daily.playFree")}
            </Button>
            <Button onClick={retryInfo} startIcon={<GuessIcon name="refresh" />}>
              {tr("daily.retry")}
            </Button>
          </>
        }
      />
    );
  }

  const leaderboard = <DailyLeaderboard locale={locale} api={api} today={info.date} tiers={info.tiers.map((tier) => tier.id)} tier={boardTier} onTierChange={setBoardTier} refreshKey={boardKey} canRank={ranked === "ready" || ranked === "login"} />;

  if (view.kind === "playing") {
    const tier = info.tiers.find((item) => item.id === view.run.tier);
    if (!library || !tier) return <StatePanel busy text={tr("daily.loading")} />;
    return (
      <DailyRound
        key={view.run.sessionId}
        locale={locale}
        api={api}
        tier={tier}
        run={view.run}
        library={library}
        onRunChange={saveRun}
        onDone={onDone}
        onFatal={onFatal}
        onExit={backToOverview}
      />
    );
  }

  if (view.kind === "finishing") {
    if (!finishError) return <StatePanel busy text={tr("daily.finishing")} />;
    return (
      <StatePanel
        title={tr("daily.errors.finishFailed")}
        text={errorText(finishError)}
        actions={
          <Button onClick={() => void finish(view.run)} startIcon={<GuessIcon name="refresh" />}>
            {tr("daily.retry")}
          </Button>
        }
      />
    );
  }

  if (view.kind === "result") {
    const { result } = view;
    return (
      <div className="gm-stack" style={{ gap: 16 }}>
        {library && (
          <DailyResults
            locale={locale}
            result={result}
            library={library}
            alreadyPlayed={view.alreadyPlayed}
            onBack={backToOverview}
            onPlayAgain={result.ranked ? undefined : () => void start(result.tier, "practice", true)}
          />
        )}
        {leaderboard}
      </div>
    );
  }

  // Practice runs kept in this tab (read on every render: three small session storage reads).
  const practiceRound = (tier: DailyTierId) => {
    const saved = loadStoredRun(today, tier, "practice");
    return saved ? Math.min(saved.round, saved.rounds - 1) : null;
  };
  const playerName = account?.status === "signed-in" ? (account.user.name ?? account.user.username ?? "") : "";

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <InfoCard locale={locale} info={info} ranked={ranked} playerName={playerName} onReset={onReset} />
      <div className="gm-tiers">
        {info.tiers.map((tier) => (
          <TierCard
            key={tier.id}
            locale={locale}
            tier={tier}
            ranked={ranked}
            status={info.me?.tiers[tier.id]}
            practiceRound={practiceRound(tier.id)}
            pending={pending?.tier === tier.id ? pending.mode : null}
            busy={pending !== null}
            error={tierError?.tier === tier.id ? tierError.text : null}
            onStart={(mode, fresh) => void start(tier.id, mode, fresh)}
          />
        ))}
      </div>
      {leaderboard}
    </div>
  );
}

function StatePanel({ busy, title, text, actions }: { busy?: boolean; title?: string; text: string; actions?: ReactNode }) {
  return (
    <section className="gm-panel gm-state" role={busy ? undefined : "alert"}>
      {busy ? <span className="gm-spinner" role="img" aria-label={text} /> : <GuessIcon name="warning" size={28} className="gm-bad" />}
      {title && <h2 className="gm-panel-title">{title}</h2>}
      <p className={busy ? "gm-muted" : "gm-state-text"}>{text}</p>
      {actions && <div className="gm-row" style={{ justifyContent: "center" }}>{actions}</div>}
    </section>
  );
}

function InfoCard({ locale, info, ranked, playerName, onReset }: { locale: AppLocale; info: DailyInfo; ranked: RankedAccess; playerName: string; onReset: () => void }) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const [left, setLeft] = useState(() => msUntil(info.nextResetAt));
  useEffect(() => {
    const tick = () => {
      const ms = msUntil(info.nextResetAt);
      setLeft(ms);
      if (ms <= 0) onReset();
    };
    tick();
    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [info.nextResetAt, onReset]);
  const first = info.tiers[0];
  const vocalTier = info.tiers.find((tier) => tier.vocalRemoval && tier.available);

  return (
    <section className="gm-panel gm-stack" style={{ gap: 14 }}>
      <div className="gm-between">
        <h2 className="gm-panel-title gm-row" style={{ gap: 8 }}>
          <GuessIcon name="calendar" size={20} />
          {tr("daily.info.title", { date: info.date })}
        </h2>
        <span className="gm-chip gm-num">
          <GuessIcon name="clock" size={14} />
          {tr("daily.info.resetIn", { time: formatCountdown(left) })}
        </span>
      </div>
      <p className="gm-muted">{tr("daily.info.summary", { tiers: info.tiers.length, rounds: first?.rounds ?? 20 })}</p>
      <ul className="gm-rules">
        <li>{tr("daily.info.rules.time", { seconds: first?.timeLimitSeconds ?? 45 })}</li>
        <li>{tr("daily.info.rules.attempts", { strikes: MAX_STRIKES })}</li>
        <li>{tr("daily.info.rules.score")}</li>
        {vocalTier && <li>{tr("daily.info.rules.vocal", { tier: tr(`daily.tiers.${vocalTier.id}`) })}</li>}
      </ul>
      <div className="gm-grid-2 gm-modes">
        <div>
          <h3 className="gm-label gm-row" style={{ gap: 6 }}>
            <GuessIcon name="trophy" size={16} />
            {tr("daily.info.rankedTitle")}
          </h3>
          <p className="gm-hint">{tr("daily.info.ranked")}</p>
        </div>
        <div>
          <h3 className="gm-label gm-row" style={{ gap: 6 }}>
            <GuessIcon name="practice" size={16} />
            {tr("daily.info.practiceTitle")}
          </h3>
          <p className="gm-hint">{tr("daily.info.practice")}</p>
        </div>
      </div>
      {ranked !== "loading" && (
        <div className="gm-account">
          <span>{ranked === "ready" ? (playerName ? tr("daily.info.signedIn", { name: playerName }) : tr("daily.info.signedInAnonymous")) : ranked === "login" ? tr("daily.info.signedOut") : tr("daily.info.rankedOff")}</span>
          {ranked === "login" && (
            <Button onClick={() => signIn(locale)} startIcon={<GuessIcon name="login" />}>
              {tr("daily.info.signIn")}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

interface TierCardProps {
  locale: AppLocale;
  tier: DailyTierInfo;
  ranked: RankedAccess;
  status: DailyTierStatus | undefined;
  /** The round a practice run kept in this tab is on, or null. */
  practiceRound: number | null;
  pending: DailyMode | null;
  busy: boolean;
  error: string | null;
  onStart: (mode: DailyMode, fresh?: boolean) => void;
}

function TierCard({ locale, tier, ranked, status, practiceRound, pending, busy, error, onStart }: TierCardProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const mode = tier.answerMode === "choice" ? tr("setup.optionCount", { count: tier.optionCount ?? 6 }) : tr(`setup.modes.${tier.answerMode}`);
  const finished = status?.status === "finished";
  const inProgress = status?.status === "in_progress";
  const resumeRound = (status?.resumeRound ?? 0) + 1;

  const statusLine = finished
    ? [tr("daily.tier.statusFinished"), status?.score !== undefined ? tr("daily.tier.statusScore", { score: status.score }) : "", status?.rank ? tr("daily.tier.statusRank", { rank: status.rank }) : ""].filter(Boolean).join(" · ")
    : inProgress
      ? tr("daily.tier.statusInProgress", { round: resumeRound })
      : tr("daily.tier.statusNone");

  const rankedLabel =
    pending === "ranked"
      ? tr("daily.tier.starting")
      : ranked === "login"
        ? tr("daily.tier.rankedLogin")
        : ranked === "unavailable"
          ? tr("daily.tier.rankedUnavailable")
          : finished
            ? tr("daily.tier.rankedView")
            : inProgress
              ? tr("daily.tier.rankedResume", { round: resumeRound })
              : tr("daily.tier.ranked");
  const practiceLabel = pending === "practice" ? tr("daily.tier.starting") : practiceRound !== null ? tr("daily.tier.practiceResume", { round: practiceRound + 1 }) : tr("daily.tier.practice");

  return (
    <article className="gm-panel gm-tier" aria-labelledby={`gm-tier-${tier.id}`}>
      <div className="gm-between">
        <h3 id={`gm-tier-${tier.id}`} className="gm-tier-name">{tr(`daily.tiers.${tier.id}`)}</h3>
      </div>
      <div className="gm-row" style={{ gap: 6 }}>
        <span className="gm-chip">{tr("setup.seconds", { seconds: tier.clipSeconds })}</span>
        <span className="gm-chip">{mode}</span>
        <span className="gm-chip">{tr("setup.roundCount", { count: tier.rounds })}</span>
        {tier.vocalRemoval && <span className="gm-chip">{tr("daily.tier.vocalRemoval")}</span>}
      </div>
      {!tier.available ? (
        <p className="gm-hint">{tr("daily.tier.unavailable")}</p>
      ) : (
        <>
          {ranked === "ready" && <p className="gm-tier-status">{statusLine}</p>}
          <div className="gm-tier-actions">
            <Button
              variant={ranked === "unavailable" ? "outlined" : "filled"}
              disabled={busy || ranked === "loading" || ranked === "unavailable"}
              onClick={() => onStart("ranked")}
              startIcon={<GuessIcon name={ranked === "login" ? "login" : "trophy"} />}
            >
              {rankedLabel}
            </Button>
            <Button variant="outlined" disabled={busy} onClick={() => onStart("practice")} startIcon={<GuessIcon name="practice" />}>
              {practiceLabel}
            </Button>
            {practiceRound !== null && pending === null && (
              <Button variant="text" disabled={busy} onClick={() => onStart("practice", true)} startIcon={<GuessIcon name="refresh" />}>
                {tr("daily.tier.practiceRestart")}
              </Button>
            )}
          </div>
        </>
      )}
      {error && <p className="gm-tier-error" role="alert">{error}</p>}
    </article>
  );
}

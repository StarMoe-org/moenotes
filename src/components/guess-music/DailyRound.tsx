"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import {
  DailyApiError,
  classifyDailyError,
  dailyComboMultiplier,
  dailyPotential,
  type DailyAnswerResult,
  type DailyApi,
  type DailyErrorKind,
  type DailyOutcome,
  type DailyReveal,
  type DailyRoundStart,
  type DailySealedClip,
  type DailyTierInfo,
  type StoredDailyRun,
} from "@/lib/guess-music/daily-client";
import type { Guess, RoundOutcome, RoundResult } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import { MAX_STRIKES, formatMultiplier } from "@/lib/guess-music/scoring";
import AnswerPanel, { songGuess } from "./AnswerPanel";
import DailyClipPlayer from "./DailyClipPlayer";
import GuessIcon from "./GuessIcon";
import RoundReveal, { OUTCOME_ICON } from "./RoundReveal";

type Phase = "starting" | "guessing" | "submitting" | "revealed" | "error";

/** The server's outcome as free play names it, so the reveal card and its wording are shared. */
const OUTCOMES: Record<DailyOutcome, RoundOutcome> = { correct: "correct", strikes: "wrong", timeout: "timeout", gave_up: "gaveUp" };

interface RevealState {
  round: number;
  outcome: RoundOutcome;
  points: number;
  combo: number;
  /** Wrong guesses the round took. */
  wrong: number;
  /** Absent when the server had the round final already (its answer shows on the results). */
  answer?: DailyReveal | undefined;
  lastGuess: Guess | null;
}

export interface DailyRoundProps {
  locale: AppLocale;
  api: DailyApi;
  tier: DailyTierInfo;
  run: StoredDailyRun;
  library: SongLibrary;
  onRunChange: (run: StoredDailyRun) => void;
  /** Every round is final: finish the session. */
  onDone: () => void;
  /** The session can no longer be played (expired, signed out). */
  onFatal: (kind: DailyErrorKind) => void;
  /** Back to the tiers; the run stays resumable. */
  onExit: () => void;
}

const TICK_MS = 100;
const LOW_TIME_MS = 10_000;

function revealResult(reveal: RevealState & { answer: DailyReveal }): RoundResult {
  return {
    index: reveal.round,
    musicId: reveal.answer.musicId,
    clipStart: reveal.answer.startSeconds,
    outcome: reveal.outcome,
    finalGuess: reveal.lastGuess,
    wrongGuesses: [],
    strikes: 0,
    score: reveal.points,
    timeTaken: 0,
    combo: reveal.combo,
    comboMultiplier: reveal.outcome === "correct" ? dailyComboMultiplier(reveal.combo) : 1,
  };
}

/** One run of a tier against the server, a round at a time, with the answer after each. */
export default function DailyRound({ locale, api, tier, run, library, onRunChange, onDone, onFatal, onExit }: DailyRoundProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const total = run.rounds;
  const [round, setRound] = useState(run.round);
  const [phase, setPhase] = useState<Phase>("starting");
  const [start, setStart] = useState<DailyRoundStart | null>(null);
  const [clipSrc, setClipSrc] = useState<string | null>(null);
  // Downloaded but still sealed: the player unlocks it once the page may play sound.
  const [sealed, setSealed] = useState<DailySealedClip | null>(null);
  const [clipFailed, setClipFailed] = useState(false);
  const [clipProgress, setClipProgress] = useState<number | undefined>(undefined);
  const [reveal, setReveal] = useState<RevealState | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [errorKind, setErrorKind] = useState<DailyErrorKind | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [startAttempt, setStartAttempt] = useState(0);

  // The latest run for async callbacks, so a slow response never writes over a newer state.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  const commit = useCallback(
    (next: StoredDailyRun) => {
      runRef.current = next;
      onRunChange(next);
    },
    [onRunChange],
  );
  const clipUrlRef = useRef<string | null>(null);
  const clipAbortRef = useRef<AbortController | null>(null);
  const submittingRef = useRef(false);
  // Rounds skipped in a row because the server had them final already.
  const skippedRef = useRef(0);
  // The next round, started while the answer shows: starting runs no timer (the clip's key does).
  const nextStartRef = useRef<{ round: number; start: Promise<DailyRoundStart> } | null>(null);
  const errorText = useCallback((kind: DailyErrorKind) => t(locale, `guessMusic.daily.errors.${kind}`), [locale]);
  // The round is over (answered, or being answered for good): a clip still unlocking no longer matters.
  const revealRef = useRef(false);
  useEffect(() => {
    revealRef.current = reveal !== null;
  }, [reveal]);

  const releaseClip = useCallback(() => {
    clipAbortRef.current?.abort();
    clipAbortRef.current = null;
    if (clipUrlRef.current) URL.revokeObjectURL(clipUrlRef.current);
    clipUrlRef.current = null;
    setClipSrc(null);
    setSealed(null);
  }, []);
  useEffect(() => releaseClip, [releaseClip]);

  const failClip = useCallback(
    (error: unknown) => {
      const kind = classifyDailyError(error);
      if (kind === "sessionExpired" || kind === "signedOut") onFatal(kind);
      else setClipFailed(true);
    },
    [onFatal],
  );

  const loadClip = useCallback(
    async (roundStart: DailyRoundStart) => {
      releaseClip();
      setClipFailed(false);
      setClipProgress(undefined);
      const controller = new AbortController();
      clipAbortRef.current = controller;
      try {
        const downloaded = await api.downloadRoundClip(roundStart, controller.signal, (fraction) => {
          if (!controller.signal.aborted) setClipProgress(fraction);
        });
        if (controller.signal.aborted) return;
        setSealed(downloaded);
        // This clip is here: fetch the next one while this round plays.
        api.prefetchNextClip(roundStart);
      } catch (error) {
        if (!controller.signal.aborted) failClip(error);
      }
    },
    [api, failClip, releaseClip],
  );

  // The key starts the round timer: the player asks for it only once the clip can be heard.
  const unlockClip = useCallback(async () => {
    const current = sealed;
    const controller = clipAbortRef.current;
    if (!current || !controller) return;
    setSealed(null);
    try {
      const opened = await api.unlockRoundClip(current, controller.signal);
      if (controller.signal.aborted) return;
      // Count down with the server's timer; its figure also resyncs a reloaded page.
      const latest = runRef.current;
      if (latest.round === round) commit({ ...latest, timerStartedAt: opened.timerStartedAt });
      const url = URL.createObjectURL(opened.clip);
      clipUrlRef.current = url;
      setClipSrc(url);
    } catch (error) {
      if (!controller.signal.aborted && !revealRef.current) failClip(error);
    }
  }, [api, commit, failClip, round, sealed]);

  // Start the current round.
  useEffect(() => {
    if (reveal) return;
    if (round >= total) {
      onDone();
      return;
    }
    let cancelled = false;
    setPhase("starting");
    setStart(null);
    setNotice(null);
    setErrorKind(null);
    const early = nextStartRef.current?.round === round ? nextStartRef.current.start : null;
    nextStartRef.current = null;
    // A failed early start is simply made again, so any error shown is this one's.
    (early ? early.catch(() => api.startRound(run.sessionId, round)) : api.startRound(run.sessionId, round))
      .then((roundStart) => {
        if (cancelled) return;
        skippedRef.current = 0;
        setStart(roundStart);
        setPhase("guessing");
        void loadClip(roundStart);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DailyApiError && error.code === "session_finished") {
          onDone();
          return;
        }
        const kind = classifyDailyError(error);
        if (kind === "conflict" && skippedRef.current === 0) {
          // The server has this round final already (its answer got lost): move on once.
          skippedRef.current += 1;
          commit({ ...runRef.current, round: round + 1, wrongGuesses: [], timerStartedAt: undefined });
          setRound(round + 1);
          return;
        }
        if (kind === "sessionExpired" || kind === "signedOut") {
          onFatal(kind);
          return;
        }
        setErrorKind(kind);
        setPhase("error");
      });
    return () => {
      cancelled = true;
    };
    // run.sessionId is fixed for the life of this view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round, reveal, startAttempt]);

  useEffect(() => {
    const upcoming = reveal ? reveal.round + 1 : -1;
    if (upcoming < 0 || upcoming >= total || nextStartRef.current?.round === upcoming) return;
    const early = api.startRound(run.sessionId, upcoming);
    early.catch(() => {});
    nextStartRef.current = { round: upcoming, start: early };
  }, [api, reveal, run.sessionId, total]);

  // The countdown runs while the round is open.
  useEffect(() => {
    if (phase !== "guessing" && phase !== "submitting") return;
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, [phase]);

  const timeLimitMs = (start?.timeLimitSeconds ?? tier.timeLimitSeconds) * 1000;
  const startedAt = run.round === round ? run.timerStartedAt : undefined;
  // `now` only ticks while guessing: right after a round starts it can predate the clip, so cap at the limit.
  const leftMs = startedAt ? Math.min(timeLimitMs, Math.max(0, timeLimitMs - (now - startedAt))) : timeLimitMs;
  const wrongIds = useMemo(() => (run.round === round ? run.wrongGuesses : []), [run.round, run.wrongGuesses, round]);
  const wrongGuesses = useMemo(() => wrongIds.map((id) => songGuess(library, id)), [library, wrongIds]);
  // The run moves on as the answer shows: the reveal keeps the round's own count.
  const strikesLeft = MAX_STRIKES - (reveal ? reveal.wrong : wrongIds.length);

  const submit = useCallback(
    async (musicId: number | null) => {
      if (submittingRef.current) return;
      submittingRef.current = true;
      setPhase("submitting");
      setNotice(null);
      const before = runRef.current;
      let result: DailyAnswerResult;
      try {
        result = await api.answer(before.sessionId, round, musicId);
      } catch (error) {
        submittingRef.current = false;
        const kind = classifyDailyError(error);
        if (kind === "sessionExpired" || kind === "signedOut") {
          onFatal(kind);
          return;
        }
        if (kind === "conflict") {
          // Final on the server already; the results show its answer.
          commit({ ...before, round: round + 1, wrongGuesses: [], timerStartedAt: undefined });
          if (!clipUrlRef.current) releaseClip();
          revealRef.current = true;
          setReveal({ round, outcome: "timeout", points: 0, combo: 0, wrong: before.wrongGuesses.length, lastGuess: null });
          setPhase("revealed");
          return;
        }
        setNotice(errorText(kind));
        setPhase("guessing");
        return;
      }
      submittingRef.current = false;
      const wrong = !result.correct && musicId !== null ? [...before.wrongGuesses, musicId] : before.wrongGuesses;
      if (!result.final) {
        commit({ ...before, totalScore: result.totalScore, combo: result.combo, wrongGuesses: wrong });
        setNotice(t(locale, "guessMusic.daily.round.wrong", { count: result.strikesLeft }));
        setPhase("guessing");
        return;
      }
      const outcome = result.outcome ? OUTCOMES[result.outcome] : result.correct ? "correct" : "timeout";
      const last = wrong[wrong.length - 1];
      // Given up before the clip opened: stop fetching it.
      if (!clipUrlRef.current) releaseClip();
      revealRef.current = true;
      commit({
        ...before,
        round: round + 1,
        totalScore: result.totalScore,
        combo: result.combo,
        wrongGuesses: [],
        timerStartedAt: undefined,
        answered: [...before.answered.filter((item) => item.round !== round), { round, correct: result.correct, points: result.points }],
      });
      setReveal({
        round,
        outcome,
        points: result.points,
        combo: result.combo,
        wrong: wrong.length,
        answer: result.answer,
        lastGuess: outcome === "wrong" && last !== undefined ? songGuess(library, last) : null,
      });
      setPhase("revealed");
    },
    [api, commit, errorText, library, locale, onFatal, releaseClip, round],
  );

  // Time is up: give the round up; the server records it as a timeout.
  useEffect(() => {
    if (phase === "guessing" && startedAt && leftMs <= 0) void submit(null);
  }, [phase, startedAt, leftMs, submit]);

  const next = () => {
    setReveal(null);
    releaseClip();
    setRound((current) => current + 1);
  };

  const clipSeconds = start?.clipSeconds ?? tier.clipSeconds;
  const isLast = round >= total - 1;
  const canGuess = phase === "guessing" && Boolean(clipSrc);
  const tierName = tr(`daily.tiers.${tier.id}`);
  const low = Boolean(startedAt) && leftMs <= LOW_TIME_MS && phase === "guessing";
  const potential = startedAt && !reveal ? dailyPotential(now - startedAt, timeLimitMs / 1000, run.combo, wrongIds.length) : 0;
  const revealed = phase === "revealed" && reveal;
  // Read out by the live region below, which stays mounted (a region inserted with its text is often not announced).
  const announcement = reveal
    ? [
        tr(`outcome.${reveal.outcome}`),
        reveal.outcome === "correct" ? tr("reveal.points", { score: reveal.points }) : "",
        reveal.answer ? (library.entryById.get(reveal.answer.musicId)?.title ?? "") : "",
      ]
        .filter(Boolean)
        .join(" ")
    : "";

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <section className="gm-panel gm-stack" style={{ gap: 12 }} aria-label={tr("hud.status")}>
        <div className="gm-between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="gm-row" style={{ gap: 6, marginBottom: 6 }}>
              <span className={`gm-chip${run.ranked ? " gm-chip-ranked" : ""}`}>
                <GuessIcon name={run.ranked ? "trophy" : "practice"} size={14} />
                {tr(run.ranked ? "daily.round.rankedBadge" : "daily.round.practiceBadge", { tier: tierName })}
              </span>
            </div>
            <div className="gm-hud-round gm-num">{tr("hud.round", { current: Math.min(round + 1, total), total })}</div>
            <div className="gm-row" style={{ marginTop: 4 }}>
              <span className="gm-hearts" role="img" aria-label={tr("hud.strikesLeft", { count: strikesLeft })}>
                {Array.from({ length: MAX_STRIKES }, (_, index) => (
                  <GuessIcon key={index} name="heart" size={20} className={index < strikesLeft ? undefined : "is-spent"} />
                ))}
              </span>
              {run.combo > 1 && (
                <span className="gm-chip">
                  <GuessIcon name="bolt" size={14} />
                  {tr("hud.combo", { count: run.combo, multiplier: formatMultiplier(dailyComboMultiplier(run.combo)) })}
                </span>
              )}
            </div>
          </div>
          <div className="gm-row" style={{ flexWrap: "nowrap", alignItems: "flex-start", flex: "0 0 auto" }}>
            <div>
              <div className="gm-hud-score gm-num">
                {run.totalScore}
                <small>{tr("hud.pointsUnit")}</small>
              </div>
              <div className={`gm-hud-potential gm-num${potential > 0 ? "" : " is-empty"}`}>
                {potential > 0 ? tr("hud.potential", { score: potential }) : " "}
              </div>
            </div>
            <Button variant="text" size="small" onClick={onExit} startIcon={<GuessIcon name="back" />}>
              {tr("daily.round.back")}
            </Button>
          </div>
        </div>
        <ol className="gm-dots" aria-hidden="true">
          {Array.from({ length: total }, (_, index) => {
            const done = run.answered.find((item) => item.round === index);
            return <li key={index} className={done ? (done.correct ? "is-good" : "is-bad") : index === round ? "is-current" : undefined} />;
          })}
        </ol>
        {!revealed && phase !== "error" && (
          <div className="gm-stack" style={{ gap: 6 }}>
            <div className="gm-time">
              <span>{tr(startedAt ? "hud.timeLeft" : "hud.waiting")}</span>
              <span className={`gm-num${low ? " is-low" : ""}`}>{tr("hud.seconds", { seconds: (leftMs / 1000).toFixed(1) })}</span>
            </div>
            <div className={`gm-bar${low ? " is-low" : ""}`} role="progressbar" aria-label={tr("hud.timeLeft")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(timeLimitMs > 0 ? (leftMs / timeLimitMs) * 100 : 0)}>
              <span style={{ width: `${timeLimitMs > 0 ? (leftMs / timeLimitMs) * 100 : 0}%` }} />
            </div>
          </div>
        )}
      </section>

      <p className="sr-only" role="status" aria-atomic="true">{announcement}</p>
      {phase === "error" && errorKind ? (
        <section className="gm-panel gm-state" role="alert">
          <GuessIcon name="warning" size={28} className="gm-bad" />
          <p className="gm-state-text">{errorText(errorKind)}</p>
          <div className="gm-row" style={{ justifyContent: "center" }}>
            <Button variant="outlined" onClick={onExit}>{tr("daily.round.back")}</Button>
            <Button onClick={() => setStartAttempt((n) => n + 1)} startIcon={<GuessIcon name="refresh" />}>
              {tr("daily.retry")}
            </Button>
          </div>
        </section>
      ) : (
        <>
          {/*
            One player for the whole run, hidden rather than unmounted when a round ends before its clip opened: a tap
            unlocked this very audio element, and its loading state covers a round still starting.
          */}
          <div hidden={Boolean(revealed) && !clipSrc}>
            <DailyClipPlayer
              locale={locale}
              src={clipSrc}
              clipSeconds={clipSeconds}
              failed={clipFailed}
              loadProgress={clipProgress}
              onRetry={() => start && void loadClip(start)}
              onUnlock={sealed && !reveal ? () => void unlockClip() : undefined}
              autoPlay={!reveal}
            />
          </div>
          {notice && <div role="status" className="gm-notice">{notice}</div>}
          {phase === "starting" ? null : revealed ? (
            reveal.answer ? (
              <RoundReveal key={`reveal:${reveal.round}`} locale={locale} library={library} result={revealResult({ ...reveal, answer: reveal.answer })} isLast={isLast} onNext={next} />
            ) : (
              <section className="gm-panel gm-reveal">
                <div className="gm-reveal-head">
                  <GuessIcon name={OUTCOME_ICON.timeout} size={22} />
                  <span>{tr("daily.round.answerLater")}</span>
                </div>
                <div className="gm-reveal-actions" style={{ paddingTop: 16 }}>
                  <Button onClick={next} endIcon={<GuessIcon name="next" />}>
                    {tr(isLast ? "reveal.showResults" : "reveal.next")}
                  </Button>
                </div>
              </section>
            )
          ) : (
            <AnswerPanel
              key={`answer:${round}`}
              locale={locale}
              mode={tier.answerMode}
              typed="song"
              library={library}
              optionIds={start?.options ?? []}
              wrongGuesses={wrongGuesses}
              enabled={canGuess}
              canGiveUp={phase === "guessing"}
              onGuess={(guess) => {
                if (guess.musicId !== null) void submit(guess.musicId);
              }}
              onGiveUp={() => void submit(null)}
            />
          )}
        </>
      )}
    </div>
  );
}

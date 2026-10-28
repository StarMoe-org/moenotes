"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { isSameSong, matchesTypedAnswer } from "@/lib/guess-music/answer";
import type { ClipRequest } from "@/lib/guess-music/clip-audio";
import { potentialScore, remainingMs, type GameAction, type GameState, type Guess } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import type { PracticeApi } from "@/lib/guess-music/practice-client";
import type { RoundSpec } from "@/lib/guess-music/rounds";
import { MAX_STRIKES, comboMultiplier, formatMultiplier } from "@/lib/guess-music/scoring";
import AnswerPanel from "./AnswerPanel";
import ClipPlayer from "./ClipPlayer";
import GuessIcon from "./GuessIcon";
import RoundReveal from "./RoundReveal";

const TICK_MS = 100;
const NOTICE_MS = 1800;
const LOW_TIME_MS = 5000;

/** A round's clip: a window of the song's full track, or, without vocals, the clip the server cuts for this round. */
function clipFor(library: SongLibrary, practice: PracticeApi, spec: RoundSpec | undefined, state: Pick<GameState, "gameId" | "config">): ClipRequest | null {
  if (!spec) return null;
  const key = `${state.gameId}:${spec.index}:${spec.musicId}`;
  const { clipSeconds, seed, vocalRemoval } = state.config;
  if (vocalRemoval) {
    const resolve = () =>
      practice.clip({ musicId: spec.musicId, clipSeconds, seed, round: spec.index }).then((clip) => ({ src: clip.clipUrl, startSeconds: clip.startSeconds }));
    return { key, clipSeconds, source: { kind: "cut", resolve } };
  }
  const src = library.songById.get(spec.musicId)?.audioUrl;
  if (!src) return null;
  return { key, clipSeconds, source: { kind: "track", src, startFraction: spec.startFraction } };
}

export interface FreePlayGameProps {
  locale: AppLocale;
  state: GameState;
  dispatch: (action: GameAction) => void;
  library: SongLibrary;
  practice: PracticeApi;
  onQuit: () => void;
}

/** The playing screen: status bar, clip player, answer panel and the reveal after each round. */
export default function FreePlayGame({ locale, state, dispatch, library, practice, onQuit }: FreePlayGameProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const round = state.round;
  const spec = round ? state.rounds[round.index] : undefined;
  const status = round?.status ?? "waiting";
  const [now, setNow] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The clock only runs while the round is open: it drives the countdown and the timeout.
  useEffect(() => {
    if (status !== "guessing") return;
    const timer = setInterval(() => {
      const time = performance.now();
      setNow(time);
      dispatch({ type: "tick", now: time });
    }, TICK_MS);
    return () => clearInterval(timer);
  }, [status, dispatch]);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const showNotice = useCallback((message: string | null) => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(message);
    if (message) noticeTimer.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);

  const config = state.config;
  const gameId = state.gameId;
  const clip = useMemo(() => clipFor(library, practice, spec, { gameId, config }), [library, practice, spec, gameId, config]);
  const nextSpec = round ? state.rounds[round.index + 1] : undefined;
  const nextClip = useMemo(() => clipFor(library, practice, nextSpec, { gameId, config }), [library, practice, nextSpec, gameId, config]);

  const handleStarted = useCallback((clipStart: number) => {
    const time = performance.now();
    setNow(time);
    dispatch({ type: "clipStarted", now: time, clipStart });
  }, [dispatch]);
  const handleAudioError = useCallback(() => dispatch({ type: "audioFailed", now: performance.now() }), [dispatch]);

  // A round whose song has no track at all fails like one whose audio never loads.
  useEffect(() => {
    if (spec && status === "waiting" && !clip) handleAudioError();
  }, [spec, status, clip, handleAudioError]);

  const handleGuess = (guess: Guess) => {
    if (!round || !spec) return;
    const entry = library.entryById.get(spec.musicId);
    const correct = guess.musicId !== null ? isSameSong(library.index, guess.musicId, spec.musicId) : Boolean(entry && matchesTypedAnswer(entry, guess.label));
    const time = performance.now();
    setNow(time);
    const repeated = round.guesses.some((previous) => previous.key === guess.key);
    dispatch({ type: "guess", now: time, correct, guess });
    if (!correct && !repeated && round.strikes + 1 < MAX_STRIKES) showNotice(tr("hud.wrongPenalty"));
    else if (correct || round.strikes + 1 >= MAX_STRIKES) showNotice(null);
  };
  const handleGiveUp = () => {
    showNotice(null);
    dispatch({ type: "giveUp", now: performance.now() });
  };
  const handleNext = () => dispatch({ type: "next" });

  if (!round || !spec) return null;

  const limitMs = config.timeLimit * 1000;
  const leftMs = Math.min(limitMs, remainingMs(round, now));
  const revealed = status === "revealed";
  const result = revealed ? state.results[state.results.length - 1] : undefined;
  const potential = potentialScore(state, now);
  const strikesLeft = MAX_STRIKES - round.strikes;
  const low = leftMs <= LOW_TIME_MS && status === "guessing";
  // Read out by the live region below, which stays mounted (a region inserted together with its text is often not announced).
  const announcement = result
    ? [
        tr(`outcome.${result.outcome}`),
        result.outcome === "correct" ? tr("reveal.points", { score: result.score }) : "",
        library.entryById.get(result.musicId)?.title ?? "",
      ].filter(Boolean).join(" ")
    : "";

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <section className="gm-panel gm-stack" style={{ gap: 12 }} aria-label={tr("hud.status")}>
        <div className="gm-between" style={{ alignItems: "flex-start", flexWrap: "nowrap" }}>
          <div style={{ minWidth: 0 }}>
            <div className="gm-hud-round gm-num">{tr("hud.round", { current: round.index + 1, total: state.rounds.length })}</div>
            <div className="gm-row" style={{ marginTop: 4 }}>
              <span className="gm-hearts" role="img" aria-label={tr("hud.strikesLeft", { count: strikesLeft })}>
                {Array.from({ length: MAX_STRIKES }, (_, index) => (
                  <GuessIcon key={index} name="heart" size={20} className={index < strikesLeft ? undefined : "is-spent"} />
                ))}
              </span>
              {state.combo > 1 && (
                <span className="gm-chip">
                  <GuessIcon name="bolt" size={14} />
                  {tr("hud.combo", { count: state.combo, multiplier: formatMultiplier(comboMultiplier(state.combo)) })}
                </span>
              )}
            </div>
          </div>
          <div className="gm-row" style={{ flexWrap: "nowrap", alignItems: "flex-start", flex: "0 0 auto" }}>
            <div>
              <div className="gm-hud-score gm-num">
                {state.score}
                <small>{tr("hud.pointsUnit")}</small>
              </div>
              <div className={`gm-hud-potential gm-num${potential > 0 ? "" : " is-empty"}`}>
                {revealed ? " " : tr("hud.potential", { score: potential })}
              </div>
            </div>
            <Button variant="text" size="small" onClick={onQuit} startIcon={<GuessIcon name="close" />}>
              {tr("hud.quit")}
            </Button>
          </div>
        </div>
        <div className="gm-stack" style={{ gap: 6 }}>
          <div className="gm-time">
            <span>{tr(status === "waiting" ? "hud.waiting" : "hud.timeLeft")}</span>
            <span className={`gm-num${low ? " is-low" : ""}`}>{tr("hud.seconds", { seconds: (leftMs / 1000).toFixed(1) })}</span>
          </div>
          <div className={`gm-bar${low ? " is-low" : ""}`} role="progressbar" aria-label={tr("hud.timeLeft")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(limitMs > 0 ? (leftMs / limitMs) * 100 : 0)}>
            <span style={{ width: `${limitMs > 0 ? (leftMs / limitMs) * 100 : 0}%` }} />
          </div>
        </div>
      </section>

      {/* Sibling keys share one namespace: prefix them so a game id never equals a round index. */}
      <ClipPlayer
        key={`player:${gameId}`}
        locale={locale}
        clip={clip}
        nextClip={nextClip}
        autoPlay={status === "waiting"}
        onStarted={handleStarted}
        onError={handleAudioError}
      />

      {notice && <div role="status" className="gm-notice">{notice}</div>}

      <p className="sr-only" role="status" aria-atomic="true">{announcement}</p>
      {revealed && result ? (
        <RoundReveal key={`reveal:${gameId}:${result.index}`} locale={locale} library={library} result={result} isLast={round.index + 1 >= state.rounds.length} onNext={handleNext} />
      ) : (
        <AnswerPanel
          key={`answer:${gameId}:${round.index}`}
          locale={locale}
          mode={config.answerMode}
          library={library}
          optionIds={spec.optionIds}
          wrongGuesses={round.guesses}
          enabled={status === "guessing"}
          canGiveUp={!revealed}
          onGuess={handleGuess}
          onGiveUp={handleGiveUp}
        />
      )}
    </div>
  );
}

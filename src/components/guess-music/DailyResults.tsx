"use client";

import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { entityLinkPath } from "@/lib/route/entity-link";
import { formatDuration, type DailyFinishResult, type DailyOutcome } from "@/lib/guess-music/daily-client";
import type { RoundOutcome } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import { formatClock } from "@/lib/guess-music/rounds";
import { showToast } from "@/lib/toast/toast";
import GuessIcon from "./GuessIcon";
import { OUTCOME_ICON } from "./RoundReveal";

const OUTCOMES: Record<DailyOutcome, RoundOutcome> = { correct: "correct", strikes: "wrong", timeout: "timeout", gave_up: "gaveUp" };

export interface DailyResultsProps {
  locale: AppLocale;
  result: DailyFinishResult;
  library: SongLibrary;
  /** The ranked run was played earlier today: this is the stored result. */
  alreadyPlayed: boolean;
  onBack: () => void;
  /** Practice only: a new run on the practice set. */
  onPlayAgain?: (() => void) | undefined;
}

/** The end of a daily run: score, rank, and every round with its answer. */
export default function DailyResults({ locale, result, library, alreadyPlayed, onBack, onPlayAgain }: DailyResultsProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const tierName = tr(`daily.tiers.${result.tier}`);
  const total = result.rounds.length;
  const hasRank = result.ranked && result.rank !== undefined && result.totalPlayers !== undefined;

  const copyResult = () => {
    const lines = [
      tr(result.ranked ? "daily.results.shareTitle" : "daily.results.sharePracticeTitle", { date: result.date, tier: tierName }),
      tr("daily.results.shareScore", { correct: result.correctCount, total, score: result.totalScore }),
      hasRank ? tr("daily.results.shareRank", { rank: result.rank ?? 0, total: result.totalPlayers ?? 0 }) : "",
      `${window.location.origin}${window.location.pathname}`,
    ];
    const fail = () => showToast({ id: "guess-music-share", title: tr("results.copyFailed"), icon: "warning", durationMs: 3000 });
    if (!navigator.clipboard) {
      fail();
      return;
    }
    navigator.clipboard.writeText(lines.filter(Boolean).join("\n")).then(
      () => showToast({ id: "guess-music-share", title: tr("daily.results.copied"), icon: "success", durationMs: 2500 }),
      fail,
    );
  };

  const summary: Array<[string, ReactNode]> = [
    [tr("daily.results.date"), <span key="date" className="gm-num">{result.date}</span>],
    [tr("results.difficulty"), tierName],
    [tr("daily.results.mode"), tr(result.ranked ? "daily.info.rankedTitle" : "daily.info.practiceTitle")],
    [tr("daily.results.duration"), <span key="duration" className="gm-num">{formatDuration(result.durationMs)}</span>],
  ];

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <section className="gm-panel gm-final">
        <h2 className="gm-panel-title">{tr(alreadyPlayed ? "daily.results.alreadyPlayedTitle" : result.ranked ? "results.title" : "daily.results.practiceTitle")}</h2>
        {alreadyPlayed && <p className="gm-muted" style={{ marginTop: 8 }}>{tr("daily.results.alreadyPlayed")}</p>}
        <p className="gm-muted gm-final-label">{tr("results.finalScore")}</p>
        <div className="gm-final-score">{result.totalScore}</div>
        <div className="gm-row" style={{ justifyContent: "center", marginTop: 8 }}>
          <span className="gm-chip">{tr("results.correctCount", { correct: result.correctCount, total })}</span>
          {hasRank && (
            <span className="gm-chip gm-chip-ranked">
              <GuessIcon name="trophy" size={14} />
              {tr("daily.results.rank", { rank: result.rank ?? 0, total: result.totalPlayers ?? 0 })}
            </span>
          )}
        </div>
        <dl className="gm-summary">
          {summary.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        {!result.ranked && <p className="gm-hint" style={{ marginTop: 12 }}>{tr("daily.results.practiceNote")}</p>}
        <div className="gm-row gm-actions">
          <Button variant="outlined" onClick={copyResult} startIcon={<GuessIcon name="copy" />}>
            {tr("daily.results.copy")}
          </Button>
          <Button variant="outlined" onClick={onBack} startIcon={<GuessIcon name="back" />}>
            {tr("daily.results.back")}
          </Button>
          {onPlayAgain && (
            <Button onClick={onPlayAgain} startIcon={<GuessIcon name="refresh" />}>
              {tr("daily.results.playAgain")}
            </Button>
          )}
        </div>
      </section>

      <ol className="gm-results">
        {result.rounds.map((round) => {
          const id = round.answer?.musicId;
          const song = id !== undefined ? library.songById.get(id) : undefined;
          const entry = id !== undefined ? library.entryById.get(id) : undefined;
          const outcome = OUTCOMES[round.outcome] ?? "timeout";
          const correct = outcome === "correct";
          const body = (
            <>
              <img className="gm-jacket" src={song?.jacketUrl} alt="" loading="lazy" width={56} height={56} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="gm-result-meta">
                  <span className="gm-num">{tr("results.roundLabel", { round: round.round + 1 })}</span>
                  <span className={`gm-row ${correct ? "gm-good" : "gm-bad"}`} style={{ gap: 4 }}>
                    <GuessIcon name={OUTCOME_ICON[outcome]} size={14} />
                    {correct && round.attempts > 1 ? tr("daily.results.correctAfter", { attempts: round.attempts }) : tr(`outcome.${outcome}`)}
                  </span>
                </div>
                <div className="gm-titles">
                  <span>{entry?.title ?? song?.title ?? (id !== undefined ? `#${id}` : "")}</span>
                  {entry?.subtitle && <span>{entry.subtitle}</span>}
                </div>
                <div className="gm-result-meta" style={{ marginTop: 4 }}>
                  {round.answer && <span className="gm-num">{formatClock(round.answer.startSeconds)}</span>}
                  {correct && <span className="gm-num">{tr("results.timeTaken", { seconds: (round.elapsedMs / 1000).toFixed(1) })}</span>}
                </div>
              </div>
              <span className={`gm-result-points${correct ? "" : " gm-muted"}`}>+{round.points}</span>
            </>
          );
          return (
            <li key={round.round}>
              {id !== undefined ? (
                <a className="gm-result md3-state" href={localizePath(entityLinkPath({ routeId: "music", detailId: id }), locale)}>{body}</a>
              ) : (
                <div className="gm-result">{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

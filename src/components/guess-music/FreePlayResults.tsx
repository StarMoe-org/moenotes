"use client";

import type { ReactNode } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { entityLinkPath } from "@/lib/route/entity-link";
import { correctCount, maxCombo, type GameState } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import { formatClock } from "@/lib/guess-music/rounds";
import { formatMultiplier } from "@/lib/guess-music/scoring";
import type { FreePlaySettings, PresetId } from "@/lib/guess-music/settings";
import GuessIcon from "./GuessIcon";
import { OUTCOME_ICON } from "./RoundReveal";

export interface FreePlayResultsProps {
  locale: AppLocale;
  state: GameState;
  settings: FreePlaySettings;
  preset: PresetId;
  server: GameServer;
  library: SongLibrary;
  onCopyLink: () => void;
  onReplay: () => void;
  onNewGame: () => void;
  onBackToSetup: () => void;
}

/** Final score, the game's settings with a share link, and every round. */
export default function FreePlayResults({ locale, state, settings, preset, server, library, onCopyLink, onReplay, onNewGame, onBackToSetup }: FreePlayResultsProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const config = state.config;
  const summary: Array<[string, ReactNode]> = [
    [tr("results.difficulty"), tr(`setup.presets.${preset}`)],
    [tr("setup.rounds"), tr("setup.roundCount", { count: state.rounds.length })],
    [tr("results.clip"), tr("setup.seconds", { seconds: config.clipSeconds })],
    [tr("results.mode"), config.answerMode === "choice" ? tr("results.choiceMode", { count: settings.optionsCount }) : tr(`setup.modes.${config.answerMode}`)],
    ...(config.vocalRemoval ? ([[tr("setup.vocalRemoval"), tr("setup.vocalOptions.on")]] as Array<[string, ReactNode]>) : []),
    [tr("results.timeLimit"), tr("setup.seconds", { seconds: config.timeLimit })],
    [tr("results.server"), t(locale, `gameServer.names.${server}`)],
    [tr("results.seed"), <code key="seed">{settings.seed}</code>],
  ];

  return (
    <div className="gm-stack" style={{ gap: 16 }}>
      <section className="gm-panel gm-final">
        <h2 className="gm-panel-title">{tr("results.title")}</h2>
        <p className="gm-muted gm-final-label">{tr("results.finalScore")}</p>
        <div className="gm-final-score">{state.score}</div>
        <div className="gm-row" style={{ justifyContent: "center", marginTop: 8 }}>
          <span className="gm-chip">{tr("results.correctCount", { correct: correctCount(state.results), total: state.rounds.length })}</span>
          <span className="gm-chip">{tr("results.maxCombo", { combo: maxCombo(state.results) })}</span>
        </div>
        <dl className="gm-summary">
          {summary.map(([label, value]) => (
            <div key={label} style={{ display: "contents" }}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
        <div className="gm-row gm-actions">
          <Button variant="outlined" onClick={onCopyLink} startIcon={<GuessIcon name="share" />}>
            {tr("results.copyLink")}
          </Button>
          <Button variant="outlined" onClick={onReplay} startIcon={<GuessIcon name="replay" />}>
            {tr("results.replaySeed")}
          </Button>
          <Button variant="outlined" onClick={onBackToSetup} startIcon={<GuessIcon name="tune" />}>
            {tr("results.backToSetup")}
          </Button>
          <Button onClick={onNewGame} startIcon={<GuessIcon name="refresh" />}>
            {tr("results.playAgain")}
          </Button>
        </div>
      </section>

      <ol className="gm-results">
        {state.results.map((result) => {
          const song = library.songById.get(result.musicId);
          const entry = library.entryById.get(result.musicId);
          const correct = result.outcome === "correct";
          return (
            <li key={result.index}>
              <a className="gm-result md3-state" href={localizePath(entityLinkPath({ routeId: "music", detailId: result.musicId }), locale)}>
                <img className="gm-jacket" src={song?.jacketUrl} alt="" loading="lazy" width={56} height={56} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="gm-result-meta">
                    <span className="gm-num">{tr("results.roundLabel", { round: result.index + 1 })}</span>
                    <span className={`gm-row ${correct ? "gm-good" : "gm-bad"}`} style={{ gap: 4 }}>
                      <GuessIcon name={OUTCOME_ICON[result.outcome]} size={14} />
                      {tr(`outcome.${result.outcome}`)}
                    </span>
                  </div>
                  <div className="gm-titles">
                    <span>{entry?.title ?? song?.title}</span>
                    {entry?.subtitle && <span>{entry.subtitle}</span>}
                  </div>
                  <div className="gm-result-meta" style={{ marginTop: 4 }}>
                    {result.clipStart !== null && <span className="gm-num">{formatClock(result.clipStart)}</span>}
                    {result.timeTaken > 0 && <span className="gm-num">{tr("results.timeTaken", { seconds: result.timeTaken.toFixed(1) })}</span>}
                    {result.comboMultiplier > 1 && <span className="gm-chip" style={{ minHeight: 20 }}>{tr("reveal.combo", { multiplier: formatMultiplier(result.comboMultiplier) })}</span>}
                  </div>
                </div>
                <span className={`gm-result-points${correct ? "" : " gm-muted"}`}>+{result.score}</span>
              </a>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

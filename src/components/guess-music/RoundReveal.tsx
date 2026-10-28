"use client";

import { useEffect, useRef } from "react";
import Button from "@mui/material/Button";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { entityLinkPath } from "@/lib/route/entity-link";
import type { RoundOutcome, RoundResult } from "@/lib/guess-music/game";
import type { SongLibrary } from "@/lib/guess-music/pool";
import { formatClock } from "@/lib/guess-music/rounds";
import { formatMultiplier } from "@/lib/guess-music/scoring";
import GuessIcon, { type GuessIconName } from "./GuessIcon";

export const OUTCOME_ICON: Record<RoundOutcome, GuessIconName> = {
  correct: "check",
  wrong: "close",
  timeout: "clock",
  gaveUp: "flag",
  unavailable: "warning",
};

export interface RoundRevealProps {
  locale: AppLocale;
  library: SongLibrary;
  result: RoundResult;
  isLast: boolean;
  onNext: () => void;
}

/** The answer of a finished round: jacket, titles, credits, clip position and the round's points. */
export default function RoundReveal({ locale, library, result, isLast, onNext }: RoundRevealProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const nextRef = useRef<HTMLButtonElement>(null);
  const song = library.songById.get(result.musicId);
  const entry = library.entryById.get(result.musicId);
  const correct = result.outcome === "correct";

  useEffect(() => {
    nextRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    // The game's own live region announces the outcome; this section mounts with its content, so it is not one.
    <section className="gm-panel gm-reveal">
      <div className={`gm-reveal-head${correct ? " is-correct" : ""}`}>
        <GuessIcon name={OUTCOME_ICON[result.outcome]} size={22} />
        <span>{tr(`outcome.${result.outcome}`)}</span>
        {correct && (
          <span className="gm-num">
            {tr("reveal.points", { score: result.score })}
            {result.comboMultiplier > 1 && <span className="gm-reveal-combo">{tr("reveal.combo", { multiplier: formatMultiplier(result.comboMultiplier) })}</span>}
          </span>
        )}
      </div>
      <div className="gm-reveal-body">
        {song && <img className="gm-reveal-jacket" src={song.jacketUrl} alt={song.title} width={144} height={144} />}
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2 className="gm-reveal-title">{entry?.title ?? song?.title}</h2>
          {entry?.subtitle && <p className="gm-reveal-subtitle">{entry.subtitle}</p>}
          <dl className="gm-facts">
            {song?.bandName && (
              <>
                <dt>{tr("reveal.band")}</dt>
                <dd>{song.bandName}</dd>
              </>
            )}
            {song?.composer && (
              <>
                <dt>{tr("reveal.composer")}</dt>
                <dd>{song.composer}</dd>
              </>
            )}
            <dt>{tr("reveal.clipStart")}</dt>
            <dd className="gm-num">{result.clipStart === null ? "--:--" : formatClock(result.clipStart)}</dd>
            {result.finalGuess && !correct && (
              <>
                <dt>{tr("reveal.lastGuess")}</dt>
                <dd>{result.finalGuess.label}</dd>
              </>
            )}
          </dl>
        </div>
      </div>
      <div className="gm-reveal-actions">
        <Button variant="text" href={localizePath(entityLinkPath({ routeId: "music", detailId: result.musicId }), locale)} target="_blank" rel="noopener" startIcon={<GuessIcon name="external" />}>
          {tr("reveal.songDetail")}
        </Button>
        <Button ref={nextRef} onClick={onNext} endIcon={<GuessIcon name="next" />}>
          {tr(isLast ? "reveal.showResults" : "reveal.next")}
        </Button>
      </div>
    </section>
  );
}

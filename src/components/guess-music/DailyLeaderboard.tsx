"use client";

import { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import AccountAvatar from "@/components/account/AccountAvatar";
import type { AppLocale } from "@/config/locales";
import { playerPagePath } from "@/config/players";
import { isGameServer } from "@/config/servers";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { accountAvatarUrl } from "@/lib/account/avatar-url";
import {
  classifyDailyError,
  formatDuration,
  isAbortError,
  recentDates,
  type DailyApi,
  type DailyErrorKind,
  type DailyLeaderboard as Board,
  type DailyLeaderboardEntry,
  type DailyPlayer,
  type DailyTierId,
} from "@/lib/guess-music/daily-client";
import GuessIcon from "./GuessIcon";

export interface DailyLeaderboardProps {
  locale: AppLocale;
  api: DailyApi;
  today: string;
  tiers: DailyTierId[];
  tier: DailyTierId;
  onTierChange: (tier: DailyTierId) => void;
  /** Bumped after a ranked run finishes, to show the new standing. */
  refreshKey: number;
  /** This visitor can play ranked (or sign in to): an empty board invites them. */
  canRank: boolean;
}

const LIMIT = 50;

function avatarOf(player: DailyPlayer): string | null {
  return accountAvatarUrl({ name: player.name, username: null, picture: player.picture ?? null, avatar: player.avatar ?? null });
}

/** One tier's ranked results of a day: today or one of the 30 days before. */
export default function DailyLeaderboard({ locale, api, today, tiers, tier, onTierChange, refreshKey, canRank }: DailyLeaderboardProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const [date, setDate] = useState(today);
  const [board, setBoard] = useState<{ key: string; data: Board } | null>(null);
  const [error, setError] = useState<{ key: string; kind: DailyErrorKind } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key = `${date}|${tier}`;

  // A new day moves the picker along with it.
  useEffect(() => setDate(today), [today]);

  useEffect(() => {
    const controller = new AbortController();
    setError(null);
    api
      .leaderboard({ tier, date, limit: LIMIT }, controller.signal)
      .then((data) => setBoard({ key, data }))
      .catch((failure: unknown) => {
        if (!isAbortError(failure)) setError({ key, kind: classifyDailyError(failure) });
      });
    return () => controller.abort();
  }, [api, tier, date, key, refreshKey, attempt]);

  const data = board?.key === key ? board.data : null;
  const failed = error?.key === key ? error.kind : null;
  const tierName = tr(`daily.tiers.${tier}`);
  const meInList = data?.entries.some((entry) => entry.me) ?? false;

  return (
    <section className="gm-panel gm-stack" style={{ gap: 14 }} aria-labelledby="gm-board-title">
      <div className="gm-between">
        <h2 id="gm-board-title" className="gm-panel-title gm-row" style={{ gap: 8 }}>
          <GuessIcon name="trophy" size={20} />
          {tr("daily.board.title")}
        </h2>
        {data && <span className="gm-muted gm-num">{tr("daily.board.players", { count: data.totalPlayers })}</span>}
      </div>
      <div className="gm-between" style={{ alignItems: "flex-end" }}>
        <ToggleButtonGroup exclusive size="small" value={tier} onChange={(_, next: DailyTierId | null) => next && onTierChange(next)} aria-label={tr("results.difficulty")} className="gm-segmented">
          {tiers.map((id) => (
            <ToggleButton key={id} value={id}>
              {tr(`daily.tiers.${id}`)}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>
        <TextField select size="small" value={date} onChange={(event) => setDate(event.target.value)} slotProps={{ htmlInput: { "aria-label": tr("daily.board.date") } }} className="gm-num">
          {recentDates(today).map((day) => (
            <MenuItem key={day} value={day}>
              {day === today ? tr("daily.board.today", { date: day }) : day}
            </MenuItem>
          ))}
        </TextField>
      </div>

      {failed ? (
        <div className="gm-state" style={{ padding: "12px 0" }} role="alert">
          <p className="gm-state-text">{tr("daily.board.failed")}</p>
          <Button variant="outlined" onClick={() => setAttempt((n) => n + 1)} startIcon={<GuessIcon name="refresh" />}>
            {tr("daily.retry")}
          </Button>
        </div>
      ) : !data ? (
        <div className="gm-state" style={{ padding: "12px 0" }}>
          <span className="gm-spinner" role="img" aria-label={tr("daily.board.loading")} />
        </div>
      ) : !data.entries.length ? (
        <p className="gm-muted gm-board-empty">
          {tr(date !== today ? "daily.board.emptyPast" : canRank ? "daily.board.emptyToday" : "daily.board.emptyTodayNeutral", { tier: tierName })}
        </p>
      ) : (
        <>
          <ol className="gm-board">
            {data.entries.map((entry) => (
              <BoardRow key={`${entry.rank}:${entry.player.name}`} locale={locale} entry={entry} />
            ))}
          </ol>
          {data.me && !meInList && (
            <p className="gm-board-me gm-num">
              {tr("daily.board.myRank", { rank: data.me.rank, score: data.me.score })}
            </p>
          )}
        </>
      )}
    </section>
  );
}

function BoardRow({ locale, entry }: { locale: AppLocale; entry: DailyLeaderboardEntry }) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  const game = entry.game && isGameServer(entry.game.server) && /^\d+$/.test(entry.game.profileId) ? entry.game : null;
  return (
    <li className={`gm-board-row${entry.me ? " is-me" : ""}${entry.rank <= 3 ? ` is-top is-top-${entry.rank}` : ""}`}>
      <span className="gm-board-rank gm-num">{entry.rank}</span>
      <AccountAvatar url={avatarOf(entry.player)} name={entry.player.name} className="h-9 w-9 rounded-full text-label-large" />
      <div className="gm-board-who">
        <span className="gm-board-name">
          {entry.player.name}
          {entry.me && <span className="gm-chip gm-board-you">{tr("daily.board.me")}</span>}
        </span>
        {game && isGameServer(game.server) && (
          <a className="gm-board-game" href={localizePath(playerPagePath(game.server, game.profileId), locale)} title={tr("daily.board.gameAccount")}>
            <GuessIcon name="game" size={14} />
            <span>{game.name || game.profileId}</span>
          </a>
        )}
      </div>
      <div className="gm-board-score">
        <span className="gm-num">{entry.score}</span>
        <small className="gm-num">{tr("daily.board.detail", { correct: entry.correctCount, time: formatDuration(entry.durationMs) })}</small>
      </div>
    </li>
  );
}

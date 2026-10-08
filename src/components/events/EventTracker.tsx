import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import Typography from "@mui/material/Typography";
import { MdMuiProvider } from "@/components/md3/MuiProvider";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import EventBanner from "@/components/events/EventBanner";
import RankingList, { RankingLoading } from "@/components/music/RankingList";
import PlayerNamecard from "@/components/music/PlayerNamecard";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import { serverAssetUrl } from "@/lib/assets/release";
import { replaceUrl } from "@/lib/browser/history";
import { eventPath } from "@/lib/events/links";
import type { EventViewModel } from "@/lib/events/data";
import {
  GameApiError,
  fetchChallengeRanking,
  fetchCurrentEvent,
  fetchEvent,
  fetchEvents,
  fetchPointRankingLatest,
  type GameApiResponse,
} from "@/lib/game-api/client";
import {
  challengeReadable,
  hasPointRanking,
  missingRanks,
  pointRankingReadable,
  rewardBoundaries,
  type ChallengeRanking,
  type PointRankingLatest,
  type RankdEvent,
} from "@/lib/game-api/events";
import { getEventTrackerHref, parseEventTrackerSearch } from "@/lib/game-api/links";
import { toRankingRows, type DeckCardLookup, type RankingRow } from "@/lib/game-api/music-ranking";
import { formatAge, formatServerSchedule, formatServerTimeInZone } from "@/lib/game-api/server";
import { useGameServer } from "@/lib/game-api/use-game-server";
import { usePollTick } from "@/lib/game-api/use-poll";
import { getRoutePathById } from "@/lib/route/registry";
import { useNow } from "@/lib/schedule/use-now";
import { entityServer, forServer, type ServerFaceted } from "@/lib/servers/facets";
import { ContentServerProvider, useServerAssetUrl } from "@/lib/servers/use-content-server";

/** What a board shows of a song: its title, jacket (server-neutral URL) and band. */
export interface TrackerSong {
  title: string;
  jacketUrl: string;
  bandName: string;
  servers: GameServer[];
}

interface Props {
  locale: AppLocale;
  /** The site's merged events: names and art by id. */
  events: ServerFaceted<EventViewModel>[];
  songs: Record<string, TrackerSong>;
  deckCards: DeckCardLookup;
  servers: GameServer[];
}

type ErrorKind = "pending" | "upstream" | "failed";

type EventLoad =
  | { state: "loading" }
  | { state: "ready"; event: RankdEvent; serverTime: number | null }
  | { state: "none" }
  | { state: "error"; kind: ErrorKind };

/** Challenge boards change every minute or so on rankd's side; the event itself only between phases. */
const BOARD_POLL_MS = 60_000;
const EVENT_POLL_MS = 5 * 60_000;
const LIVE_EVENT = new Set(["feature", "nowOn", "aggregation"]);

function errorKind(error: unknown): ErrorKind {
  return error instanceof GameApiError && (error.kind === "pending" || error.kind === "upstream") ? error.kind : "failed";
}

/**
 * Live event tracker: one server's event (the current one, or `?event=`) with its point ranking and challenge song
 * boards from rankd. `?server=&event=&song=` keep the view shareable.
 */
export default function EventTracker({ locale, events, songs, deckCards, servers }: Props) {
  const [initial] = useState(() => (typeof window === "undefined" ? null : parseEventTrackerSearch(window.location.search)));
  const [server, setServer] = useGameServer(locale, () => initial?.server ?? null);
  const [pinned, setPinned] = useState<string | null>(initial?.event ?? null);
  const [song, setSong] = useState<string | null>(initial?.song ?? null);
  const [catalog, setCatalog] = useState<RankdEvent[]>([]);
  const [load, setLoad] = useState<EventLoad>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const eventTick = usePollTick(load.state === "ready" && LIVE_EVENT.has(load.event.eventStatus) ? EVENT_POLL_MS : null);

  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    setCatalog([]);
    fetchEvents(server, controller.signal).then(setCatalog).catch(() => undefined);
    return () => controller.abort();
  }, [server, attempt]);

  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    const request = pinned ? fetchEvent(server, pinned, controller.signal) : fetchCurrentEvent(server, controller.signal);
    request
      .then((response) => setLoad({ state: "ready", event: response.data, serverTime: response.serverTime }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof GameApiError && error.kind === "not_found") {
          setLoad({ state: "none" });
          return;
        }
        // A refresh that fails keeps the event on screen.
        setLoad((current) => (current.state === "ready" && (!pinned || current.event.eventId === pinned) ? current : { state: "error", kind: errorKind(error) }));
      });
    return () => controller.abort();
  }, [server, pinned, attempt, eventTick]);

  const event = load.state === "ready" ? load.event : null;
  const challenges = event?.challengeRankings ?? [];
  const challenge = challenges.find((entry) => entry.challengeMusicId === song) ?? challenges[0] ?? null;

  useEffect(() => {
    // Wait for the event, or a `?song=` not checked yet would be dropped.
    if (!server || load.state === "loading") return;
    replaceUrl(getEventTrackerHref(locale, { server, event: pinned, song: song && challenge?.challengeMusicId === song ? song : null }));
  }, [locale, server, pinned, song, challenge, load.state]);

  const pickServer = (next: GameServer) => {
    if (next === server) return;
    setServer(next);
    // Event ids are per server.
    setPinned(null);
    setSong(null);
    setLoad({ state: "loading" });
  };

  const pickEvent = (eventId: string | null) => {
    setPinned(eventId);
    setSong(null);
    setLoad({ state: "loading" });
  };

  const eventName = (eventId: string) => {
    const entry = events.find((item) => String(item.id) === eventId);
    return entry && server ? forServer(entry, server).name : t(locale, "eventTracker.eventFallback", { id: eventId });
  };

  return (
    <MdMuiProvider>
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GameServerSwitch locale={locale} value={server} onChange={pickServer} />
        {catalog.length > 1 && (
          <Box sx={{ display: "flex", minWidth: 0, alignItems: "center", gap: 1 }}>
            <Typography variant="caption" component="span" sx={{ flexShrink: 0, fontWeight: 700, color: "var(--md-sys-color-on-surface-variant)" }}>{t(locale, "eventTracker.eventLabel")}</Typography>
            <Select
              size="small"
              value={pinned ?? ""}
              inputProps={{ "aria-label": t(locale, "eventTracker.eventLabel") }}
              onChange={(change) => pickEvent(change.target.value || null)}
              sx={{ minWidth: 0, maxWidth: 288, fontSize: 12, fontWeight: 700 }}
            >
              <MenuItem value="">{t(locale, "eventTracker.currentEvent")}</MenuItem>
              {catalog.map((entry) => (
                <MenuItem key={entry.eventId} value={entry.eventId}>
                  {`${eventName(entry.eventId)} · ${t(locale, `eventTracker.eventStatus.${entry.eventStatus}`)}`}
                </MenuItem>
              ))}
            </Select>
          </Box>
        )}
      </div>

      {load.state === "loading" && (
        <SiriusLoader locale={locale} label={t(locale, "eventTracker.loading")} className="mn-paper min-h-72" />
      )}

      {load.state === "error" && (
        <Notice
          title={t(locale, `music.ranking.errors.${load.kind}`)}
          hint={t(locale, `music.ranking.errors.${load.kind}Hint`)}
          action={<RetryButton locale={locale} onClick={() => setAttempt((value) => value + 1)} />}
        />
      )}

      {load.state === "none" && (
        <Notice
          title={t(locale, pinned ? "eventTracker.notFound" : "eventTracker.noEvent")}
          hint={t(locale, pinned ? "eventTracker.notFoundHint" : "eventTracker.noEventHint")}
          action={pinned ? <RetryButton locale={locale} label={t(locale, "eventTracker.currentEvent")} onClick={() => pickEvent(null)} /> : undefined}
        />
      )}

      {event && server && (
        <>
          <EventHeader
            locale={locale}
            server={server}
            servers={servers}
            event={event}
            entry={events.find((item) => String(item.id) === event.eventId) ?? null}
            name={eventName(event.eventId)}
          />

          <Card variant="outlined" component="section" sx={{ overflow: "hidden" }} aria-labelledby="event-tracker-challenges">
            <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
              <Typography component="h2" id="event-tracker-challenges" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>
                {t(locale, "eventTracker.challenges.title")}
              </Typography>
            </Box>
            {challenges.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "eventTracker.challenges.none")}</p>
            ) : (
              <>
                <SongTabs locale={locale} server={server} challenges={challenges} songs={songs} selected={challenge?.challengeMusicId ?? null} onSelect={setSong} />
                {challenge && (
                  <ChallengeBoard
                    key={`${server}:${event.eventId}:${challenge.challengeMusicId}`}
                    locale={locale}
                    server={server}
                    eventId={event.eventId}
                    challenge={challenge}
                    song={songs[challenge.musicId] ?? null}
                    cards={deckCards}
                    servers={servers}
                  />
                )}
              </>
            )}
          </Card>

          <PointRankingPanel key={`${server}:${event.eventId}`} locale={locale} server={server} event={event} servers={servers} />
        </>
      )}
    </div>
    </MdMuiProvider>
  );
}

function EventHeader({ locale, server, servers, event, entry, name }: {
  locale: AppLocale;
  server: GameServer;
  servers: GameServer[];
  event: RankdEvent;
  entry: ServerFaceted<EventViewModel> | null;
  name: string;
}) {
  const shown = entry ? forServer(entry, server) : null;
  const source = entityServer(entry, server);
  const art = { name, bannerUrl: shown?.bannerUrl ?? "", logoUrl: shown?.logoUrl ?? "", backgroundUrl: shown?.backgroundUrl ?? "" };

  return (
    <Card variant="outlined" sx={{ overflow: "hidden" }}>
      <div className="grid gap-0 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* The banner keeps its 7:3 width inside its column; sized by the row's height it would spill over the text. */}
        <div className="min-w-0 self-center overflow-hidden">
          <ContentServerProvider server={source} servers={servers}>
            <EventBanner event={art} alt={t(locale, "events.bannerAlt", { name })} eager />
          </ContentServerProvider>
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3 p-5 sm:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={event.eventStatus === "nowOn" ? "live" : event.eventStatus === "aggregation" || event.eventStatus === "feature" ? "wait" : "done"}>
              {t(locale, `eventTracker.eventStatus.${event.eventStatus}`)}
            </StatusChip>
            <span className="text-[11px] font-bold tabular-nums text-[var(--md-sys-color-on-surface-variant)]">#{event.eventId}</span>
          </div>
          <Typography component="h2" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 24, sm: 30 }, lineHeight: 1.25, color: "var(--md-sys-color-on-surface)" }}>{name}</Typography>
          <p className="text-xs font-semibold tabular-nums text-[var(--md-sys-color-on-surface-variant)]">
            {formatServerSchedule(event.startAt, event.endAt, server, locale)}
          </p>
          <Countdown locale={locale} event={event} />
          {entry?.servers.includes(server) && (
            <a
              href={localizePath(eventPath(Number(event.eventId)), locale)}
              className="w-fit text-xs font-bold text-[var(--md-sys-color-primary)] underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]"
            >
              {t(locale, "eventTracker.openEvent")}
            </a>
          )}
        </div>
      </div>
    </Card>
  );
}

/** Time left until the next phase: start, end, the end of counting. Local clock; ticks every second. */
function Countdown({ locale, event }: { locale: AppLocale; event: RankdEvent }) {
  const now = useNow(1000);
  if (now === null) return null;
  const countingEnd = event.endAt + (event.aggregationSeconds ?? 0) * 1000;
  const [key, target] = now < event.startAt
    ? ["startsIn", event.startAt] as const
    : now < event.endAt
      ? ["endsIn", event.endAt] as const
      : now < countingEnd
        ? ["countingEndsIn", countingEnd] as const
        : [null, 0] as const;
  if (!key) return null;
  return (
    <p className="text-sm font-bold text-[var(--md-sys-color-on-surface)]">
      {t(locale, `eventTracker.countdown.${key}`)}{" "}
      <span className="tabular-nums text-[var(--md-sys-color-primary)]">{formatDuration(locale, target - now)}</span>
    </p>
  );
}

function formatDuration(locale: AppLocale, ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(total / 86_400);
  const clock = [Math.floor((total % 86_400) / 3600), Math.floor((total % 3600) / 60), total % 60].map((part) => String(part).padStart(2, "0")).join(":");
  return days > 0 ? t(locale, "eventTracker.countdown.daysClock", { days, clock }) : clock;
}

function SongTabs({ locale, server, challenges, songs, selected, onSelect }: {
  locale: AppLocale;
  server: GameServer;
  challenges: ChallengeRanking[];
  songs: Record<string, TrackerSong>;
  selected: string | null;
  onSelect: (challengeMusicId: string) => void;
}) {
  return (
    <div className="flex gap-2 overflow-x-auto border-b border-[var(--md-sys-color-outline-variant)] px-4 py-3 sm:px-6" role="tablist" aria-label={t(locale, "eventTracker.challenges.songs")}>
      {challenges.map((entry, index) => {
        const song = songs[entry.musicId];
        const active = entry.challengeMusicId === selected;
        return (
          <button
            key={entry.challengeMusicId}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(entry.challengeMusicId)}
            className={`flex min-w-[11rem] max-w-[16rem] shrink-0 items-center gap-2.5 rounded-2xl border p-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)] ${
              active
                ? "border-[var(--md-sys-color-primary)] bg-[var(--md-sys-color-primary-container)]"
                : "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-low)] hover:border-[var(--md-sys-color-primary)]"
            }`}
          >
            <SongJacket song={song} server={server} className="h-11 w-11" />
            <span className="min-w-0">
              <span className="block text-[10px] font-black tracking-wider text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "eventTracker.challenges.songNumber", { n: index + 1 })}</span>
              <span className={`block truncate text-sm font-bold ${active ? "text-[var(--md-sys-color-on-primary-container)]" : "text-[var(--md-sys-color-on-surface)]"}`}>
                {song?.title || t(locale, "eventTracker.songFallback", { id: entry.musicId })}
              </span>
              <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
                <StatusDot status={entry.collectStatus} />
                {t(locale, `eventTracker.collect.${entry.collectStatus}`)}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SongJacket({ song, server, className }: { song: TrackerSong | undefined | null; server: GameServer; className: string }) {
  const source = song?.servers.length && !song.servers.includes(server) ? song.servers[0]! : server;
  return song?.jacketUrl ? (
    <img className={`${className} shrink-0 rounded-lg border border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] object-cover`} src={serverAssetUrl(song.jacketUrl, source)} alt="" loading="lazy" />
  ) : (
    <span className={`${className} mn-texture-orbit shrink-0 rounded-lg`} aria-hidden="true" />
  );
}

type BoardLoad =
  | { state: "loading" }
  | { state: "ready"; response: GameApiResponse<unknown>; rows: RankingRow[] }
  | { state: "error"; kind: ErrorKind | "notStarted" | "disabled" | "missed" | "unknown" };

/** One challenge song's board, kept in the game's order and refreshed every minute while collection runs. */
function ChallengeBoard({ locale, server, eventId, challenge, song, cards, servers }: {
  locale: AppLocale;
  server: GameServer;
  eventId: string;
  challenge: ChallengeRanking;
  song: TrackerSong | null;
  cards: DeckCardLookup;
  servers: GameServer[];
}) {
  const readable = challengeReadable(challenge);
  const live = readable && (challenge.collectStatus === "collecting" || challenge.collectStatus === "finalizing");
  const tick = usePollTick(live ? BOARD_POLL_MS : null);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<BoardLoad>({ state: "loading" });
  const assetUrl = useServerAssetUrl(server);

  useEffect(() => {
    if (!readable) return;
    const controller = new AbortController();
    let retry: number | undefined;
    fetchChallengeRanking(server, eventId, challenge.challengeMusicId, controller.signal)
      .then((response) => setLoad({ state: "ready", response, rows: toRankingRows(response.data, "response") }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof GameApiError ? error.kind : "";
        const mapped = kind === "challenge_not_started" ? "notStarted"
          : kind === "challenge_ranking_disabled" ? "disabled"
            : kind === "challenge_not_collected" ? "missed"
              : kind === "challenge_ranking_unknown" ? "unknown"
                : errorKind(error);
        if (mapped === "pending" && attempt === 0) {
          const seconds = error instanceof GameApiError && error.retryAfter ? error.retryAfter : 5;
          retry = window.setTimeout(() => setAttempt((value) => value + 1), Math.min(Math.max(seconds, 2), 15) * 1000);
          return;
        }
        // A failed refresh keeps the last board on screen.
        setLoad((current) => (current.state === "ready" ? current : { state: "error", kind: mapped }));
      });
    return () => {
      controller.abort();
      window.clearTimeout(retry);
    };
  }, [server, eventId, challenge.challengeMusicId, readable, attempt, tick]);

  const boundaries = useMemo(() => rewardBoundaries(challenge), [challenge]);
  const top = load.state === "ready" ? load.rows : [];
  const fetchedAt = load.state === "ready" ? load.response.fetchedAt ?? challenge.lastFetchedAt ?? null : challenge.lastFetchedAt ?? null;
  const serverTime = load.state === "ready" ? load.response.serverTime : null;
  const finalQuality = load.state === "ready" ? load.response.finalQuality : null;
  const stale = load.state === "ready" ? load.response.stale : Boolean(challenge.stale);

  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-2">
        <a href={song ? localizePath(`${getRoutePathById("music")}/${challenge.musicId}`, locale) : undefined} className="group flex min-w-0 items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-sys-color-primary)]">
          <SongJacket song={song} server={server} className="h-14 w-14" />
          <span className="min-w-0">
            <span className="block truncate font-[var(--mn-font-display)] text-lg font-bold text-[var(--md-sys-color-on-surface)] group-hover:text-[var(--md-sys-color-primary)]">
              {song?.title || t(locale, "eventTracker.songFallback", { id: challenge.musicId })}
            </span>
            {song?.bandName && <span className="block truncate text-xs font-semibold text-[var(--md-sys-color-on-surface-variant)]">{song.bandName}</span>}
          </span>
        </a>
        <div className="flex flex-col items-end gap-1 text-right text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
          <span className="flex items-center gap-1.5">
            <StatusDot status={challenge.collectStatus} />
            {t(locale, `eventTracker.collect.${challenge.collectStatus}`)}
          </span>
          {fetchedAt !== null && (
            <span title={formatServerTimeInZone(fetchedAt, server, locale)}>
              {t(locale, "music.ranking.updatedAgo", { time: formatAge(fetchedAt, serverTime ?? Date.now(), locale) })}
              {stale && ` · ${t(locale, "eventTracker.stale")}`}
            </span>
          )}
        </div>
      </div>

      {!readable ? (
        <BoardNotice locale={locale} server={server} challenge={challenge} />
      ) : load.state === "loading" ? (
        <RankingLoading locale={locale} label={t(locale, "music.ranking.loading")} />
      ) : load.state === "error" ? (
        load.kind === "pending" || load.kind === "upstream" || load.kind === "failed" ? (
          <Notice
            compact
            title={t(locale, `music.ranking.errors.${load.kind}`)}
            hint={t(locale, `music.ranking.errors.${load.kind}Hint`)}
            action={<RetryButton locale={locale} onClick={() => setAttempt((value) => value + 1)} />}
          />
        ) : (
          <BoardNotice locale={locale} server={server} challenge={{ ...challenge, collectStatus: load.kind === "notStarted" ? "pending" : load.kind }} />
        )
      ) : top.length === 0 ? (
        <p className="px-2 py-8 text-center text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "music.ranking.empty")}</p>
      ) : (
        <RankingList locale={locale} rows={top} cards={cards} assetUrl={assetUrl} boundaries={boundaries} server={server} />
      )}

      {finalQuality === "lastSeen" && (
        <p className="mt-4 border-t border-[var(--md-sys-color-outline-variant)] px-2 pt-3 text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">
          {t(locale, "eventTracker.challenges.lastSeen")}
        </p>
      )}
    </div>
  );
}

function BoardNotice({ locale, server, challenge }: { locale: AppLocale; server: GameServer; challenge: ChallengeRanking }) {
  const key = challenge.rankingEnabled ? challenge.collectStatus : "disabled";
  const start = challenge.effectiveStartAt;
  return (
    <Notice
      compact
      title={t(locale, `eventTracker.board.${key === "collecting" || key === "finalizing" || key === "archived" ? "pending" : key}`)}
      hint={key === "pending" && start ? t(locale, "eventTracker.board.startsAt", { time: formatServerTimeInZone(start, server, locale) }) : ""}
    />
  );
}

/** The point ranking's latest top list; most early events have none, and then this says so. */
function PointRankingPanel({ locale, server, event, servers }: { locale: AppLocale; server: GameServer; event: RankdEvent; servers: GameServer[] }) {
  const enabled = hasPointRanking(event);
  const readable = pointRankingReadable(event);
  const status = event.pointRanking?.collectStatus ?? event.collectStatus;
  const live = readable && (status === "collecting" || status === "finalizing" || status === "archiving");
  const tick = usePollTick(live ? BOARD_POLL_MS : null);
  const [latest, setLatest] = useState<GameApiResponse<PointRankingLatest> | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!readable) return;
    const controller = new AbortController();
    fetchPointRankingLatest(server, event.eventId, controller.signal)
      .then((response) => {
        setLatest(response);
        setFailed(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [server, event.eventId, readable, tick]);

  const numbers = new Intl.NumberFormat(locale);
  const data = latest?.data;
  const rows = (data?.rows ?? []).slice(0, 100);
  const missing = data ? missingRanks(data) : [];

  return (
    <Card variant="outlined" component="section" sx={{ overflow: "hidden" }} aria-labelledby="event-tracker-points">
      <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 1.5, borderBottom: "1px solid var(--md-sys-color-outline-variant)", px: 3, py: 2 }}>
        <Typography component="h2" id="event-tracker-points" sx={{ fontFamily: "var(--mn-font-display)", fontSize: { xs: 20, sm: 24 }, color: "var(--md-sys-color-on-surface)" }}>{t(locale, "eventTracker.points.title")}</Typography>
        {enabled && (
          <span className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
            <StatusDot status={status} />
            {t(locale, `eventTracker.collect.${status}`)}
          </span>
        )}
      </Box>
      <div className="px-4 py-4 sm:px-6">
        {!enabled ? (
          <p className="px-2 py-4 text-sm leading-7 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "eventTracker.points.disabled")}</p>
        ) : !readable ? (
          <p className="px-2 py-4 text-sm leading-7 text-[var(--md-sys-color-on-surface-variant)]">{t(locale, `eventTracker.board.${status === "missed" ? "missed" : "pending"}`)}</p>
        ) : !data ? (
          failed
            ? <p className="px-2 py-4 text-sm font-semibold text-[var(--md-sys-color-on-surface-variant)]">{t(locale, "music.ranking.errors.failed")}</p>
            : <RankingLoading locale={locale} label={t(locale, "music.ranking.loading")} />
        ) : (
          <>
            <p className="mb-3 px-2 text-right text-[11px] font-semibold text-[var(--md-sys-color-on-surface-variant)]">
              {t(locale, "music.ranking.updatedAgo", { time: formatAge(data.updatedAt, latest.serverTime ?? Date.now(), locale) })}
              {data.stale && ` · ${t(locale, "eventTracker.points.interrupted")}`}
              {data.frozen && ` · ${t(locale, "eventTracker.points.frozen")}`}
            </p>
            <ol className="divide-y divide-dashed divide-[var(--md-sys-color-outline-variant)]/50">
              {rows.map((row, index) => {
                const profile = row.profile;
                const thumbnails = profile?.profileCard?.thumbnailUrl;
                const namecardImages = Array.isArray(thumbnails) ? thumbnails.length : 0;
                return (
                  <li key={`${row.rank}:${profile?.id ?? index}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-2 py-2">
                    <span className={`text-base font-black tabular-nums ${row.rank <= 3 ? "text-[var(--md-sys-color-primary)]" : "text-[var(--md-sys-color-on-surface)]"}`}>
                      {numbers.format(row.rank)}
                      {row.dup && <span className="ml-0.5 align-top text-[9px] font-bold text-[var(--md-sys-color-on-surface-variant)]" title={t(locale, "eventTracker.points.tied")}>=</span>}
                    </span>
                    <span className="flex min-w-0 items-center gap-2">
                      {profile && namecardImages > 0 && (
                        <PlayerNamecard
                          server={server}
                          profileId={profile.profileId}
                          images={namecardImages}
                          playerName={profile.name ?? ""}
                          variant="thumbnail"
                          useRankingApi={true}
                        />
                      )}
                      <span className="truncate text-sm font-bold text-[var(--md-sys-color-on-surface)]">{profile?.name ?? ""}</span>
                    </span>
                    <span className="text-right text-sm font-black tabular-nums text-[var(--md-sys-color-on-surface)]">{numbers.format(row.point)}</span>
                  </li>
                );
              })}
            </ol>
            {missing.length > 0 && (
              <p className="mt-3 px-2 text-xs text-[var(--md-sys-color-on-surface-variant)]">
                {t(locale, "eventTracker.points.notReturned", { ranks: missing.map((rank) => numbers.format(rank)).join(", ") })}
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

const dotTone: Record<string, string> = {
  collecting: "bg-[var(--md-sys-color-primary)] animate-pulse",
  finalizing: "bg-[var(--md-sys-color-secondary)]",
  archiving: "bg-[var(--md-sys-color-secondary)]",
  archived: "bg-[var(--md-sys-color-on-surface-variant)]",
  pending: "bg-[var(--md-sys-color-tertiary)]",
};

function StatusDot({ status }: { status: string }) {
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotTone[status] ?? "bg-[var(--md-sys-color-outline-variant)]"}`} aria-hidden="true" />;
}

const chipTone = {
  live: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-primary-container)] text-[var(--md-sys-color-on-primary-container)]",
  wait: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-tertiary-container)] text-[var(--md-sys-color-on-tertiary-container)]",
  done: "border-[var(--md-sys-color-outline-variant)] bg-[var(--md-sys-color-surface-container-high)] text-[var(--md-sys-color-on-surface-variant)]",
};

function StatusChip({ tone, children }: { tone: keyof typeof chipTone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-bold leading-none ${chipTone[tone]}`}>
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
      {children}
    </span>
  );
}

function Notice({ title, hint, action, compact = false }: { title: string; hint?: string; action?: ReactNode; compact?: boolean }) {
  const body = (
    <>
      <p className={compact ? "text-sm font-bold text-[var(--md-sys-color-on-surface)]" : "font-[var(--mn-font-display)] text-xl text-[var(--md-sys-color-on-surface)]"}>{title}</p>
      {hint && <p className="mx-auto mt-2 max-w-lg text-xs leading-6 text-[var(--md-sys-color-on-surface-variant)]">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </>
  );
  return compact ? (
    <div className="px-2 py-8 text-center" role="status">{body}</div>
  ) : (
    <Card variant="outlined" sx={{ p: 4, textAlign: "center" }} role="status">{body}</Card>
  );
}

function RetryButton({ locale, onClick, label }: { locale: AppLocale; onClick: () => void; label?: string }) {
  return (
    <Button variant="outlined" size="small" onClick={onClick}>
      {label ?? t(locale, "music.ranking.retry")}
    </Button>
  );
}

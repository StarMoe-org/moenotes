"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { AppLocale } from "@/config/locales";
import type { GameServer } from "@/config/servers";
import { t } from "@/i18n";
import { moveReleaseUrls } from "@/lib/assets/release";
import { createGameState, gameReducer } from "@/lib/guess-music/game";
import { buildSongLibrary } from "@/lib/guess-music/pool";
import { createPracticeApi, type PracticeInstrumentals } from "@/lib/guess-music/practice-client";
import { createSeed } from "@/lib/guess-music/random";
import { buildRounds, requiredPoolSize } from "@/lib/guess-music/rounds";
import {
  SETTINGS_PARAMS,
  defaultSettings,
  detectPreset,
  hasSettingsParams,
  parseServerParam,
  parseSettingsParams,
  sanitizeSeed,
  settingsToParams,
  type FreePlaySettings,
  type PresetId,
} from "@/lib/guess-music/settings";
import type { GuessSong } from "@/lib/guess-music/songs";
import { useContentServer } from "@/lib/servers/use-content-server";
import { listForServer, type ServerFaceted } from "@/lib/servers/facets";
import { showToast } from "@/lib/toast/toast";
import FreePlayGame from "./FreePlayGame";
import FreePlayResults from "./FreePlayResults";
import FreePlaySetup from "./FreePlaySetup";

export interface FreePlayToolProps {
  locale: AppLocale;
  songs: ServerFaceted<GuessSong>[];
  servers: GameServer[];
  /** A game is on screen: the page hides its tabs. */
  onPlayingChange: (playing: boolean) => void;
}

function shareUrlFor(settings: FreePlaySettings, server: GameServer): string {
  return `${window.location.origin}${window.location.pathname}?${settingsToParams(settings, server).toString()}`;
}

/** Which songs vocal removal can play, asked for the first time it is turned on. */
type Instrumentals = { status: "idle" | "loading" | "failed" } | { status: "ready"; list: PracticeInstrumentals };

/**
 * Guess the song, free play: setup, the game and its results. It runs in the browser and plays the full tracks of the
 * asset service; only vocal removal asks the server, for clips cut from its private instrumentals. A share link
 * carries the settings and the server, so a friend gets the same questions.
 */
export default function FreePlayTool({ locale, songs, servers, onPlayingChange }: FreePlayToolProps) {
  const tr = (key: string, params?: Record<string, string | number>) => t(locale, `guessMusic.${key}`, params);
  // The static HTML knows neither the address nor the clock: settings, seed and pool are filled in once mounted.
  const [{ settings, preset }, setSetup] = useState<{ settings: FreePlaySettings; preset: PresetId }>(() => {
    const settings = defaultSettings("");
    return { settings, preset: detectPreset(settings) };
  });
  const [now, setNow] = useState<number | null>(null);
  const [contentServer, pickServer] = useContentServer(locale, servers);
  /** The server a share link named; it wins over the reader's setting until they pick one. */
  const [linkServer, setLinkServer] = useState<GameServer | null>(null);
  const server = linkServer ?? contentServer;
  const [state, dispatch] = useReducer(gameReducer, undefined, createGameState);
  const practice = useMemo(() => createPracticeApi(), []);
  const [instrumentals, setInstrumentals] = useState<Instrumentals>({ status: "idle" });
  const instrumentalsAsked = useRef(false);
  /** Asks once which songs have an instrumental; a failure is asked again the next time vocal removal is turned on. */
  const askInstrumentals = useCallback(() => {
    if (instrumentalsAsked.current) return;
    instrumentalsAsked.current = true;
    setInstrumentals({ status: "loading" });
    practice.instrumentals().then(
      (list) => setInstrumentals({ status: "ready", list }),
      () => {
        instrumentalsAsked.current = false;
        setInstrumentals({ status: "failed" });
      },
    );
  }, [practice]);
  const playing = state.phase === "playing";
  useEffect(() => onPlayingChange(playing), [playing, onPlayingChange]);
  useEffect(() => () => onPlayingChange(false), [onPlayingChange]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fallback = defaultSettings(createSeed());
    const restored = hasSettingsParams(params) ? parseSettingsParams(params, fallback) : fallback;
    setSetup({ settings: restored, preset: detectPreset(restored) });
    setLinkServer(parseServerParam(params, servers));
    setNow(Date.now());
    if (restored.vocalRemoval) askInstrumentals();
  }, [servers, askInstrumentals]);

  // Keep the settings in the address bar, so a reload or a copied URL restores them.
  useEffect(() => {
    if (now === null || !settings.seed) return;
    const url = new URL(window.location.href);
    for (const name of SETTINGS_PARAMS) url.searchParams.delete(name);
    settingsToParams(settings, server).forEach((value, name) => url.searchParams.set(name, value));
    window.history.replaceState(window.history.state, "", url.toString());
  }, [now, settings, server]);

  // A game keeps the songs it started with; a server change only applies to the next one.
  const library = useMemo(() => {
    if (now === null) return null;
    const items = listForServer(songs, server).map((song) => moveReleaseUrls(song, server));
    return buildSongLibrary(items, now);
  }, [songs, server, now]);
  const [gameLibrary, setGameLibrary] = useState(library);

  // With vocal removal the questions come from the songs that have an instrumental; any song is still an answer.
  const vocalServer = instrumentals.status === "ready" ? instrumentals.list.server : null;
  const pool = useMemo(() => {
    if (!library || !settings.vocalRemoval) return library?.pool ?? null;
    if (instrumentals.status !== "ready" || instrumentals.list.server !== server) return null;
    const ids = new Set(instrumentals.list.musicIds);
    return library.pool.filter((song) => ids.has(song.id));
  }, [library, settings.vocalRemoval, instrumentals, server]);

  const optionsFor = (value: FreePlaySettings) => (value.answerMode === "choice" ? value.optionsCount : 0);
  const startError = !library
    ? tr("setup.loading")
    : settings.vocalRemoval && instrumentals.status !== "ready"
      ? tr(instrumentals.status === "failed" ? "setup.vocalUnavailable" : "setup.vocalLoading")
      : settings.vocalRemoval && (!vocalServer || (instrumentals.status === "ready" && !instrumentals.list.available))
        ? tr("setup.vocalUnavailable")
        : settings.vocalRemoval && vocalServer !== server
          ? tr("setup.vocalServer", { server: t(locale, `gameServer.names.${vocalServer}`) })
          : !pool || pool.length < requiredPoolSize(settings.rounds, optionsFor(settings))
            ? tr("setup.poolTooSmall")
            : null;

  const start = (base: FreePlaySettings) => {
    if (!library || !pool || startError) return;
    const seed = sanitizeSeed(base.seed) || createSeed();
    const next = seed === base.seed ? base : { ...base, seed };
    const rounds = buildRounds(pool, { seed: next.seed, rounds: next.rounds, optionsCount: optionsFor(next) });
    if (!rounds.length) return;
    if (next !== base) setSetup((current) => ({ ...current, settings: next }));
    setGameLibrary(library);
    dispatch({
      type: "start",
      rounds,
      config: { clipSeconds: next.clipSeconds, answerMode: next.answerMode, vocalRemoval: next.vocalRemoval, timeLimit: next.timeLimit, seed: next.seed },
    });
    window.scrollTo({ top: 0 });
  };

  const copyShareLink = () => {
    const fail = () => showToast({ id: "guess-music-share", title: tr("results.copyFailed"), icon: "warning", durationMs: 3000 });
    if (!navigator.clipboard) {
      fail();
      return;
    }
    navigator.clipboard.writeText(shareUrlFor(settings, server)).then(
      () => showToast({ id: "guess-music-share", title: tr("results.linkCopied"), icon: "success", durationMs: 2500 }),
      fail,
    );
  };

  const changeServer = useCallback((next: GameServer) => {
    setLinkServer(null);
    pickServer(next);
  }, [pickServer]);

  const quit = () => dispatch({ type: "quit" });

  return (
    <>
      {state.phase === "playing" && gameLibrary ? (
        <FreePlayGame locale={locale} state={state} dispatch={dispatch} library={gameLibrary} practice={practice} onQuit={quit} />
      ) : state.phase === "finished" && gameLibrary ? (
        <FreePlayResults
          locale={locale}
          state={state}
          settings={settings}
          preset={preset}
          server={server}
          library={gameLibrary}
          onCopyLink={copyShareLink}
          onReplay={() => start(settings)}
          onNewGame={() => {
            const next = { ...settings, seed: createSeed() };
            setSetup((current) => ({ ...current, settings: next }));
            start(next);
          }}
          onBackToSetup={quit}
        />
      ) : (
        <FreePlaySetup
          locale={locale}
          settings={settings}
          preset={preset}
          onChange={(nextSettings, nextPreset) => {
            setSetup({ settings: nextSettings, preset: nextPreset });
            if (nextSettings.vocalRemoval) askInstrumentals();
          }}
          server={server}
          servers={servers}
          onServerChange={changeServer}
          songCount={pool?.length ?? 0}
          startError={startError}
          onStart={() => start(settings)}
          onShare={copyShareLink}
        />
      )}
    </>
  );
}

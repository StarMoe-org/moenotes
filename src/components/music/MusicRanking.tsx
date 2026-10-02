import { useEffect, useRef, useState } from "react";
import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { PRIMARY_SERVER } from "@/config/servers";
import { t } from "@/i18n";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import RankingList, { RankingSkeleton } from "@/components/music/RankingList";
import { GameApiError, fetchMusicRanking } from "@/lib/game-api/client";
import { toRankingRows, type DeckCardLookup, type RankingRow } from "@/lib/game-api/music-ranking";
import { formatAge } from "@/lib/game-api/server";
import { useGameServer } from "@/lib/game-api/use-game-server";
import { useServerAssetUrl } from "@/lib/servers/use-content-server";

interface Props {
  locale: AppLocale;
  musicId: number;
  cards: DeckCardLookup;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; server: GameServer; rows: RankingRow[]; fetchedAt: number | null; serverTime: number | null; stale: boolean }
  | { state: "error"; kind: "pending" | "upstream" | "failed" };

/** rankd answers `pending` while the song waits in its queue; one automatic retry covers the usual wait. */
const AUTO_RETRIES = 1;

/**
 * The song's high-score ranking on one game server, from rankd. It loads once the block scrolls near the
 * viewport: most visitors of a song page never look at it.
 */
export default function MusicRanking({ locale, musicId, cards }: Props) {
  const rootRef = useRef<HTMLElement | null>(null);
  const [server, setServer] = useGameServer(locale);
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<Load>({ state: "loading" });

  useEffect(() => {
    const node = rootRef.current;
    if (!node || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: "300px 0px" });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!server || !visible) return;
    const controller = new AbortController();
    let retryTimer: number | undefined;
    setLoad({ state: "loading" });
    fetchMusicRanking(server, musicId, controller.signal)
      .then((response) => setLoad({
        state: "ready",
        server,
        rows: toRankingRows(response.data),
        fetchedAt: response.fetchedAt,
        serverTime: response.serverTime,
        stale: response.stale,
      }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof GameApiError && (error.kind === "pending" || error.kind === "upstream") ? error.kind : "failed";
        if (kind === "pending" && attempt < AUTO_RETRIES) {
          const seconds = error instanceof GameApiError && error.retryAfter ? error.retryAfter : 5;
          retryTimer = window.setTimeout(() => setAttempt((value) => value + 1), Math.min(Math.max(seconds, 2), 15) * 1000);
          return;
        }
        setLoad({ state: "error", kind });
      });
    return () => {
      controller.abort();
      window.clearTimeout(retryTimer);
    };
  }, [server, visible, musicId, attempt]);

  const pickServer = (next: GameServer) => {
    setServer(next);
    setAttempt(0);
  };

  const rows = load.state === "ready" ? load.rows : [];
  // Deck cards show from the catalog of the ranking's server, which has every card its players own.
  const assetUrl = useServerAssetUrl(load.state === "ready" ? load.server : server ?? PRIMARY_SERVER);

  return (
    <section ref={rootRef} className="mn-paper overflow-hidden" aria-labelledby="music-ranking-title">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--mn-border)] bg-gradient-to-r from-[color-mix(in_oklab,var(--mn-accent)_6%,transparent)] to-transparent px-6 py-4 sm:px-8">
        <h3 id="music-ranking-title" className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)] sm:text-2xl">
          {t(locale, "music.ranking.title")}
        </h3>
        <GameServerSwitch locale={locale} value={server} onChange={pickServer} />
      </div>

      <div className="px-4 py-4 sm:px-6">
        {load.state === "ready" && load.fetchedAt !== null && (
          <p className="mb-3 px-2 text-right text-[11px] font-semibold text-[var(--mn-text-muted)]" title={new Date(load.fetchedAt).toLocaleString(locale)}>
            {t(locale, "music.ranking.updatedAgo", { time: formatAge(load.fetchedAt, load.serverTime ?? load.fetchedAt, locale) })}
            {load.stale && ` · ${t(locale, "music.ranking.refreshing")}`}
          </p>
        )}

        {load.state === "loading" && <RankingSkeleton label={t(locale, "music.ranking.loading")} />}

        {load.state === "error" && (
          <div className="px-2 py-8 text-center" role="status">
            <p className="text-sm font-bold text-[var(--mn-text)]">{t(locale, `music.ranking.errors.${load.kind}`)}</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-6 text-[var(--mn-text-muted)]">{t(locale, `music.ranking.errors.${load.kind}Hint`)}</p>
            <button
              type="button"
              onClick={() => setAttempt((value) => value + 1)}
              className="mn-focus mn-stamp-press mt-4 rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2 text-xs font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]"
            >
              {t(locale, "music.ranking.retry")}
            </button>
          </div>
        )}

        {load.state === "ready" && rows.length === 0 && (
          <p className="px-2 py-8 text-center text-sm font-semibold text-[var(--mn-text-muted)]">{t(locale, "music.ranking.empty")}</p>
        )}

        {rows.length > 0 && load.state === "ready" && <RankingList key={load.server} locale={locale} rows={rows} cards={cards} assetUrl={assetUrl} server={load.server} />}
      </div>
    </section>
  );
}

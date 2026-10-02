import SiriusLoader from "@/components/shared/SiriusLoader";
import { useEffect, useMemo, useState } from "react";
import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import GameServerSwitch from "@/components/shared/GameServerSwitch";
import NewsCategoryBadge from "@/components/news/NewsCategoryBadge";
import {
  NEWS_CATEGORIES,
  isUpdatedSinceSeen,
  listAnnouncements,
  newsCategory,
  seenAnnouncements,
  type Announcement,
  type NewsCategory,
} from "@/lib/game-api/announcements";
import { GameApiError, fetchAnnouncements } from "@/lib/game-api/client";
import { formatAge, formatServerSchedule, isGameServer, parseGameSeconds } from "@/lib/game-api/server";
import { useGameServer } from "@/lib/game-api/use-game-server";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  locale: AppLocale;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; items: Announcement[]; fetchedAt: number | null; serverTime: number | null; stale: boolean }
  | { state: "error"; kind: "pending" | "upstream" | "failed" };

type Filter = "all" | NewsCategory;

/** In-game announcements of one server, from rankd; `?server=` picks the server so links can name one. */
export default function NewsExplorer({ locale }: Props) {
  const [server, setServer] = useGameServer(locale, () => {
    const requested = new URLSearchParams(window.location.search).get("server");
    return isGameServer(requested) ? requested : null;
  });
  const [filter, setFilter] = useState<Filter>("all");
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [seen, setSeen] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!server) return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    setSeen(seenAnnouncements(server));
    fetchAnnouncements(server, controller.signal)
      .then((response) => setLoad({
        state: "ready",
        items: listAnnouncements(response.data),
        fetchedAt: response.fetchedAt,
        serverTime: response.serverTime,
        stale: response.stale,
      }))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setLoad({ state: "error", kind: error instanceof GameApiError && (error.kind === "pending" || error.kind === "upstream") ? error.kind : "failed" });
      });
    return () => controller.abort();
  }, [server, attempt]);

  const pickServer = (next: GameServer) => {
    setServer(next);
    setFilter("all");
    const url = new URL(window.location.href);
    url.searchParams.set("server", next);
    window.history.replaceState(window.history.state, "", url);
  };

  const items = load.state === "ready" ? load.items : [];
  const counts = useMemo(() => {
    const result = new Map<NewsCategory, number>();
    for (const item of items) result.set(newsCategory(item.category), (result.get(newsCategory(item.category)) ?? 0) + 1);
    return result;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((item) => newsCategory(item.category) === filter);
  const detailPath = localizePath(getRoutePathById("news-detail"), locale);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <GameServerSwitch locale={locale} value={server} onChange={pickServer} />
        {load.state === "ready" && load.fetchedAt !== null && (
          <span className="text-[11px] font-semibold text-[var(--mn-text-muted)]">
            {t(locale, "news.checkedAgo", { time: formatAge(load.fetchedAt, load.serverTime ?? load.fetchedAt, locale) })}
          </span>
        )}
      </div>

      {load.state === "ready" && items.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label={t(locale, "news.categoryLabel")}>
          {(["all", ...NEWS_CATEGORIES] as const).filter((key) => key === "all" || counts.has(key)).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              aria-pressed={filter === key}
              className={`mn-focus rounded-full border px-3 py-1 text-xs font-bold transition ${
                filter === key
                  ? "border-[var(--mn-accent)] bg-[var(--mn-accent-soft)] text-[var(--mn-accent-deep)]"
                  : "border-[var(--mn-border)] bg-[var(--mn-paper)] text-[var(--mn-text-muted)] hover:text-[var(--mn-text)]"
              }`}
            >
              {t(locale, `news.category.${key}`)}
              <span className="ml-1.5 font-mono opacity-70">{key === "all" ? items.length : counts.get(key)}</span>
            </button>
          ))}
        </div>
      )}

      {load.state === "loading" && (
        <SiriusLoader locale={locale} label={t(locale, "news.loading")} className="mn-paper min-h-72" />
      )}

      {load.state === "error" && (
        <div className="mn-paper p-8 text-center" role="alert">
          <p className="font-[var(--mn-font-display)] text-xl text-[var(--mn-text)]">{t(locale, `news.errors.${load.kind}`)}</p>
          <p className="mx-auto mt-2 max-w-lg text-sm leading-7 text-[var(--mn-text-muted)]">{t(locale, `news.errors.${load.kind}Hint`)}</p>
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mn-focus mn-stamp-press mt-5 rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-6 py-2.5 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
          >
            {t(locale, "news.retry")}
          </button>
        </div>
      )}

      {load.state === "ready" && items.length === 0 && (
        <div className="mn-paper p-8 text-center text-sm font-semibold text-[var(--mn-text-muted)]">{t(locale, "news.empty")}</div>
      )}

      {server && shown.length > 0 && (
        <ul className="grid gap-3">
          {shown.map((item) => (
            <li key={item.id}>
              <NewsListItem
                locale={locale}
                server={server}
                item={item}
                href={`${detailPath}?${new URLSearchParams({ server, id: item.id })}`}
                updated={isUpdatedSinceSeen(item, seen)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewsListItem({ locale, server, item, href, updated }: { locale: AppLocale; server: GameServer; item: Announcement; href: string; updated: boolean }) {
  const start = parseGameSeconds(item.startAt);
  const end = parseGameSeconds(item.endAt);
  const [bannerFailed, setBannerFailed] = useState(false);
  return (
    <a href={href} className="mn-paper mn-focus group flex gap-4 overflow-hidden p-3 transition hover:-translate-y-0.5 sm:p-4">
      {item.bannerUrl && !bannerFailed && (
        <img
          className="hidden aspect-[2/1] w-44 shrink-0 rounded-xl border border-[var(--mn-border)] object-cover sm:block"
          src={item.bannerUrl}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => setBannerFailed(true)}
        />
      )}
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <NewsCategoryBadge locale={locale} category={newsCategory(item.category)} />
          {updated && (
            <span className="rounded-full bg-[var(--mn-pink-soft)] px-2 py-0.5 text-[10px] font-black text-[var(--mn-ink-soft)]">{t(locale, "news.updated")}</span>
          )}
        </div>
        <p className="text-sm font-bold leading-6 text-[var(--mn-text)] group-hover:text-[var(--mn-accent-deep)] sm:text-base">{item.title}</p>
        {start !== null && (
          <p className="text-[11px] font-semibold text-[var(--mn-text-muted)]">
            {formatServerSchedule(start, end, server, locale)}
          </p>
        )}
      </div>
    </a>
  );
}

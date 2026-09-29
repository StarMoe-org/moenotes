import { useEffect, useState } from "react";
import type { GameServer } from "@/config/game-api";
import type { AppLocale } from "@/config/locales";
import { siteConfig } from "@/config/site";
import { t } from "@/i18n";
import { localizePath } from "@/i18n/routing";
import NewsCategoryBadge from "@/components/news/NewsCategoryBadge";
import ServerFlag from "@/components/shared/ServerFlag";
import { announcementSrcdoc, markAnnouncementSeen, newsCategory, type Announcement } from "@/lib/game-api/announcements";
import { GameApiError, fetchAnnouncement, fetchAnnouncementRevisions } from "@/lib/game-api/client";
import { formatServerSchedule, formatServerTimeInZone, isGameServer, parseGameSeconds } from "@/lib/game-api/server";
import { getRoutePathById } from "@/lib/route/registry";

interface Props {
  locale: AppLocale;
}

interface Target {
  server: GameServer;
  id: string;
  revision: string | null;
}

type Load =
  | { state: "loading" }
  | { state: "ready"; announcement: Announcement; revision: string | null; listed: boolean }
  | { state: "error"; kind: "not_found" | "pending" | "upstream" | "failed" };

/**
 * One announcement, picked by `?server=&id=` (and `&rev=` for an older version). The body is the game's own
 * HTML document and is shown only inside a sandboxed iframe without any allow flag: no scripts, no same-origin
 * access, no forms, no popups. It never enters this page's DOM.
 */
export default function NewsDetail({ locale }: Props) {
  const [target, setTarget] = useState<Target | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [load, setLoad] = useState<Load>({ state: "loading" });
  const [revisions, setRevisions] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const server = params.get("server");
    const id = params.get("id");
    const revision = params.get("rev");
    if (!isGameServer(server) || !id || !/^\d+$/.test(id) || (revision !== null && !/^\d+$/.test(revision))) {
      setInvalid(true);
      return;
    }
    setTarget({ server, id, revision });
  }, []);

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    fetchAnnouncementRevisions(target.server, target.id, controller.signal).then(setRevisions, () => setRevisions([]));
    return () => controller.abort();
  }, [target?.server, target?.id]);

  useEffect(() => {
    if (!target) return;
    const controller = new AbortController();
    setLoad({ state: "loading" });
    fetchAnnouncement(target.server, target.id, target.revision ?? undefined, controller.signal)
      .then((response) => {
        const announcement = response.data.announcement;
        if (!announcement) {
          setLoad({ state: "error", kind: "not_found" });
          return;
        }
        const revision = response.revision ?? announcement.lastUpdatedAt ?? null;
        setLoad({ state: "ready", announcement, revision, listed: response.listed });
        if (announcement.title) document.title = siteConfig.titleTemplate.replace("%s", announcement.title);
        if (!target.revision && revision) markAnnouncementSeen(target.server, target.id, revision);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const kind = error instanceof GameApiError && (error.kind === "not_found" || error.kind === "pending" || error.kind === "upstream") ? error.kind : "failed";
        setLoad({ state: "error", kind });
      });
    return () => controller.abort();
  }, [target, attempt]);

  const pickRevision = (revision: string) => {
    if (!target) return;
    const latest = revision === revisions[0];
    const url = new URL(window.location.href);
    if (latest) url.searchParams.delete("rev");
    else url.searchParams.set("rev", revision);
    window.history.replaceState(window.history.state, "", url);
    setTarget({ ...target, revision: latest ? null : revision });
  };

  const listHref = `${localizePath(getRoutePathById("news"), locale)}${target ? `?${new URLSearchParams({ server: target.server })}` : ""}`;
  const back = (
    <a href={listHref} className="mn-focus mn-stamp-press inline-flex rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-5 py-2.5 text-sm font-bold text-[var(--mn-text)] shadow-[var(--mn-shadow-stamp)]">
      {t(locale, "news.backToList")}
    </a>
  );

  if (invalid || (load.state === "error" && load.kind === "not_found")) {
    return (
      <div className="mn-paper p-8 text-center sm:p-12" role="alert">
        <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, "news.notFound")}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, "news.notFoundHint")}</p>
        <div className="mt-6 flex justify-center">{back}</div>
      </div>
    );
  }

  if (load.state === "error") {
    return (
      <div className="mn-paper p-8 text-center sm:p-12" role="alert">
        <h2 className="font-[var(--mn-font-display)] text-2xl text-[var(--mn-text)]">{t(locale, `news.errors.${load.kind}`)}</h2>
        <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-7 text-[var(--mn-text-muted)]">{t(locale, `news.errors.${load.kind}Hint`)}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={() => setAttempt((value) => value + 1)}
            className="mn-focus mn-stamp-press rounded-full border border-[var(--mn-border)] bg-[var(--mn-accent-deep)] px-5 py-2.5 text-sm font-bold text-[var(--mn-paper)] shadow-[var(--mn-shadow-stamp)]"
          >
            {t(locale, "news.retry")}
          </button>
          {back}
        </div>
      </div>
    );
  }

  if (load.state === "loading" || !target) {
    return (
      <div className="space-y-4" role="status" aria-label={t(locale, "news.loading")}>
        <div className="mn-paper h-28 animate-pulse" />
        <div className="mn-paper h-[60vh] animate-pulse" />
      </div>
    );
  }

  const { announcement, revision, listed } = load;
  const start = parseGameSeconds(announcement.startAt);
  const end = parseGameSeconds(announcement.endAt);
  const updatedAt = parseGameSeconds(revision ?? undefined);
  const olderVersion = revision !== null && revisions.length > 0 && revision !== revisions[0];

  return (
    <article className="space-y-5">
      <header className="mn-paper space-y-3 p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <NewsCategoryBadge locale={locale} category={newsCategory(announcement.category)} />
          <span className="flex items-center gap-1.5 rounded-full border border-[var(--mn-border)] px-2.5 py-0.5 text-[10px] font-black text-[var(--mn-text-muted)]">
            <ServerFlag server={target.server} className="h-3.5 w-3.5" />
            {t(locale, `gameServer.names.${target.server}`)}
          </span>
          {!listed && <span className="rounded-full border border-dashed border-[var(--mn-border)] bg-[var(--mn-cream-deep)] px-2.5 py-0.5 text-[10px] font-black text-[var(--mn-text-muted)]">{t(locale, "news.withdrawn")}</span>}
          {olderVersion && <span className="rounded-full border border-dashed border-[var(--mn-border)] bg-[var(--mn-cream-deep)] px-2.5 py-0.5 text-[10px] font-black text-[var(--mn-text-muted)]">{t(locale, "news.olderVersion")}</span>}
        </div>
        <h2 className="font-[var(--mn-font-display)] text-2xl leading-snug text-[var(--mn-text)] sm:text-3xl">{announcement.title}</h2>
        <dl className="grid gap-x-6 gap-y-1 text-xs font-semibold text-[var(--mn-text-muted)] sm:grid-cols-[auto_1fr]">
          {start !== null && (
            <>
              <dt>{t(locale, "news.period")}</dt>
              <dd className="text-[var(--mn-text)]">
                {formatServerSchedule(start, end, target.server, locale)}
              </dd>
            </>
          )}
          {updatedAt !== null && (
            <>
              <dt>{t(locale, "news.lastUpdated")}</dt>
              <dd className="text-[var(--mn-text)]">{formatServerTimeInZone(updatedAt, target.server, locale)}</dd>
            </>
          )}
        </dl>

        {revisions.length > 1 && (
          <label className="flex flex-wrap items-center gap-2 text-xs font-bold text-[var(--mn-text)]">
            <span>{t(locale, "news.history")}</span>
            <select
              className="mn-focus rounded-full border border-[var(--mn-border)] bg-[var(--mn-paper)] px-3 py-1.5 text-xs font-semibold"
              value={revision ?? revisions[0]}
              onChange={(event) => pickRevision(event.target.value)}
            >
              {revisions.map((value, index) => {
                const time = parseGameSeconds(value);
                const label = time !== null ? formatServerTimeInZone(time, target.server, locale) : value;
                return (
                  <option key={value} value={value}>
                    {index === 0 ? t(locale, "news.latestRevision", { time: label }) : label}
                  </option>
                );
              })}
            </select>
          </label>
        )}
      </header>

      {announcement.body ? (
        <iframe
          key={revision ?? "latest"}
          title={announcement.title ?? t(locale, "news.detailTitle")}
          sandbox=""
          srcDoc={announcementSrcdoc(announcement.body)}
          referrerPolicy="no-referrer"
          className="block h-[70vh] min-h-[24rem] w-full rounded-2xl border border-[var(--mn-border)] bg-[#1b2133] shadow-[var(--mn-shadow-stamp)]"
        />
      ) : (
        <p className="mn-paper p-6 text-center text-sm font-semibold text-[var(--mn-text-muted)]">{t(locale, "news.noBody")}</p>
      )}

      <div className="flex justify-start">{back}</div>
    </article>
  );
}
